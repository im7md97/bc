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
    if (file.mimetype.startsWith("audio/") || file.mimetype === "video/mp4")
      cb(null, true);
    else cb(new Error("يُسمح فقط برفع الملفات الصوتية"));
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

const ADMIN_ROLES = ["admin", "manager", "quality"];
const VALID_ROLES = [
  "quality",
  "supervisor",
  "agent",
  "admin",
  "manager",
  "wfm",
];
// wfm = Workforce Management: manages schedules and breaks for agents
const SCHEDULE_ROLES = [...ADMIN_ROLES, "supervisor", "wfm"];

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  setupAuth(app);

  const express = (await import("express")).default;
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // ── Audio upload ─────────────────────────────────────────────────────────────
  app.post(
    "/api/upload/audio",
    requireRole(["quality", "admin", "manager"]),
    audioUpload.single("audio"),
    (req, res) => {
      if (!req.file)
        return res.status(400).json({ message: "لم يتم رفع أي ملف" });
      res.json({ url: `/uploads/audio/${req.file.filename}` });
    },
  );

  // ── Auth ─────────────────────────────────────────────────────────────────────
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user)
        return res
          .status(401)
          .json({ message: info?.message || "بيانات خاطئة" });
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        res.json({
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        });
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
    if (!req.isAuthenticated())
      return res.status(401).json({ message: "غير مسجّل" });
    const u = req.user as any;
    res.json({ id: u.id, username: u.username, email: u.email, role: u.role });
  });

  // ── Stats ─────────────────────────────────────────────────────────────────────
  app.get("/api/stats", requireAuth, async (req, res) => {
    try {
      const u = req.user as any;
      const allEntries = await storage.getEntriesByRole(u.role, u.id);
      const allUsers = [...ADMIN_ROLES, "wfm"].includes(u.role)
        ? await storage.getSystemUsers()
        : [];
      const allProjects = ADMIN_ROLES.includes(u.role)
        ? await storage.getProjects()
        : [];
      const count = (arr: any[], f: string, v: string) =>
        arr.filter((e: any) => e[f] === v).length;
      res.json({
        totalEntries: allEntries.length,
        approved: count(allEntries, "status", "approved"),
        rejected: count(allEntries, "status", "rejected"),
        pending: count(allEntries, "status", "pending_supervisor"),
        internalPass: count(allEntries, "qualityInternal", "Pass"),
        externalPass: count(allEntries, "qualityExternal", "Pass"),
        csatPass: count(allEntries, "customerSatisfaction", "Pass"),
        totalUsers: allUsers.length,
        totalProjects: allProjects.length,
      });
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Entries ───────────────────────────────────────────────────────────────────
  app.get(api.entries.list.path, requireAuth, async (req, res) => {
    try {
      const u = req.user as any;
      res.json(await storage.getEntriesByRole(u.role, u.id));
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

  app.post(
    api.entries.create.path,
    requireRole(["quality"]),
    async (req, res) => {
      try {
        const u = req.user as any;
        const input = api.entries.create.input.parse(req.body);
        res
          .status(201)
          .json(
            await storage.createEntry({
              ...input,
              status: "pending_supervisor",
              createdByUserId: u.id,
            }),
          );
      } catch (err) {
        if (err instanceof z.ZodError)
          return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.put(
    api.entries.update.path,
    requireRole(["quality", "admin", "manager"]),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
        const input = api.entries.update.input.parse(req.body);
        if (!(await storage.getEntry(id)))
          return res.status(404).json({ message: "Not found" });
        res.json(await storage.updateEntry(id, input));
      } catch (err) {
        if (err instanceof z.ZodError)
          return res.status(400).json({ message: err.errors[0].message });
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.patch(
    "/api/entries/:id/resubmit",
    requireRole(["quality"]),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
        const { qualityNote } = req.body;
        if (!qualityNote?.trim())
          return res
            .status(400)
            .json({ message: "يجب إدخال ملاحظة عند إعادة الإرسال" });
        const entry = await storage.getEntry(id);
        if (!entry) return res.status(404).json({ message: "Not found" });
        if (entry.status !== "rejected")
          return res
            .status(400)
            .json({ message: "يمكن إعادة إرسال المرفوض فقط" });
        res.json(await storage.resubmitEntry(id, qualityNote.trim()));
      } catch {
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.patch(
    "/api/entries/:id/review",
    requireRole(["supervisor"]),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
        const { action, comment } = req.body;
        if (!["approved", "rejected"].includes(action))
          return res.status(400).json({ message: "action خاطئ" });
        if (action === "rejected" && !comment?.trim())
          return res.status(400).json({ message: "تعليق مطلوب عند الرفض" });
        if (!(await storage.getEntry(id)))
          return res.status(404).json({ message: "Not found" });
        res.json(await storage.reviewEntry(id, action, comment || ""));
      } catch {
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.delete(
    api.entries.delete.path,
    requireRole(["quality", "admin", "manager"]),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
        if (!(await storage.getEntry(id)))
          return res.status(404).json({ message: "Not found" });
        await storage.deleteEntry(id);
        res.status(204).end();
      } catch {
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // ── System Users (admin + manager) ────────────────────────────────────────────
  app.get(
    api.users.list.path,
    requireRole([...ADMIN_ROLES, "wfm"]),
    async (req, res) => {
      try {
        res.json(await storage.getSystemUsers());
      } catch {
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post(
    api.users.create.path,
    requireRole([...ADMIN_ROLES]),
    async (req, res) => {
      try {
        const { password, ...rest } = req.body;
        if (!password || password.length < 6)
          return res
            .status(400)
            .json({ message: "كلمة المرور 6 أحرف على الأقل" });
        const input = api.users.create.input.parse({
          ...rest,
          passwordHash: hashPassword(password),
        });
        res.status(201).json(await storage.createSystemUser(input));
      } catch (err) {
        if (err instanceof z.ZodError)
          return res.status(400).json({ message: err.errors[0].message });
        const msg = (err as any)?.message || "Internal server error";
        if (msg.includes("unique"))
          return res
            .status(400)
            .json({ message: "اسم المستخدم أو البريد مستخدم بالفعل" });
        res.status(500).json({ message: msg });
      }
    },
  );

  app.patch(
    "/api/users/:id/role",
    requireRole([...ADMIN_ROLES]),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
        const { role } = req.body;
        if (!VALID_ROLES.includes(role))
          return res.status(400).json({ message: "دور غير صالح" });
        await storage.updateSystemUserRole(id, role);
        res.json({ message: "تم تحديث الدور" });
      } catch {
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.patch(
    "/api/users/:id/password",
    requireRole([...ADMIN_ROLES]),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
        const { password } = req.body;
        if (!password || password.length < 6)
          return res
            .status(400)
            .json({ message: "كلمة المرور 6 أحرف على الأقل" });
        await storage.updateSystemUserPassword(id, hashPassword(password));
        res.json({ message: "تم تغيير كلمة المرور" });
      } catch {
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.delete(
    api.users.delete.path,
    requireRole([...ADMIN_ROLES]),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
        await storage.deleteSystemUser(id);
        res.status(204).end();
      } catch {
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // ── Projects ──────────────────────────────────────────────────────────────────
  app.get(
    "/api/projects",
    requireRole([...ADMIN_ROLES, "supervisor"]),
    async (req, res) => {
      try {
        res.json(await storage.getProjects());
      } catch {
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post("/api/projects", requireRole([...ADMIN_ROLES]), async (req, res) => {
    try {
      const u = req.user as any;
      const { name, description, status } = req.body;
      if (!name?.trim())
        return res.status(400).json({ message: "اسم المشروع مطلوب" });
      res
        .status(201)
        .json(
          await storage.createProject({
            name: name.trim(),
            description: description?.trim() || "",
            status: status || "active",
            createdByUserId: u.id,
          }),
        );
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(
    "/api/projects/:id",
    requireRole([...ADMIN_ROLES]),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
        const { name, description, status } = req.body;
        if (!name?.trim())
          return res.status(400).json({ message: "اسم المشروع مطلوب" });
        if (!(await storage.getProject(id)))
          return res.status(404).json({ message: "Not found" });
        res.json(
          await storage.updateProject(id, {
            name: name.trim(),
            description: description?.trim() || "",
            status: status || "active",
          }),
        );
      } catch {
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.delete(
    "/api/projects/:id",
    requireRole([...ADMIN_ROLES]),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
        if (!(await storage.getProject(id)))
          return res.status(404).json({ message: "Not found" });
        await storage.deleteProject(id);
        res.status(204).end();
      } catch {
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // ── Schedules (WFM) ───────────────────────────────────────────────────────────
  app.get(
    "/api/schedules",
    requireRole([...SCHEDULE_ROLES, "agent"]),
    async (req, res) => {
      try {
        const u = req.user as any;
        if (u.role === "agent")
          return res.json(await storage.getSchedulesByAgent(u.id));
        res.json(await storage.getSchedules());
      } catch {
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.get(
    "/api/schedules/agent/:agentId",
    requireRole(SCHEDULE_ROLES),
    async (req, res) => {
      try {
        const agentId = Number(req.params.agentId);
        if (isNaN(agentId))
          return res.status(400).json({ message: "Invalid agent ID" });
        res.json(await storage.getSchedulesByAgent(agentId));
      } catch {
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post("/api/schedules", requireRole(SCHEDULE_ROLES), async (req, res) => {
    try {
      const u = req.user as any;
      const { agentId, weekStart, shiftsJson } = req.body;
      if (!agentId || !weekStart)
        return res.status(400).json({ message: "agentId و weekStart مطلوبان" });
      const existing = await storage.getScheduleByAgentAndWeek(
        Number(agentId),
        weekStart,
      );
      if (existing) {
        const updated = await storage.updateSchedule(existing.id, {
          shiftsJson: JSON.stringify(shiftsJson),
        });
        return res.json(updated);
      }
      res.status(201).json(
        await storage.createSchedule({
          agentId: Number(agentId),
          weekStart,
          shiftsJson:
            typeof shiftsJson === "string"
              ? shiftsJson
              : JSON.stringify(shiftsJson),
          createdByUserId: u.id,
        }),
      );
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(
    "/api/schedules/:id",
    requireRole(SCHEDULE_ROLES),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
        const { shiftsJson } = req.body;
        res.json(
          await storage.updateSchedule(id, {
            shiftsJson:
              typeof shiftsJson === "string"
                ? shiftsJson
                : JSON.stringify(shiftsJson),
          }),
        );
      } catch {
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.delete(
    "/api/schedules/:id",
    requireRole(SCHEDULE_ROLES),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
        await storage.deleteSchedule(id);
        res.status(204).end();
      } catch {
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

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
      console.log("✅ Default admin: username=admin, password=admin123");
    }
  } catch (err) {
    console.error("Seed error:", err);
  }
}
