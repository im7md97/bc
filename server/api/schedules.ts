import type { Express } from "express";
import multer from "multer";
import { db } from "../db";
import {
  schedules, scheduleSettings, shiftSwapRequests, agents, projects, users,
  type WeeklyShifts, type ShiftDay, SWAP_STATUSES,
} from "@shared/schema";
import { eq, inArray, and, or } from "drizzle-orm";
import { requirePermission, requireFeature, grantsOf } from "../permissions";
import { sendError, errInternal, errNotFound, errInvalidId } from "../http-errors";
import { getScopedAgents } from "../scoping";
import { parseFirstSheet } from "../excel";
import { sendSchedulesTemplate, sendSchedulesByDateTemplate } from "../templates";
import { autoScheduleBreaks, parseShiftCell, DAY_KEYS, readShifts, writeShifts, weekStartAndDay } from "../schedule-utils";
import { notifyUser, notifyRole } from "../notify";
import type { SessionUser } from "../auth";

const SCHED_SCOPE = {
  all: "schedule.view_all",   // separate from manage — read-only "see all"
  project: "schedule.view_project",
  team: "schedule.view_team",
  own: "schedule.view_own",
};

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.originalname.toLowerCase().endsWith(".xlsx")
      || file.mimetype.includes("spreadsheetml");
    if (ok) cb(null, true);
    else cb(new Error("xlsx_only"));
  },
});

function findEmpHeader(headers: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase());
  for (const c of ["emp", "emp id", "employee id", "employeeid", "employee_id", "الرقم الوظيفي"]) {
    const i = lower.indexOf(c);
    if (i >= 0) return headers[i];
  }
  return null;
}

const DAY_HEADERS: Record<string, string[]> = {
  sun: ["sun", "sunday", "الأحد", "الاحد"],
  mon: ["mon", "monday", "الإثنين", "الاثنين"],
  tue: ["tue", "tuesday", "الثلاثاء"],
  wed: ["wed", "wednesday", "الأربعاء", "الاربعاء"],
  thu: ["thu", "thursday", "الخميس"],
  fri: ["fri", "friday", "الجمعة"],
  sat: ["sat", "saturday", "السبت"],
};

function mapDayHeaders(headers: string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const day of DAY_KEYS) {
    const candidates = DAY_HEADERS[day].map((s) => s.toLowerCase());
    const match = headers.find((h) => candidates.includes(h.toLowerCase()));
    out[day] = match ?? null;
  }
  return out;
}

export function registerScheduleRoutes(app: Express) {
  // ── List (scoped) ────────────────────────────────────────────────────────────
  app.get(
    "/api/schedules",
    requireFeature("menu.schedule"),
    requirePermission("schedule.manage", "schedule.view_team", "schedule.view_project", "schedule.view_own"),
    async (req, res) => {
      try {
        const me = req.user as SessionUser;
        const weekStart = typeof req.query.weekStart === "string" ? req.query.weekStart : "";
        const scoped = await getScopedAgents(me, grantsOf(req), SCHED_SCOPE);
        if (scoped.length === 0) return res.json({ agents: [], schedules: [], settings: null });
        const agentIds = scoped.map((a) => a.id);

        let rows = await db.select().from(schedules).where(inArray(schedules.agentId, agentIds));
        if (weekStart) rows = rows.filter((r) => r.weekStart === weekStart);

        const projectRows = await db.select().from(projects);
        const projectById = new Map(projectRows.map((p) => [p.id, p]));

        // Single project settings (covers the common single-project deployment).
        let settings = null as any;
        if (weekStart && scoped.length > 0) {
          const projectId = scoped[0].projectId;
          const [s] = await db.select().from(scheduleSettings).where(and(
            eq(scheduleSettings.projectId, projectId),
            eq(scheduleSettings.weekStart, weekStart),
          ));
          settings = s ?? { projectId, weekStart, breaksPerShift: 1, breakDurationMin: 30, maxConcurrentBreaks: 2 };
        }

        res.json({
          agents: scoped.map((a) => ({
            id: a.id, employeeId: a.employeeId, nameAr: a.nameAr, nameEn: a.nameEn,
            projectId: a.projectId, supervisorUserId: a.supervisorUserId,
            projectNameAr: projectById.get(a.projectId)?.nameAr ?? null,
            projectNameEn: projectById.get(a.projectId)?.nameEn ?? null,
          })),
          schedules: rows.map((r) => ({
            id: r.id, agentId: r.agentId, weekStart: r.weekStart,
            shifts: readShifts(r.shiftsJson), updatedAt: r.updatedAt,
          })),
          settings,
        });
      } catch {
        errInternal(res);
      }
    },
  );

  // ── Upsert one agent / one week ──────────────────────────────────────────────
  app.post(
    "/api/schedules",
    requireFeature("menu.schedule"),
    requirePermission("schedule.manage"),
    async (req, res) => {
      try {
        const me = req.user as SessionUser;
        const { agentId, weekStart, shifts } = req.body ?? {};
        if (!agentId || !weekStart) {
          return sendError(res, 400, "missing_fields",
            "الوكيل وتاريخ بداية الأسبوع مطلوبان", "agentId and weekStart are required");
        }
        const [agent] = await db.select().from(agents).where(eq(agents.id, Number(agentId)));
        if (!agent) return sendError(res, 400, "invalid_agent", "الوكيل غير موجود", "Agent not found");

        const managesAll = grantsOf(req).has("agent.list_all");
        if (!managesAll && agent.supervisorUserId !== me.id) {
          return sendError(res, 403, "forbidden",
            "هذا الوكيل ليس ضمن فريقك", "This agent is not in your team");
        }

        const shiftsJson = typeof shifts === "string" ? shifts : JSON.stringify(shifts ?? {});
        const [existing] = await db.select().from(schedules).where(and(
          eq(schedules.agentId, Number(agentId)),
          eq(schedules.weekStart, String(weekStart)),
        ));
        if (existing) {
          const [updated] = await db.update(schedules).set({
            shiftsJson, updatedAt: new Date(),
          }).where(eq(schedules.id, existing.id)).returning();
          return res.json(updated);
        }
        const [created] = await db.insert(schedules).values({
          agentId: Number(agentId),
          weekStart: String(weekStart),
          shiftsJson,
          createdByUserId: me.id,
        }).returning();
        res.status(201).json(created);
      } catch {
        errInternal(res);
      }
    },
  );

  app.delete(
    "/api/schedules/:id",
    requireFeature("menu.schedule"),
    requirePermission("schedule.manage"),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return errInvalidId(res);
        const [row] = await db.select().from(schedules).where(eq(schedules.id, id));
        if (!row) return errNotFound(res);
        await db.delete(schedules).where(eq(schedules.id, id));
        res.status(204).end();
      } catch {
        errInternal(res);
      }
    },
  );

  // ── Break policy ─────────────────────────────────────────────────────────────
  app.put(
    "/api/schedules/settings",
    requireFeature("menu.schedule"),
    requirePermission("schedule.policy_edit"),
    async (req, res) => {
      try {
        const me = req.user as SessionUser;
        const { projectId, weekStart, breaksPerShift, breakDurationMin, maxConcurrentBreaks } = req.body ?? {};
        if (!projectId || !weekStart) {
          return sendError(res, 400, "missing_fields",
            "المشروع وتاريخ بداية الأسبوع مطلوبان", "projectId and weekStart are required");
        }
        const values = {
          projectId: Number(projectId),
          weekStart: String(weekStart),
          breaksPerShift: Math.max(0, Math.min(6, Number(breaksPerShift) || 1)),
          breakDurationMin: Math.max(5, Math.min(180, Number(breakDurationMin) || 30)),
          maxConcurrentBreaks: Math.max(1, Math.min(50, Number(maxConcurrentBreaks) || 2)),
          updatedByUserId: me.id,
          updatedAt: new Date(),
        };
        const [existing] = await db.select().from(scheduleSettings).where(and(
          eq(scheduleSettings.projectId, values.projectId),
          eq(scheduleSettings.weekStart, values.weekStart),
        ));
        if (existing) {
          const [updated] = await db.update(scheduleSettings).set(values)
            .where(eq(scheduleSettings.id, existing.id)).returning();
          return res.json(updated);
        }
        const [created] = await db.insert(scheduleSettings).values(values).returning();
        res.status(201).json(created);
      } catch {
        errInternal(res);
      }
    },
  );

  // ── Auto-break scheduler ─────────────────────────────────────────────────────
  app.post(
    "/api/schedules/auto-breaks",
    requireFeature("menu.schedule"),
    requirePermission("schedule.auto_breaks"),
    async (req, res) => {
      try {
        const { projectId, weekStart } = req.body ?? {};
        if (!projectId || !weekStart) {
          return sendError(res, 400, "missing_fields",
            "المشروع وتاريخ بداية الأسبوع مطلوبان", "projectId and weekStart are required");
        }
        const [settings] = await db.select().from(scheduleSettings).where(and(
          eq(scheduleSettings.projectId, Number(projectId)),
          eq(scheduleSettings.weekStart, String(weekStart)),
        ));
        const policy = settings ?? { breaksPerShift: 1, breakDurationMin: 30, maxConcurrentBreaks: 2 };

        const projectAgents = await db.select().from(agents).where(eq(agents.projectId, Number(projectId)));
        const agentIds = projectAgents.map((a) => a.id);
        const rows = agentIds.length > 0
          ? await db.select().from(schedules).where(and(
              inArray(schedules.agentId, agentIds),
              eq(schedules.weekStart, String(weekStart)),
            ))
          : [];
        const rowByAgent = new Map(rows.map((r) => [r.agentId, r]));

        let updatedCount = 0;
        for (const day of DAY_KEYS) {
          const roster: { agentId: number; start: string; end: string }[] = [];
          for (const row of rows) {
            const shift = readShifts(row.shiftsJson)[day];
            if (!shift?.start || !shift?.end || shift.isOff) continue;
            roster.push({ agentId: row.agentId, start: shift.start, end: shift.end });
          }
          if (roster.length === 0) continue;
          const assignments = autoScheduleBreaks(
            roster, policy.breaksPerShift, policy.breakDurationMin, policy.maxConcurrentBreaks,
          );
          for (const [agentId, breaks] of assignments.entries()) {
            const row = rowByAgent.get(agentId);
            if (!row) continue;
            const shifts = readShifts(row.shiftsJson);
            shifts[day] = { ...shifts[day], breaks };
            row.shiftsJson = writeShifts(shifts);
          }
        }

        for (const row of rows) {
          await db.update(schedules).set({
            shiftsJson: row.shiftsJson, updatedAt: new Date(),
          }).where(eq(schedules.id, row.id));
          updatedCount++;
        }
        res.json({ updated: updatedCount, policy });
      } catch (err) {
        console.error("[schedules.auto-breaks]", err);
        errInternal(res);
      }
    },
  );

  // ── Excel template download (any role that can manage / view schedules) ────
  app.get(
    "/api/schedules/template",
    requireFeature("menu.schedule"),
    requirePermission("schedule.import", "schedule.manage"),
    (_req, res) => sendSchedulesTemplate(res),
  );

  app.get(
    "/api/schedules/template-bidate",
    requireFeature("menu.schedule"),
    requirePermission("schedule.import", "schedule.manage"),
    (_req, res) => sendSchedulesByDateTemplate(res),
  );

  // ── Peers list for shift-swap (same project as caller, excluding self) ─────
  app.get(
    "/api/schedules/peers",
    requireFeature("menu.schedule"),
    requirePermission("schedule.swap_request"),
    async (req, res) => {
      try {
        const me = req.user as SessionUser;
        const [myAgent] = await db.select().from(agents).where(eq(agents.userId, me.id));
        if (!myAgent) return res.json([]);
        const peers = await db.select().from(agents).where(and(
          eq(agents.projectId, myAgent.projectId),
          eq(agents.isActive, true),
        ));
        res.json(peers.filter((p) => p.id !== myAgent.id).map((p) => ({
          id: p.id, employeeId: p.employeeId, nameAr: p.nameAr, nameEn: p.nameEn,
        })));
      } catch {
        errInternal(res);
      }
    },
  );

  // ── Excel import ─────────────────────────────────────────────────────────────
  app.post(
    "/api/schedules/import",
    requireFeature("menu.schedule"),
    requirePermission("schedule.import"),
    excelUpload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) return sendError(res, 400, "no_file", "لم يتم رفع أي ملف", "No file uploaded");
        const me = req.user as SessionUser;
        const { projectId, weekStart } = req.body ?? {};
        if (!projectId || !weekStart) {
          return sendError(res, 400, "missing_fields",
            "المشروع وتاريخ بداية الأسبوع مطلوبان", "projectId and weekStart are required");
        }
        const { headers, rows } = parseFirstSheet(req.file.buffer);
        const empHeader = findEmpHeader(headers);
        if (!empHeader) {
          return sendError(res, 400, "missing_emp_column",
            "الملف لا يحتوي عمود Emp", "File is missing the Emp column");
        }
        const dayHeaders = mapDayHeaders(headers.filter((h) => h !== empHeader));

        const allAgents = await db.select().from(agents)
          .where(eq(agents.projectId, Number(projectId)));
        const agentByEmp = new Map(allAgents.map((a) => [a.employeeId.trim().toLowerCase(), a]));

        let imported = 0;
        let skipped = 0;
        const unknown: string[] = [];
        const errors: { emp: string; day: string; raw: string }[] = [];

        for (const row of rows) {
          const emp = String(row[empHeader] ?? "").trim();
          if (!emp) continue;
          const agent = agentByEmp.get(emp.toLowerCase());
          if (!agent) { unknown.push(emp); skipped++; continue; }

          const weekly: WeeklyShifts = {};
          for (const day of DAY_KEYS) {
            const header = dayHeaders[day];
            if (!header) continue;
            const raw = row[header];
            if (raw === undefined || raw === null || String(raw).trim() === "") continue;
            const parsed = parseShiftCell(raw);
            if (parsed === null) {
              errors.push({ emp, day, raw: String(raw) });
              continue;
            }
            weekly[day] = parsed;
          }

          const [existing] = await db.select().from(schedules).where(and(
            eq(schedules.agentId, agent.id),
            eq(schedules.weekStart, String(weekStart)),
          ));
          if (existing) {
            await db.update(schedules).set({
              shiftsJson: writeShifts(weekly), updatedAt: new Date(),
            }).where(eq(schedules.id, existing.id));
          } else {
            await db.insert(schedules).values({
              agentId: agent.id,
              weekStart: String(weekStart),
              shiftsJson: writeShifts(weekly),
              createdByUserId: me.id,
            });
          }
          imported++;
        }

        res.json({ imported, skipped, unknown, errors });
      } catch (err: any) {
        if (err?.message === "xlsx_only") {
          return sendError(res, 400, "invalid_file", "يُسمح فقط بملفات xlsx", "Only .xlsx files are allowed");
        }
        console.error("[schedules.import]", err);
        errInternal(res);
      }
    },
  );

  // ── Multi-week / by-date Excel import ────────────────────────────────────────
  // Excel has one row per agent. Headers: Emp + N date columns (YYYY-MM-DD).
  // The server groups dates by week_start and writes one schedules row per
  // agent per week with the matching days filled in.
  app.post(
    "/api/schedules/import-by-date",
    requireFeature("menu.schedule"),
    requirePermission("schedule.import"),
    excelUpload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) return sendError(res, 400, "no_file", "لم يتم رفع أي ملف", "No file uploaded");
        const me = req.user as SessionUser;
        const { projectId } = req.body ?? {};
        if (!projectId) {
          return sendError(res, 400, "missing_fields", "المشروع مطلوب", "projectId is required");
        }
        const { headers, rows } = parseFirstSheet(req.file.buffer);
        const empHeader = findEmpHeader(headers);
        if (!empHeader) {
          return sendError(res, 400, "missing_emp_column",
            "الملف لا يحتوي عمود Emp", "File is missing the Emp column");
        }
        // Date columns: any header matching YYYY-MM-DD (or an Excel date-like value)
        const dateColumns: { header: string; weekStart: string; dayKey: string; date: string }[] = [];
        for (const h of headers.filter((x) => x !== empHeader)) {
          const m = weekStartAndDay(h.trim());
          if (m) dateColumns.push({ header: h, weekStart: m.weekStart, dayKey: m.dayKey, date: h.trim() });
        }
        if (dateColumns.length === 0) {
          return sendError(res, 400, "no_date_columns",
            "الملف لا يحتوي أعمدة تواريخ صالحة (YYYY-MM-DD)",
            "File has no valid date columns (YYYY-MM-DD)");
        }

        const allAgents = await db.select().from(agents)
          .where(eq(agents.projectId, Number(projectId)));
        const agentByEmp = new Map(allAgents.map((a) => [a.employeeId.trim().toLowerCase(), a]));

        // For each (agent, weekStart) we accumulate a WeeklyShifts object.
        const buckets = new Map<string, { agentId: number; weekStart: string; shifts: WeeklyShifts }>();
        let imported = 0;
        let cellErrors = 0;
        const unknown: string[] = [];

        for (const row of rows) {
          const emp = String(row[empHeader] ?? "").trim();
          if (!emp) continue;
          const agent = agentByEmp.get(emp.toLowerCase());
          if (!agent) { unknown.push(emp); continue; }
          for (const col of dateColumns) {
            const raw = row[col.header];
            if (raw === undefined || raw === null || String(raw).trim() === "") continue;
            const parsed = parseShiftCell(raw);
            if (parsed === null) { cellErrors++; continue; }
            const bucketKey = `${agent.id}|${col.weekStart}`;
            if (!buckets.has(bucketKey)) {
              buckets.set(bucketKey, { agentId: agent.id, weekStart: col.weekStart, shifts: {} });
            }
            buckets.get(bucketKey)!.shifts[col.dayKey] = parsed;
          }
        }

        // Write each bucket, merging with any existing schedule for that week.
        for (const b of buckets.values()) {
          const [existing] = await db.select().from(schedules).where(and(
            eq(schedules.agentId, b.agentId),
            eq(schedules.weekStart, b.weekStart),
          ));
          if (existing) {
            const merged = { ...readShifts(existing.shiftsJson), ...b.shifts };
            await db.update(schedules).set({
              shiftsJson: writeShifts(merged), updatedAt: new Date(),
            }).where(eq(schedules.id, existing.id));
          } else {
            await db.insert(schedules).values({
              agentId: b.agentId, weekStart: b.weekStart,
              shiftsJson: writeShifts(b.shifts), createdByUserId: me.id,
            });
          }
          imported++;
        }

        const weeksAffected = new Set(Array.from(buckets.values()).map((b) => b.weekStart));
        res.json({
          imported,
          weeksAffected: Array.from(weeksAffected).sort(),
          dateColumns: dateColumns.length,
          cellErrors,
          unknown: Array.from(new Set(unknown)),
        });
      } catch (err: any) {
        if (err?.message === "xlsx_only") {
          return sendError(res, 400, "invalid_file", "يُسمح فقط بملفات xlsx", "Only .xlsx files are allowed");
        }
        console.error("[schedules.import-by-date]", err);
        errInternal(res);
      }
    },
  );

  // ── Shift swap requests ──────────────────────────────────────────────────────
  app.get(
    "/api/schedules/swap-requests",
    requireFeature("menu.schedule"),
    requirePermission("schedule.swap_request", "schedule.swap_review_team", "schedule.swap_approve"),
    async (req, res) => {
      try {
        const me = req.user as SessionUser;
        const grants = grantsOf(req);
        const allAgents = await db.select().from(agents);
        const agentById = new Map(allAgents.map((a) => [a.id, a]));

        const all = await db.select().from(shiftSwapRequests);
        let visible = all;
        if (!grants.has("schedule.swap_approve")) {
          if (grants.has("schedule.swap_review_team")) {
            visible = all.filter((r) => {
              const requester = agentById.get(r.requesterAgentId);
              const target = agentById.get(r.targetAgentId);
              return requester?.supervisorUserId === me.id || target?.supervisorUserId === me.id;
            });
          } else if (grants.has("schedule.swap_request")) {
            visible = all.filter((r) => {
              const requester = agentById.get(r.requesterAgentId);
              const target = agentById.get(r.targetAgentId);
              return requester?.userId === me.id || target?.userId === me.id;
            });
          } else {
            visible = [];
          }
        }
        res.json(visible.map((r) => ({
          ...r,
          requesterNameAr: agentById.get(r.requesterAgentId)?.nameAr ?? null,
          requesterNameEn: agentById.get(r.requesterAgentId)?.nameEn ?? null,
          requesterEmp: agentById.get(r.requesterAgentId)?.employeeId ?? null,
          targetNameAr: agentById.get(r.targetAgentId)?.nameAr ?? null,
          targetNameEn: agentById.get(r.targetAgentId)?.nameEn ?? null,
          targetEmp: agentById.get(r.targetAgentId)?.employeeId ?? null,
        })));
      } catch {
        errInternal(res);
      }
    },
  );

  app.post(
    "/api/schedules/swap-requests",
    requireFeature("menu.schedule"),
    requirePermission("schedule.swap_request"),
    async (req, res) => {
      try {
        const me = req.user as SessionUser;
        const { targetAgentId, weekStart, dayKey, dayKeys, comment } = req.body ?? {};
        // Accept either a single dayKey (legacy) or an array of dayKeys.
        const allDays: string[] = Array.isArray(dayKeys) && dayKeys.length > 0
          ? Array.from(new Set(dayKeys.map(String)))
          : dayKey ? [String(dayKey)] : [];
        if (!targetAgentId || !weekStart || allDays.length === 0) {
          return sendError(res, 400, "missing_fields",
            "الوكيل المستهدف وتاريخ الأسبوع واليوم مطلوبة",
            "targetAgentId, weekStart and at least one day are required");
        }
        for (const d of allDays) {
          if (!DAY_KEYS.includes(d as any)) {
            return sendError(res, 400, "invalid_day", `يوم غير صالح: ${d}`, `Invalid day: ${d}`);
          }
        }
        const [requester] = await db.select().from(agents).where(eq(agents.userId, me.id));
        if (!requester) {
          return sendError(res, 400, "no_agent_record",
            "حسابك غير مرتبط بسجل وكيل", "Your login is not linked to an agent record");
        }
        const [target] = await db.select().from(agents).where(eq(agents.id, Number(targetAgentId)));
        if (!target) return sendError(res, 400, "invalid_target", "الوكيل المستهدف غير موجود", "Target agent not found");
        if (target.id === requester.id) {
          return sendError(res, 400, "self_swap", "لا يمكنك التبديل مع نفسك", "Cannot swap with yourself");
        }

        const [created] = await db.insert(shiftSwapRequests).values({
          requesterAgentId: requester.id,
          targetAgentId: target.id,
          weekStart: String(weekStart),
          dayKey: allDays[0],              // back-compat: first day
          dayKeys: allDays,                 // full list
          requesterComment: comment ? String(comment) : null,
          status: "pending_supervisor",
        }).returning();

        if (requester.supervisorUserId) {
          await notifyUser({
            userId: requester.supervisorUserId,
            type: "swap_request",
            titleAr: "طلب تبديل جدول جديد",
            titleEn: "New shift swap request",
            bodyAr: `طلب من ${requester.nameAr} لتبديل ${allDays.join(", ")} مع ${target.nameAr}`,
            bodyEn: `${requester.nameEn} requests swap on ${allDays.join(", ")} with ${target.nameEn}`,
            linkPath: "/schedule",
          });
        }
        res.status(201).json(created);
      } catch (err) {
        console.error("[schedules.swap_request]", err);
        errInternal(res);
      }
    },
  );

  // Supervisor first stage: approves → pending_wfm, or rejects.
  app.patch(
    "/api/schedules/swap-requests/:id/supervisor-review",
    requireFeature("menu.schedule"),
    requirePermission("schedule.swap_review_team"),
    async (req, res) => {
      try {
        const me = req.user as SessionUser;
        const id = Number(req.params.id);
        if (isNaN(id)) return errInvalidId(res);
        const { action, comment } = req.body ?? {};
        if (!["approve", "reject"].includes(action)) {
          return sendError(res, 400, "invalid_action", "إجراء غير صالح", "Invalid action");
        }
        const [request] = await db.select().from(shiftSwapRequests).where(eq(shiftSwapRequests.id, id));
        if (!request) return errNotFound(res);
        if (request.status !== "pending_supervisor") {
          return sendError(res, 400, "invalid_status", "الطلب لم يعد بانتظار المشرف", "Request is no longer pending supervisor");
        }
        const [requester] = await db.select().from(agents).where(eq(agents.id, request.requesterAgentId));
        if (requester?.supervisorUserId !== me.id) {
          return sendError(res, 403, "forbidden", "هذا الطلب ليس ضمن فريقك", "Request is not in your team");
        }

        const nextStatus = action === "approve" ? "pending_wfm" : "rejected";
        await db.update(shiftSwapRequests).set({
          status: nextStatus,
          supervisorUserId: me.id,
          supervisorComment: comment ? String(comment) : null,
          resolvedAt: action === "reject" ? new Date() : null,
          updatedAt: new Date(),
        }).where(eq(shiftSwapRequests.id, id));

        if (action === "approve") {
          await notifyRole("wfm", {
            type: "swap_pending_wfm",
            titleAr: "طلب تبديل جدول بانتظار اعتمادك",
            titleEn: "Shift swap awaiting your approval",
            bodyAr: `طلب من ${requester.nameAr} يحتاج اعتماد نهائي`,
            bodyEn: `${requester.nameEn} swap awaits final approval`,
            linkPath: "/schedule",
          });
        } else if (requester.userId) {
          await notifyUser({
            userId: requester.userId,
            type: "swap_rejected",
            titleAr: "تم رفض طلب التبديل",
            titleEn: "Swap request rejected",
            bodyAr: comment || "رفض المشرف الطلب",
            bodyEn: comment || "Supervisor rejected the request",
            linkPath: "/schedule",
          });
        }
        res.json({ message: "ok", status: nextStatus });
      } catch (err) {
        console.error("[schedules.swap_supervisor]", err);
        errInternal(res);
      }
    },
  );

  // WFM final stage: approves → schedules swap is applied to DB; or rejects.
  app.patch(
    "/api/schedules/swap-requests/:id/wfm-decision",
    requireFeature("menu.schedule"),
    requirePermission("schedule.swap_approve"),
    async (req, res) => {
      try {
        const me = req.user as SessionUser;
        const id = Number(req.params.id);
        if (isNaN(id)) return errInvalidId(res);
        const { action, comment } = req.body ?? {};
        if (!["approve", "reject"].includes(action)) {
          return sendError(res, 400, "invalid_action", "إجراء غير صالح", "Invalid action");
        }
        const [request] = await db.select().from(shiftSwapRequests).where(eq(shiftSwapRequests.id, id));
        if (!request) return errNotFound(res);
        if (request.status !== "pending_wfm") {
          return sendError(res, 400, "invalid_status",
            "الطلب لم يصل لمرحلة WFM بعد", "Request is not at WFM stage yet");
        }

        if (action === "approve") {
          // Apply the swap: exchange every requested day's ShiftDay between the two rows.
          await db.transaction(async (tx) => {
            const [reqRow] = await tx.select().from(schedules).where(and(
              eq(schedules.agentId, request.requesterAgentId),
              eq(schedules.weekStart, request.weekStart),
            ));
            const [tgtRow] = await tx.select().from(schedules).where(and(
              eq(schedules.agentId, request.targetAgentId),
              eq(schedules.weekStart, request.weekStart),
            ));
            const reqShifts: WeeklyShifts = reqRow ? readShifts(reqRow.shiftsJson) : {};
            const tgtShifts: WeeklyShifts = tgtRow ? readShifts(tgtRow.shiftsJson) : {};
            const days = Array.isArray(request.dayKeys) && request.dayKeys.length > 0
              ? request.dayKeys
              : [request.dayKey];
            for (const day of days) {
              const reqDay: ShiftDay | undefined = reqShifts[day];
              const tgtDay: ShiftDay | undefined = tgtShifts[day];
              reqShifts[day] = tgtDay ?? { isOff: true };
              tgtShifts[day] = reqDay ?? { isOff: true };
            }

            if (reqRow) {
              await tx.update(schedules).set({ shiftsJson: writeShifts(reqShifts), updatedAt: new Date() })
                .where(eq(schedules.id, reqRow.id));
            } else {
              await tx.insert(schedules).values({
                agentId: request.requesterAgentId, weekStart: request.weekStart,
                shiftsJson: writeShifts(reqShifts), createdByUserId: me.id,
              });
            }
            if (tgtRow) {
              await tx.update(schedules).set({ shiftsJson: writeShifts(tgtShifts), updatedAt: new Date() })
                .where(eq(schedules.id, tgtRow.id));
            } else {
              await tx.insert(schedules).values({
                agentId: request.targetAgentId, weekStart: request.weekStart,
                shiftsJson: writeShifts(tgtShifts), createdByUserId: me.id,
              });
            }
          });
        }

        const finalStatus = action === "approve" ? "approved" : "rejected";
        await db.update(shiftSwapRequests).set({
          status: finalStatus,
          wfmUserId: me.id,
          wfmComment: comment ? String(comment) : null,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(shiftSwapRequests.id, id));

        const [requester] = await db.select().from(agents).where(eq(agents.id, request.requesterAgentId));
        const [target] = await db.select().from(agents).where(eq(agents.id, request.targetAgentId));
        for (const a of [requester, target]) {
          if (a?.userId) {
            await notifyUser({
              userId: a.userId,
              type: action === "approve" ? "swap_approved" : "swap_rejected",
              titleAr: action === "approve" ? "تم اعتماد طلب التبديل" : "تم رفض طلب التبديل",
              titleEn: action === "approve" ? "Swap approved" : "Swap rejected",
              bodyAr: comment || "",
              bodyEn: comment || "",
              linkPath: "/schedule",
            });
          }
        }
        res.json({ message: "ok", status: finalStatus });
      } catch (err) {
        console.error("[schedules.swap_wfm]", err);
        errInternal(res);
      }
    },
  );

  // Cancel own pending request.
  app.delete(
    "/api/schedules/swap-requests/:id",
    requireFeature("menu.schedule"),
    requirePermission("schedule.swap_request"),
    async (req, res) => {
      try {
        const me = req.user as SessionUser;
        const id = Number(req.params.id);
        if (isNaN(id)) return errInvalidId(res);
        const [request] = await db.select().from(shiftSwapRequests).where(eq(shiftSwapRequests.id, id));
        if (!request) return errNotFound(res);
        const [requester] = await db.select().from(agents).where(eq(agents.id, request.requesterAgentId));
        if (requester?.userId !== me.id) {
          return sendError(res, 403, "forbidden", "ليس طلبك", "Not your request");
        }
        if (!["pending_supervisor", "pending_wfm"].includes(request.status)) {
          return sendError(res, 400, "invalid_status", "لا يمكن إلغاء الطلب", "Cannot cancel this request");
        }
        await db.update(shiftSwapRequests).set({
          status: "cancelled", resolvedAt: new Date(), updatedAt: new Date(),
        }).where(eq(shiftSwapRequests.id, id));
        res.status(204).end();
      } catch {
        errInternal(res);
      }
    },
  );
}
