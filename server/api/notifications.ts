import type { Express } from "express";
import { db } from "../db";
import { notifications } from "@shared/schema";
import { eq, desc, and, count } from "drizzle-orm";
import { requirePermission } from "../permissions";
import { errInternal, errInvalidId, errNotFound } from "../http-errors";
import type { SessionUser } from "../auth";

export function registerNotificationRoutes(app: Express) {
  app.get("/api/notifications", requirePermission("notifications.view_own"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const limit = Math.min(50, Number(req.query.limit) || 20);
      const rows = await db.select().from(notifications)
        .where(eq(notifications.userId, me.id))
        .orderBy(desc(notifications.createdAt))
        .limit(limit);
      const [unread] = await db.select({ value: count() }).from(notifications)
        .where(and(eq(notifications.userId, me.id), eq(notifications.isRead, false)));
      res.json({ items: rows, unreadCount: unread?.value ?? 0 });
    } catch {
      errInternal(res);
    }
  });

  app.patch("/api/notifications/:id/read", requirePermission("notifications.view_own"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const id = Number(req.params.id);
      if (isNaN(id)) return errInvalidId(res);
      const [row] = await db.update(notifications).set({ isRead: true })
        .where(and(eq(notifications.id, id), eq(notifications.userId, me.id)))
        .returning();
      if (!row) return errNotFound(res);
      res.json({ message: "ok" });
    } catch {
      errInternal(res);
    }
  });

  app.post("/api/notifications/read-all", requirePermission("notifications.view_own"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      await db.update(notifications).set({ isRead: true })
        .where(and(eq(notifications.userId, me.id), eq(notifications.isRead, false)));
      res.json({ message: "ok" });
    } catch {
      errInternal(res);
    }
  });
}
