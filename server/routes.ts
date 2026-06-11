import type { Express } from "express";
import type { Server } from "http";
import passport from "passport";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { setupAuth, requireAuth, requireRole, hashPassword } from "./auth";
import { api } from "@shared/routes";
import { z } from "zod";

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
    if (file.mimetype.startsWith("audio/") || file.mimetype === "video/mp4") {
      cb(null, true);
    } else {
      cb(new Error("يُسمح فقط برفع الملفات الصوتية"));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  setupAuth(app);

  const express = (await import("express")).default;
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // ── Audio upload (quality only) ──────────────────────────────────────────
  app.post("/api/upload/audio", requireRole(["quality", "admin"]), audioUpload.single("audio"), (req, res) => {
    if (!req.file) return res.status(400).json({ message: "لم يتم رفع أي ملف" });
    const url = `/uploads/audio/${req.file.filename}`;
    res.json({ url });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "بيانات خاطئة" });
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.json({ id: user.id, username: user.username, email: user.email, role: user.role });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ message: "تم تسجيل الخروج بنجاح" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "غير مسجّل" });
    const user = req.user as any;
    res.json({ id: user.id, username: user.username, email: user.email, role: user.role });
  });

  // ── Entries ────────────────────────────────────────────────────────────────

  // GET /api/entries — role-based filtering
  app.get(api.entries.list.path, requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const result = await storage.getEntriesByRole(user.role, user.id);
      res.json(result);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.entries.get.path, requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const entry = await storage.getEntry(id);
      if (!entry) return res.status(404).json({ message: "Entry not found" });
      res.json(entry);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/entries — quality only, attaches createdByUserId
  app.post(api.entries.create.path, requireRole(["quality"]), async (req, res) => {
    try {
      const user = req.user as any;
      const input = api.entries.create.input.parse(req.body);
      const entry = await storage.createEntry({
        ...input,
        status: "pending_supervisor",
        createdByUserId: user.id,
      });
      res.status(201).json(entry);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.entries.update.path, requireRole(["quality", "admin"]), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const input = api.entries.update.input.parse(req.body);
      if (!await storage.getEntry(id)) return res.status(404).json({ message: "Entry not found" });
      res.json(await storage.updateEntry(id, input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PATCH /api/entries/:id/resubmit — quality re-sends rejected entry with a note
  app.patch("/api/entries/:id/resubmit", requireRole(["quality"]), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const { qualityNote } = req.body;
      if (!qualityNote?.trim()) {
        return res.status(400).json({ message: "يجب إدخال ملاحظة عند إعادة الإرسال" });
      }
      const entry = await storage.getEntry(id);
      if (!entry) return res.status(404).json({ message: "Entry not found" });
      if (entry.status !== "rejected") {
        return res.status(400).json({ message: "يمكن إعادة إرسال التقييمات المرفوضة فقط" });
      }
      const updated = await storage.resubmitEntry(id, qualityNote.trim());
      res.json(updated);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PATCH /api/entries/:id/review — supervisor approves or rejects
  app.patch("/api/entries/:id/review", requireRole(["supervisor"]), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const { action, comment } = req.body;
      if (!["approved", "rejected"].includes(action)) {
        return res.status(400).json({ message: "action يجب أن يكون approved أو rejected" });
      }
      if (action === "rejected" && !comment?.trim()) {
        return res.status(400).json({ message: "يجب إدخال تعليق عند الرفض" });
      }
      const entry = await storage.getEntry(id);
      if (!entry) return res.status(404).json({ message: "Entry not found" });
      const updated = await storage.reviewEntry(id, action, comment || "");
      res.json(updated);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.entries.delete.path, requireRole(["quality", "admin"]), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      if (!await storage.getEntry(id)) return res.status(404).json({ message: "Entry not found" });
      await storage.deleteEntry(id);
      res.status(204).end();
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── System Users (admin only) ─────────────────────────────────────────────
  app.get(api.users.list.path, requireRole(["admin"]), async (req, res) => {
    try { res.json(await storage.getSystemUsers()); }
    catch { res.status(500).json({ message: "Internal server error" }); }
  });

  app.post(api.users.create.path, requireRole(["admin"]), async (req, res) => {
    try {
      const { password, ...rest } = req.body;
      if (!password || password.length < 6) {
        return res.status(400).json({ message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
      }
      const input = api.users.create.input.parse({ ...rest, passwordHash: hashPassword(password) });
      res.status(201).json(await storage.createSystemUser(input));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message, field: err.errors[0].path.join('.') });
      const msg = (err as any)?.message || "Internal server error";
      if (msg.includes("unique")) return res.status(400).json({ message: "اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل" });
      res.status(500).json({ message: msg });
    }
  });

  // PATCH /api/users/:id/role — admin changes user role
  app.patch("/api/users/:id/role", requireRole(["admin"]), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const { role } = req.body;
      const validRoles = ["quality", "supervisor", "agent", "admin"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: "دور غير صالح" });
      }
      await storage.updateSystemUserRole(id, role);
      res.json({ message: "تم تحديث الدور بنجاح" });
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/users/:id/password", requireRole(["admin"]), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      const { password } = req.body;
      if (!password || password.length < 6) {
        return res.status(400).json({ message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
      }
      await storage.updateSystemUserPassword(id, hashPassword(password));
      res.json({ message: "تم تغيير كلمة المرور بنجاح" });
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.users.delete.path, requireRole(["admin"]), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
      await storage.deleteSystemUser(id);
      res.status(204).end();
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  await seedDatabase();
  return httpServer;
}

async function seedDatabase() {
  try {
    const users = await storage.getSystemUsers();
    if (users.length === 0) {
      const { hashPassword } = await import("./auth");
      await storage.createSystemUser({
        username: "admin",
        email: "admin@quality.portal",
        role: "admin",
        passwordHash: hashPassword("admin123"),
      });
      console.log("✅ Default admin created: username=admin, password=admin123");
    }
  } catch (err) {
    console.error("Error seeding database:", err);
  }
}
