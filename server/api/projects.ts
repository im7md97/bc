import type { Express } from "express";
import { db } from "../db";
import { projects, users } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { requirePermission, requireAuth, grantsOf } from "../permissions";
import { sendError, errInternal, errNotFound, errInvalidId } from "../http-errors";
import { seedProjectDefaults } from "../seed";
import type { SessionUser } from "../auth";

export function registerProjectRoutes(app: Express) {
  // Active projects are readable by any authenticated user (pickers need them);
  // archived ones only by callers who can edit projects.
  app.get("/api/projects", requireAuth, async (req, res) => {
    try {
      const rows = await db
        .select({
          id: projects.id,
          nameAr: projects.nameAr,
          nameEn: projects.nameEn,
          description: projects.description,
          status: projects.status,
          managerUserId: projects.managerUserId,
          createdByUserId: projects.createdByUserId,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt,
          managerNameAr: users.displayNameAr,
          managerNameEn: users.displayNameEn,
        })
        .from(projects)
        .leftJoin(users, eq(projects.managerUserId, users.id))
        .orderBy(desc(projects.createdAt));
      res.json(rows);
    } catch {
      errInternal(res);
    }
  });

  app.post("/api/projects", requirePermission("project.create"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const { nameAr, nameEn, description, managerUserId } = req.body ?? {};
      if (!nameAr?.trim() && !nameEn?.trim()) {
        return sendError(res, 400, "missing_fields", "اسم المشروع مطلوب", "Project name is required");
      }
      const [created] = await db.insert(projects).values({
        nameAr: String(nameAr || nameEn).trim(),
        nameEn: String(nameEn || nameAr).trim(),
        description: String(description || "").trim(),
        status: "active",
        managerUserId: managerUserId ? Number(managerUserId) : null,
        createdByUserId: me.id,
      }).returning();
      // Every new project gets default APR metrics + score card grid (§4.5, §8.6).
      await seedProjectDefaults(created.id);
      res.status(201).json(created);
    } catch {
      errInternal(res);
    }
  });

  app.put("/api/projects/:id", requirePermission("project.edit", "project.edit_own"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const grants = grantsOf(req);
      const id = Number(req.params.id);
      if (isNaN(id)) return errInvalidId(res);
      const [project] = await db.select().from(projects).where(eq(projects.id, id));
      if (!project) return errNotFound(res);
      if (!grants.has("project.edit") && project.managerUserId !== me.id) {
        return sendError(res, 403, "forbidden",
          "يمكنك تعديل مشاريعك فقط", "You may only edit your own projects");
      }
      const { nameAr, nameEn, description, status, managerUserId } = req.body ?? {};
      const updates: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
      if (nameAr !== undefined) updates.nameAr = String(nameAr).trim();
      if (nameEn !== undefined) updates.nameEn = String(nameEn).trim();
      if (description !== undefined) updates.description = String(description).trim();
      if (status !== undefined && ["active", "archived"].includes(status)) updates.status = status;
      if (managerUserId !== undefined && grants.has("project.edit")) {
        updates.managerUserId = managerUserId ? Number(managerUserId) : null;
      }
      const [updated] = await db.update(projects).set(updates).where(eq(projects.id, id)).returning();
      res.json(updated);
    } catch {
      errInternal(res);
    }
  });

  // Archive (soft delete) — APR history must stay intact.
  app.delete("/api/projects/:id", requirePermission("project.edit"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return errInvalidId(res);
      const [project] = await db.select().from(projects).where(eq(projects.id, id));
      if (!project) return errNotFound(res);
      await db.update(projects).set({ status: "archived", updatedAt: new Date() }).where(eq(projects.id, id));
      res.status(204).end();
    } catch {
      errInternal(res);
    }
  });
}
