import type { Express } from "express";
import multer from "multer";
import { db } from "../db";
import {
  agents, projects, users, aprMetricDefinitions, aprSnapshots, aprRows, agentLatestApr,
  type AprMetricDefinition,
} from "@shared/schema";
import { eq, desc, inArray, and } from "drizzle-orm";
import { requirePermission, requireFeature, grantsOf } from "../permissions";
import { sendError, errInternal, errNotFound, errInvalidId } from "../http-errors";
import { getScopedAgents } from "../scoping";
import { parseFirstSheet, sendXlsx } from "../excel";
import { normalizeDuration, normalizePercent, normalizeNumber, formatHms } from "../duration";
import { notifyUser, notifyRole } from "../notify";
import type { SessionUser } from "../auth";

const APR_SCOPE = {
  all: "apr.view_all",
  project: "apr.view_project",
  team: "apr.view_team",
  own: "apr.view_own",
};

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.originalname.toLowerCase().endsWith(".xlsx")
      || file.mimetype.includes("spreadsheetml")
      || file.mimetype === "application/vnd.ms-excel";
    if (ok) cb(null, true);
    else cb(new Error("xlsx_only"));
  },
});

/** Finds the column header that holds the employee id (required join key, §7.2). */
function findEmpHeader(headers: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase());
  const candidates = ["emp", "emp id", "employee id", "employee_id", "employeeid"];
  for (const c of candidates) {
    const idx = lower.indexOf(c);
    if (idx >= 0) return headers[idx];
  }
  return null;
}

/** Maps sheet headers → metric definitions using the editable per-project mapping. */
function buildHeaderMap(headers: string[], defs: AprMetricDefinition[]) {
  const map = new Map<string, AprMetricDefinition>(); // header → def
  const unmapped: string[] = [];
  for (const header of headers) {
    const h = header.trim().toLowerCase();
    const def = defs.find((d) =>
      (d.excelHeader ?? "").trim().toLowerCase() === h ||
      d.labelEn.trim().toLowerCase() === h ||
      d.key === h);
    if (def) map.set(header, def);
    else unmapped.push(header);
  }
  return { map, unmapped };
}

function normalizeMetric(def: AprMetricDefinition, value: unknown, timeFormat: "hh_mm_ss" | "seconds") {
  switch (def.valueType) {
    case "duration_seconds": return normalizeDuration(value, timeFormat);
    case "percent": return normalizePercent(value);
    case "integer":
    case "number": return normalizeNumber(value);
    case "duration_text":
    default: return value === null || value === undefined ? null : String(value);
  }
}

/** Formats a stored metric for display/export (durations always HH:MM:SS, §7.6). */
export function formatMetric(def: AprMetricDefinition | undefined, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (!def) return String(value);
  if (def.valueType === "duration_seconds" && typeof value === "number") return formatHms(value);
  if (def.valueType === "percent" && typeof value === "number") return `${(value * 100).toFixed(1)}%`;
  return String(value);
}

export function registerAprRoutes(app: Express) {
  // ── Metric definitions / mapping editor (§7.2) ───────────────────────────────
  app.get("/api/apr/metrics", requirePermission("apr.upload", "apr.view_all", "apr.view_project", "apr.view_team", "apr.view_own"), async (req, res) => {
    try {
      const projectId = Number(req.query.projectId);
      if (isNaN(projectId)) return errInvalidId(res);
      const defs = await db.select().from(aprMetricDefinitions)
        .where(eq(aprMetricDefinitions.projectId, projectId))
        .orderBy(aprMetricDefinitions.displayOrder);
      res.json(defs);
    } catch {
      errInternal(res);
    }
  });

  app.put("/api/apr/metrics/:id", requirePermission("apr.upload"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return errInvalidId(res);
      const { labelAr, labelEn, excelHeader, isVisible, displayOrder } = req.body ?? {};
      const updates: Partial<typeof aprMetricDefinitions.$inferInsert> = {};
      if (labelAr !== undefined) updates.labelAr = String(labelAr);
      if (labelEn !== undefined) updates.labelEn = String(labelEn);
      if (excelHeader !== undefined) updates.excelHeader = excelHeader ? String(excelHeader) : null;
      if (isVisible !== undefined) updates.isVisible = Boolean(isVisible);
      if (displayOrder !== undefined) updates.displayOrder = Number(displayOrder);
      const [updated] = await db.update(aprMetricDefinitions).set(updates)
        .where(eq(aprMetricDefinitions.id, id)).returning();
      if (!updated) return errNotFound(res);
      res.json(updated);
    } catch {
      errInternal(res);
    }
  });

  // ── Upload: preview (§7.1–7.3) ───────────────────────────────────────────────
  app.post("/api/apr/upload/preview", requirePermission("apr.upload"), excelUpload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return sendError(res, 400, "no_file", "لم يتم رفع أي ملف", "No file uploaded");
      }
      const projectId = Number(req.body.projectId);
      if (isNaN(projectId)) return errInvalidId(res);

      const { headers, rows } = parseFirstSheet(req.file.buffer);
      const empHeader = findEmpHeader(headers);
      if (!empHeader) {
        return sendError(res, 400, "missing_emp_column",
          "الملف لا يحتوي عمود Emp (الرقم الوظيفي)", "File is missing the Emp (employee id) column");
      }

      const defs = await db.select().from(aprMetricDefinitions)
        .where(eq(aprMetricDefinitions.projectId, projectId))
        .orderBy(aprMetricDefinitions.displayOrder);
      const { map: headerMap, unmapped } = buildHeaderMap(headers.filter((h) => h !== empHeader), defs);

      const allAgents = await db.select().from(agents);
      const agentByEmp = new Map(allAgents.map((a) => [a.employeeId.trim().toLowerCase(), a]));

      const recognized: any[] = [];
      const unknown: any[] = [];
      for (const row of rows) {
        const employeeId = String(row[empHeader] ?? "").trim();
        if (!employeeId) continue;
        const metrics: Record<string, unknown> = {};
        for (const [header, def] of headerMap.entries()) {
          metrics[def.key] = row[header] ?? null;
        }
        const agent = agentByEmp.get(employeeId.toLowerCase());
        if (agent) {
          recognized.push({ employeeId, agentId: agent.id, nameAr: agent.nameAr, nameEn: agent.nameEn, metrics });
        } else {
          unknown.push({ employeeId, metrics });
        }
      }

      res.json({
        empHeader,
        mappedColumns: Array.from(headerMap.entries()).map(([header, def]) => ({
          header, key: def.key, labelAr: def.labelAr, labelEn: def.labelEn,
        })),
        unmappedColumns: unmapped,
        recognized,
        unknown,
        totals: { rows: recognized.length + unknown.length, recognized: recognized.length, unknown: unknown.length },
      });
    } catch (err: any) {
      if (err?.message === "xlsx_only") {
        return sendError(res, 400, "invalid_file", "يُسمح فقط بملفات xlsx", "Only .xlsx files are allowed");
      }
      errInternal(res);
    }
  });

  // ── Upload: commit (§7.4) ────────────────────────────────────────────────────
  app.post("/api/apr/upload/commit", requirePermission("apr.upload"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const { projectId, asOfDate, timeFormat, fileName, rows, newAgents, skipped } = req.body ?? {};
      if (!projectId || !asOfDate || !["hh_mm_ss", "seconds"].includes(timeFormat) || !Array.isArray(rows)) {
        return sendError(res, 400, "missing_fields",
          "المشروع والتاريخ وصيغة الوقت مطلوبة", "Project, as-of date and time format are required");
      }
      if (new Date(asOfDate) > new Date()) {
        return sendError(res, 400, "future_date", "لا يمكن اختيار تاريخ مستقبلي", "As-of date cannot be in the future");
      }
      const [project] = await db.select().from(projects).where(eq(projects.id, Number(projectId)));
      if (!project) return errNotFound(res);

      const defs = await db.select().from(aprMetricDefinitions)
        .where(eq(aprMetricDefinitions.projectId, Number(projectId)));
      const defByKey = new Map(defs.map((d) => [d.key, d]));

      const summary = await db.transaction(async (tx) => {
        // 1. Inline-create the agents the WFM chose to add (§7.3).
        const createdAgents: { employeeId: string; id: number; nameAr: string; nameEn: string }[] = [];
        for (const na of (Array.isArray(newAgents) ? newAgents : [])) {
          if (!na?.employeeId?.trim() || (!na?.nameAr?.trim() && !na?.nameEn?.trim())) continue;
          const [created] = await tx.insert(agents).values({
            employeeId: String(na.employeeId).trim(),
            nameAr: String(na.nameAr || na.nameEn).trim(),
            nameEn: String(na.nameEn || na.nameAr).trim(),
            inboundId: na.inboundId ? String(na.inboundId).trim() : null,
            supervisorUserId: na.supervisorUserId ? Number(na.supervisorUserId) : null,
            projectId: Number(projectId),
            createdByUserId: me.id,
          }).onConflictDoNothing().returning();
          if (created) createdAgents.push({ employeeId: created.employeeId, id: created.id, nameAr: created.nameAr, nameEn: created.nameEn });
        }

        const allAgents = await tx.select().from(agents);
        const agentByEmp = new Map(allAgents.map((a) => [a.employeeId.trim().toLowerCase(), a]));
        const skippedSet = new Set((Array.isArray(skipped) ? skipped : []).map((s: string) => String(s).trim().toLowerCase()));

        // 2. The snapshot itself — historical, never overwritten (§4.6).
        const [snapshot] = await tx.insert(aprSnapshots).values({
          projectId: Number(projectId),
          asOfDate: String(asOfDate),
          timeFormat,
          uploadedByUserId: me.id,
          fileName: fileName ? String(fileName) : null,
          rowCount: 0,
        }).returning();

        // 3. Rows for every recognized agent.
        let added = 0;
        let skippedCount = 0;
        const seenAgentIds = new Set<number>();
        for (const row of rows) {
          const emp = String(row?.employeeId ?? "").trim();
          if (!emp) continue;
          if (skippedSet.has(emp.toLowerCase())) { skippedCount++; continue; }
          const agent = agentByEmp.get(emp.toLowerCase());
          if (!agent) { skippedCount++; continue; }
          if (seenAgentIds.has(agent.id)) continue; // duplicate emp row in file
          seenAgentIds.add(agent.id);

          const metrics: Record<string, string | number | null> = {};
          for (const [key, raw] of Object.entries(row?.metrics ?? {})) {
            const def = defByKey.get(key);
            if (!def) continue;
            metrics[key] = normalizeMetric(def, raw, timeFormat) as string | number | null;
          }
          const [inserted] = await tx.insert(aprRows).values({
            snapshotId: snapshot.id,
            agentId: agent.id,
            metrics,
          }).returning();

          // 4. Latest-pointer upsert (§4.8) — only move forward in time.
          await tx.insert(agentLatestApr).values({
            agentId: agent.id,
            snapshotId: snapshot.id,
            rowId: inserted.id,
            asOfDate: String(asOfDate),
            updatedAt: new Date(),
          }).onConflictDoUpdate({
            target: agentLatestApr.agentId,
            set: { snapshotId: snapshot.id, rowId: inserted.id, asOfDate: String(asOfDate), updatedAt: new Date() },
          });
          added++;
        }

        await tx.update(aprSnapshots).set({ rowCount: added }).where(eq(aprSnapshots.id, snapshot.id));
        return { added, skipped: skippedCount, newAgents: createdAgents };
      });

      // Notifications outside the transaction (§7.3).
      for (const a of summary.newAgents) {
        await notifyRole("admin", {
          type: "agent_added",
          titleAr: "تمت إضافة وكيل جديد أثناء رفع APR",
          titleEn: "New agent added during APR upload",
          bodyAr: `أضاف ${me.displayNameAr} الوكيل ${a.nameAr} (${a.employeeId})`,
          bodyEn: `${me.displayNameEn} added agent ${a.nameEn} (${a.employeeId})`,
          linkPath: "/agents",
        });
      }
      if (summary.skipped > 0) {
        await notifyUser({
          userId: me.id,
          type: "agent_skipped",
          titleAr: "صفوف متخطّاة في رفع APR",
          titleEn: "Skipped rows in APR upload",
          bodyAr: `تم تخطي ${summary.skipped} صف لعدم التعرف على الرقم الوظيفي`,
          bodyEn: `${summary.skipped} rows were skipped (unrecognized employee id)`,
          linkPath: "/apr",
        });
      }

      res.status(201).json({ added: summary.added, skipped: summary.skipped, new_agents: summary.newAgents.length });
    } catch {
      errInternal(res);
    }
  });

  // ── Latest view, scoped per role (§7.5) ─────────────────────────────────────
  app.get("/api/apr/latest", requirePermission("apr.view_all", "apr.view_project", "apr.view_team", "apr.view_own"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const scoped = await getScopedAgents(me, grantsOf(req), APR_SCOPE);
      if (scoped.length === 0) return res.json({ rows: [], metricDefs: [] });

      const agentIds = scoped.map((a) => a.id);
      const latest = await db.select().from(agentLatestApr).where(inArray(agentLatestApr.agentId, agentIds));
      const rowIds = latest.map((l) => l.rowId);
      const dataRows = rowIds.length > 0
        ? await db.select().from(aprRows).where(inArray(aprRows.id, rowIds))
        : [];
      const rowById = new Map(dataRows.map((r) => [r.id, r]));
      const snapshotIds = Array.from(new Set(latest.map((l) => l.snapshotId)));
      const snaps = snapshotIds.length > 0
        ? await db.select().from(aprSnapshots).where(inArray(aprSnapshots.id, snapshotIds))
        : [];
      const snapById = new Map(snaps.map((s) => [s.id, s]));
      const latestByAgent = new Map(latest.map((l) => [l.agentId, l]));

      const supervisorRows = await db.select().from(users).where(eq(users.role, "supervisor"));
      const supervisorById = new Map(supervisorRows.map((s) => [s.id, s]));
      const projectRows = await db.select().from(projects);
      const projectById = new Map(projectRows.map((p) => [p.id, p]));

      const projectIds = Array.from(new Set(scoped.map((a) => a.projectId)));
      const metricDefs = await db.select().from(aprMetricDefinitions)
        .where(and(inArray(aprMetricDefinitions.projectId, projectIds), eq(aprMetricDefinitions.isVisible, true)))
        .orderBy(aprMetricDefinitions.displayOrder);

      const result = scoped.map((a) => {
        const l = latestByAgent.get(a.id);
        const row = l ? rowById.get(l.rowId) : undefined;
        const snap = l ? snapById.get(l.snapshotId) : undefined;
        return {
          agentId: a.id,
          employeeId: a.employeeId,
          nameAr: a.nameAr,
          nameEn: a.nameEn,
          projectId: a.projectId,
          projectNameAr: projectById.get(a.projectId)?.nameAr ?? null,
          projectNameEn: projectById.get(a.projectId)?.nameEn ?? null,
          supervisorUserId: a.supervisorUserId,
          supervisorNameAr: a.supervisorUserId ? supervisorById.get(a.supervisorUserId)?.displayNameAr ?? null : null,
          supervisorNameEn: a.supervisorUserId ? supervisorById.get(a.supervisorUserId)?.displayNameEn ?? null : null,
          asOfDate: l?.asOfDate ?? null,
          uploadedAt: snap?.createdAt ?? null,
          metrics: row?.metrics ?? null,
        };
      });

      res.json({ rows: result, metricDefs });
    } catch {
      errInternal(res);
    }
  });

  // ── History (§7.5 WFM) ───────────────────────────────────────────────────────
  app.get("/api/apr/snapshots", requireFeature("apr.history"), requirePermission("apr.history_view"), async (_req, res) => {
    try {
      const snaps = await db
        .select({
          id: aprSnapshots.id,
          projectId: aprSnapshots.projectId,
          asOfDate: aprSnapshots.asOfDate,
          timeFormat: aprSnapshots.timeFormat,
          fileName: aprSnapshots.fileName,
          rowCount: aprSnapshots.rowCount,
          createdAt: aprSnapshots.createdAt,
          uploadedByAr: users.displayNameAr,
          uploadedByEn: users.displayNameEn,
          projectNameAr: projects.nameAr,
          projectNameEn: projects.nameEn,
        })
        .from(aprSnapshots)
        .leftJoin(users, eq(aprSnapshots.uploadedByUserId, users.id))
        .leftJoin(projects, eq(aprSnapshots.projectId, projects.id))
        .orderBy(desc(aprSnapshots.createdAt));
      res.json(snaps);
    } catch {
      errInternal(res);
    }
  });

  app.get("/api/apr/snapshots/:id", requireFeature("apr.history"), requirePermission("apr.history_view"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return errInvalidId(res);
      const [snap] = await db.select().from(aprSnapshots).where(eq(aprSnapshots.id, id));
      if (!snap) return errNotFound(res);
      const rows = await db
        .select({
          agentId: aprRows.agentId,
          metrics: aprRows.metrics,
          employeeId: agents.employeeId,
          nameAr: agents.nameAr,
          nameEn: agents.nameEn,
        })
        .from(aprRows)
        .leftJoin(agents, eq(aprRows.agentId, agents.id))
        .where(eq(aprRows.snapshotId, id));
      const metricDefs = await db.select().from(aprMetricDefinitions)
        .where(and(eq(aprMetricDefinitions.projectId, snap.projectId), eq(aprMetricDefinitions.isVisible, true)))
        .orderBy(aprMetricDefinitions.displayOrder);
      res.json({ snapshot: snap, rows, metricDefs });
    } catch {
      errInternal(res);
    }
  });

  // ── Export (§7.5) ────────────────────────────────────────────────────────────
  app.get("/api/apr/export", requireFeature("apr.export"), requirePermission("apr.export"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const lang = me.preferredLanguage === "en" ? "en" : "ar";

      if (req.query.snapshotId) {
        // Historical snapshot export needs history rights too.
        const grants = grantsOf(req);
        if (!grants.has("apr.history_view")) {
          return sendError(res, 403, "forbidden", "ليس لديك صلاحية لسجل الرفعات", "No permission for APR history");
        }
        const id = Number(req.query.snapshotId);
        if (isNaN(id)) return errInvalidId(res);
        const [snap] = await db.select().from(aprSnapshots).where(eq(aprSnapshots.id, id));
        if (!snap) return errNotFound(res);
        const defs = await db.select().from(aprMetricDefinitions)
          .where(and(eq(aprMetricDefinitions.projectId, snap.projectId), eq(aprMetricDefinitions.isVisible, true)))
          .orderBy(aprMetricDefinitions.displayOrder);
        const rows = await db
          .select({ metrics: aprRows.metrics, employeeId: agents.employeeId, nameAr: agents.nameAr, nameEn: agents.nameEn })
          .from(aprRows)
          .leftJoin(agents, eq(aprRows.agentId, agents.id))
          .where(eq(aprRows.snapshotId, id));
        const exportRows = rows.map((r) => {
          const out: Record<string, unknown> = {
            Emp: r.employeeId,
            Name: lang === "ar" ? r.nameAr : r.nameEn,
          };
          for (const def of defs) {
            out[lang === "ar" ? def.labelAr : def.labelEn] = formatMetric(def, (r.metrics as any)?.[def.key]);
          }
          return out;
        });
        return sendXlsx(res, `apr-snapshot-${snap.asOfDate}.xlsx`, [{ name: "APR", rows: exportRows }]);
      }

      // Current scoped latest view.
      const scoped = await getScopedAgents(me, grantsOf(req), APR_SCOPE);
      const agentIds = scoped.map((a) => a.id);
      const latest = agentIds.length > 0
        ? await db.select().from(agentLatestApr).where(inArray(agentLatestApr.agentId, agentIds))
        : [];
      const rowIds = latest.map((l) => l.rowId);
      const dataRows = rowIds.length > 0 ? await db.select().from(aprRows).where(inArray(aprRows.id, rowIds)) : [];
      const rowById = new Map(dataRows.map((r) => [r.id, r]));
      const latestByAgent = new Map(latest.map((l) => [l.agentId, l]));
      const projectIds = Array.from(new Set(scoped.map((a) => a.projectId)));
      const defs = projectIds.length > 0
        ? await db.select().from(aprMetricDefinitions)
            .where(and(inArray(aprMetricDefinitions.projectId, projectIds), eq(aprMetricDefinitions.isVisible, true)))
            .orderBy(aprMetricDefinitions.displayOrder)
        : [];
      const dedupedDefs = defs.filter((d, i) => defs.findIndex((x) => x.key === d.key) === i);

      const exportRows = scoped.map((a) => {
        const l = latestByAgent.get(a.id);
        const row = l ? rowById.get(l.rowId) : undefined;
        const out: Record<string, unknown> = {
          Emp: a.employeeId,
          Name: lang === "ar" ? a.nameAr : a.nameEn,
          Date: l?.asOfDate ?? "",
        };
        for (const def of dedupedDefs) {
          out[lang === "ar" ? def.labelAr : def.labelEn] = formatMetric(def, (row?.metrics as any)?.[def.key]);
        }
        return out;
      });
      sendXlsx(res, `apr-latest-${new Date().toISOString().slice(0, 10)}.xlsx`, [{ name: "APR", rows: exportRows }]);
    } catch {
      errInternal(res);
    }
  });
}
