import type { Express } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db } from "../db";
import { qcEntries, agents } from "@shared/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { requirePermission, requireFeature, grantsOf } from "../permissions";
import { sendError, errInternal, errNotFound, errInvalidId } from "../http-errors";
import type { SessionUser } from "../auth";

const uploadDir = path.join(process.cwd(), "uploads", "audio");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("audio/") || file.mimetype === "video/mp4") cb(null, true);
    else cb(new Error("audio_only"));
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

/** Visibility: evaluators see what they created; approvers see all;
 *  team approvers see entries whose agent belongs to their team. */
async function scopedEntries(req: any) {
  const me = req.user as SessionUser;
  const grants = grantsOf(req);
  const all = await db
    .select({
      entry: qcEntries,
      agentNameAr: agents.nameAr,
      agentNameEn: agents.nameEn,
      employeeId: agents.employeeId,
      supervisorUserId: agents.supervisorUserId,
    })
    .from(qcEntries)
    .leftJoin(agents, eq(qcEntries.agentId, agents.id))
    .orderBy(desc(qcEntries.createdAt));

  let visible = all;
  if (grants.has("qc.approve")) {
    // all
  } else if (grants.has("qc.approve_team")) {
    visible = all.filter((r) => r.supervisorUserId === me.id);
  } else if (grants.has("qc.evaluate")) {
    visible = all.filter((r) => r.entry.createdByUserId === me.id);
  } else {
    visible = [];
  }
  return visible.map((r) => ({
    ...r.entry,
    agentNameAr: r.agentNameAr,
    agentNameEn: r.agentNameEn,
    employeeId: r.employeeId,
  }));
}

export function registerQcRoutes(app: Express) {
  app.post("/api/upload/audio", requireFeature("menu.qc"), requirePermission("qc.evaluate"), audioUpload.single("audio"), (req, res) => {
    if (!req.file) return sendError(res, 400, "no_file", "لم يتم رفع أي ملف", "No file uploaded");
    res.json({ url: `/uploads/audio/${req.file.filename}` });
  });

  app.get("/api/qc/entries", requireFeature("menu.qc"), requirePermission("qc.evaluate", "qc.approve", "qc.approve_team"), async (req, res) => {
    try {
      res.json(await scopedEntries(req));
    } catch {
      errInternal(res);
    }
  });

  app.post("/api/qc/entries", requireFeature("menu.qc"), requirePermission("qc.evaluate"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const b = req.body ?? {};
      const required = ["agentId", "callDate", "contactNumber", "caseNumber", "actionRequired",
        "qualityInternal", "qualityExternal", "customerSatisfaction", "defectReason", "requiredActionDetail"];
      for (const f of required) {
        if (b[f] === undefined || b[f] === null || String(b[f]).trim() === "") {
          return sendError(res, 400, "missing_fields", `الحقل ${f} مطلوب`, `Field ${f} is required`);
        }
      }
      const [agent] = await db.select().from(agents).where(eq(agents.id, Number(b.agentId)));
      if (!agent) return sendError(res, 400, "invalid_agent", "الوكيل غير موجود", "Agent not found");
      const [created] = await db.insert(qcEntries).values({
        agentId: agent.id,
        callDate: String(b.callDate),
        contactNumber: String(b.contactNumber),
        caseNumber: String(b.caseNumber),
        actionRequired: String(b.actionRequired),
        qualityInternal: String(b.qualityInternal),
        qualityExternal: String(b.qualityExternal),
        customerSatisfaction: String(b.customerSatisfaction),
        defectReason: String(b.defectReason),
        requiredActionDetail: String(b.requiredActionDetail),
        audioUrl: b.audioUrl ? String(b.audioUrl) : null,
        status: "pending_supervisor",
        createdByUserId: me.id,
      }).returning();
      res.status(201).json(created);
    } catch {
      errInternal(res);
    }
  });

  app.put("/api/qc/entries/:id", requireFeature("menu.qc"), requirePermission("qc.evaluate", "qc.approve"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const grants = grantsOf(req);
      const id = Number(req.params.id);
      if (isNaN(id)) return errInvalidId(res);
      const [entry] = await db.select().from(qcEntries).where(eq(qcEntries.id, id));
      if (!entry) return errNotFound(res);
      if (!grants.has("qc.approve") && entry.createdByUserId !== me.id) {
        return sendError(res, 403, "forbidden", "يمكنك تعديل تقييماتك فقط", "You may only edit your own entries");
      }
      const editable = ["callDate", "contactNumber", "caseNumber", "actionRequired", "qualityInternal",
        "qualityExternal", "customerSatisfaction", "defectReason", "requiredActionDetail", "audioUrl", "agentId"];
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      for (const f of editable) {
        if (req.body?.[f] !== undefined) updates[f] = f === "agentId" ? Number(req.body[f]) : req.body[f];
      }
      const [updated] = await db.update(qcEntries).set(updates as any).where(eq(qcEntries.id, id)).returning();
      res.json(updated);
    } catch {
      errInternal(res);
    }
  });

  app.patch("/api/qc/entries/:id/review", requireFeature("menu.qc"), requirePermission("qc.approve", "qc.approve_team"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const grants = grantsOf(req);
      const id = Number(req.params.id);
      if (isNaN(id)) return errInvalidId(res);
      const { action, comment } = req.body ?? {};
      if (!["approved", "rejected"].includes(action)) {
        return sendError(res, 400, "invalid_action", "إجراء غير صالح", "Invalid action");
      }
      if (action === "rejected" && !comment?.trim()) {
        return sendError(res, 400, "comment_required", "تعليق مطلوب عند الرفض", "A comment is required when rejecting");
      }
      const [entry] = await db.select().from(qcEntries).where(eq(qcEntries.id, id));
      if (!entry) return errNotFound(res);
      if (!grants.has("qc.approve")) {
        const [agent] = await db.select().from(agents).where(eq(agents.id, entry.agentId));
        if (agent?.supervisorUserId !== me.id) {
          return sendError(res, 403, "forbidden", "هذا التقييم ليس ضمن فريقك", "This entry is not in your team");
        }
      }
      const [updated] = await db.update(qcEntries).set({
        status: action,
        supervisorComment: comment?.trim() || null,
        updatedAt: new Date(),
      }).where(eq(qcEntries.id, id)).returning();
      res.json(updated);
    } catch {
      errInternal(res);
    }
  });

  app.patch("/api/qc/entries/:id/resubmit", requireFeature("menu.qc"), requirePermission("qc.evaluate"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const id = Number(req.params.id);
      if (isNaN(id)) return errInvalidId(res);
      const { qualityNote } = req.body ?? {};
      if (!qualityNote?.trim()) {
        return sendError(res, 400, "note_required", "يجب إدخال ملاحظة عند إعادة الإرسال", "A note is required on resubmit");
      }
      const [entry] = await db.select().from(qcEntries).where(eq(qcEntries.id, id));
      if (!entry) return errNotFound(res);
      if (entry.createdByUserId !== me.id && !grantsOf(req).has("qc.approve")) {
        return sendError(res, 403, "forbidden", "يمكنك إعادة إرسال تقييماتك فقط", "You may only resubmit your own entries");
      }
      if (entry.status !== "rejected") {
        return sendError(res, 400, "invalid_status", "يمكن إعادة إرسال المرفوض فقط", "Only rejected entries can be resubmitted");
      }
      const [updated] = await db.update(qcEntries).set({
        status: "pending_supervisor",
        qualityNote: qualityNote.trim(),
        supervisorComment: null,
        updatedAt: new Date(),
      }).where(eq(qcEntries.id, id)).returning();
      res.json(updated);
    } catch {
      errInternal(res);
    }
  });

  app.delete("/api/qc/entries/:id", requireFeature("menu.qc"), requirePermission("qc.evaluate", "qc.approve"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const grants = grantsOf(req);
      const id = Number(req.params.id);
      if (isNaN(id)) return errInvalidId(res);
      const [entry] = await db.select().from(qcEntries).where(eq(qcEntries.id, id));
      if (!entry) return errNotFound(res);
      if (!grants.has("qc.approve") && entry.createdByUserId !== me.id) {
        return sendError(res, 403, "forbidden", "يمكنك حذف تقييماتك فقط", "You may only delete your own entries");
      }
      await db.delete(qcEntries).where(eq(qcEntries.id, id));
      res.status(204).end();
    } catch {
      errInternal(res);
    }
  });
}
