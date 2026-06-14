import type { Express } from "express";
import { db } from "../db";
import { agents, users, projects } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { requirePermission, grantsOf } from "../permissions";
import { sendError, errInternal, errNotFound, errInvalidId } from "../http-errors";
import { getScopedAgents } from "../scoping";
import { notifyRole } from "../notify";
import { hashPassword } from "../password";
import type { SessionUser } from "../auth";

const AGENT_SCOPE = { all: "agent.list_all", project: "agent.list_project", team: "agent.list_team" };

export function registerAgentRoutes(app: Express) {
  app.get("/api/agents", requirePermission("agent.list_all", "agent.list_project", "agent.list_team"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const scoped = await getScopedAgents(me, grantsOf(req), AGENT_SCOPE);
      const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
      const projectFilter = req.query.projectId ? Number(req.query.projectId) : null;

      const supervisorRows = await db.select().from(users).where(eq(users.role, "supervisor"));
      const supervisorById = new Map(supervisorRows.map((s) => [s.id, s]));
      const projectRows = await db.select().from(projects);
      const projectById = new Map(projectRows.map((p) => [p.id, p]));

      let result = scoped.map((a) => ({
        ...a,
        supervisorNameAr: a.supervisorUserId ? supervisorById.get(a.supervisorUserId)?.displayNameAr ?? null : null,
        supervisorNameEn: a.supervisorUserId ? supervisorById.get(a.supervisorUserId)?.displayNameEn ?? null : null,
        projectNameAr: projectById.get(a.projectId)?.nameAr ?? null,
        projectNameEn: projectById.get(a.projectId)?.nameEn ?? null,
      }));
      if (projectFilter) result = result.filter((a) => a.projectId === projectFilter);
      if (search) {
        result = result.filter((a) =>
          a.employeeId.toLowerCase().includes(search) ||
          a.nameAr.toLowerCase().includes(search) ||
          a.nameEn.toLowerCase().includes(search) ||
          (a.inboundId ?? "").toLowerCase().includes(search));
      }
      res.json(result);
    } catch {
      errInternal(res);
    }
  });

  app.post("/api/agents", requirePermission("agent.create"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const { employeeId, nameAr, nameEn, inboundId, supervisorUserId, projectId, login } = req.body ?? {};
      if (!employeeId?.trim() || (!nameAr?.trim() && !nameEn?.trim()) || !projectId) {
        return sendError(res, 400, "missing_fields",
          "الرقم الوظيفي والاسم والمشروع مطلوبة", "Employee ID, name and project are required");
      }
      if (supervisorUserId) {
        const [sup] = await db.select().from(users).where(eq(users.id, Number(supervisorUserId)));
        if (!sup || sup.role !== "supervisor") {
          return sendError(res, 400, "invalid_supervisor", "المشرف غير صالح", "Invalid supervisor");
        }
      }

      // Optional linked login account for the agent.
      let userId: number | null = null;
      if (login?.username && login?.password) {
        const [account] = await db.insert(users).values({
          username: String(login.username).trim(),
          email: String(login.email || `${login.username}@agents.portal`).trim(),
          passwordHash: hashPassword(String(login.password)),
          role: "agent",
          displayNameAr: String(nameAr || nameEn).trim(),
          displayNameEn: String(nameEn || nameAr).trim(),
          forcePasswordChange: true,
        }).returning();
        userId = account.id;
      }

      const [created] = await db.insert(agents).values({
        employeeId: String(employeeId).trim(),
        nameAr: String(nameAr || nameEn).trim(),
        nameEn: String(nameEn || nameAr).trim(),
        inboundId: inboundId ? String(inboundId).trim() : null,
        supervisorUserId: supervisorUserId ? Number(supervisorUserId) : null,
        projectId: Number(projectId),
        userId,
        createdByUserId: me.id,
      }).returning();

      await notifyRole("admin", {
        type: "agent_added",
        titleAr: "تمت إضافة وكيل جديد",
        titleEn: "New agent added",
        bodyAr: `أضاف ${me.displayNameAr} الوكيل ${created.nameAr} (${created.employeeId})`,
        bodyEn: `${me.displayNameEn} added agent ${created.nameEn} (${created.employeeId})`,
        linkPath: "/agents",
      });
      res.status(201).json(created);
    } catch (err: any) {
      if (err?.code === "23505") {
        return sendError(res, 400, "duplicate", "الرقم الوظيفي أو اسم المستخدم مستخدم بالفعل", "Employee ID or username already in use");
      }
      errInternal(res);
    }
  });

  app.put("/api/agents/:id", requirePermission("agent.create"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return errInvalidId(res);
      const [agent] = await db.select().from(agents).where(eq(agents.id, id));
      if (!agent) return errNotFound(res);
      const { nameAr, nameEn, inboundId, supervisorUserId, projectId, isActive, userId } = req.body ?? {};
      if (supervisorUserId) {
        const [sup] = await db.select().from(users).where(eq(users.id, Number(supervisorUserId)));
        if (!sup || sup.role !== "supervisor") {
          return sendError(res, 400, "invalid_supervisor", "المشرف غير صالح", "Invalid supervisor");
        }
      }
      const updates: Partial<typeof agents.$inferInsert> = { updatedAt: new Date() };
      if (nameAr !== undefined) updates.nameAr = String(nameAr).trim();
      if (nameEn !== undefined) updates.nameEn = String(nameEn).trim();
      if (inboundId !== undefined) updates.inboundId = inboundId ? String(inboundId).trim() : null;
      if (supervisorUserId !== undefined) updates.supervisorUserId = supervisorUserId ? Number(supervisorUserId) : null;
      if (projectId !== undefined) updates.projectId = Number(projectId);
      if (isActive !== undefined) updates.isActive = Boolean(isActive);
      if (userId !== undefined) {
        const linkedId = userId === null || userId === "" ? null : Number(userId);
        if (linkedId !== null) {
          const [linked] = await db.select().from(users).where(eq(users.id, linkedId));
          if (!linked || linked.role !== "agent") {
            return sendError(res, 400, "invalid_user", "حساب الوكيل غير صالح", "Invalid agent login");
          }
        }
        updates.userId = linkedId;
      }
      const [updated] = await db.update(agents).set(updates).where(eq(agents.id, id)).returning();
      res.json(updated);
    } catch {
      errInternal(res);
    }
  });

  // Soft delete (is_active=false) so APR/Score Card history stays linked.
  app.delete("/api/agents/:id", requirePermission("agent.delete"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const id = Number(req.params.id);
      if (isNaN(id)) return errInvalidId(res);
      const [agent] = await db.select().from(agents).where(eq(agents.id, id));
      if (!agent) return errNotFound(res);
      await db.update(agents).set({ isActive: false, updatedAt: new Date() }).where(eq(agents.id, id));
      await notifyRole("admin", {
        type: "agent_removed",
        titleAr: "تم حذف وكيل",
        titleEn: "Agent removed",
        bodyAr: `قام ${me.displayNameAr} بحذف الوكيل ${agent.nameAr} (${agent.employeeId})`,
        bodyEn: `${me.displayNameEn} removed agent ${agent.nameEn} (${agent.employeeId})`,
        linkPath: "/agents",
      });
      res.status(204).end();
    } catch {
      errInternal(res);
    }
  });
}
