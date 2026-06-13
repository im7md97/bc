import { type Express } from "express";
import session from "express-session";
import MemoryStore from "memorystore";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { db } from "./db";
import { users, type SafeUser } from "@shared/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, hashPassword } from "./password";
import { sendError } from "./http-errors";
import { getPermissionsForRole, getFlags, isFeatureEnabled } from "./permissions";

const MemoryStoreSession = MemoryStore(session);

export interface SessionUser {
  id: number;
  username: string;
  email: string;
  role: string;
  displayNameAr: string;
  displayNameEn: string;
  preferredLanguage: string;
  forcePasswordChange: boolean;
}

function toSessionUser(u: typeof users.$inferSelect): SessionUser {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    displayNameAr: u.displayNameAr,
    displayNameEn: u.displayNameEn,
    preferredLanguage: u.preferredLanguage,
    forcePasswordChange: u.forcePasswordChange,
  };
}

export function setupAuth(app: Express) {
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "quality-portal-secret-key",
      resave: false,
      saveUninitialized: false,
      store: new MemoryStoreSession({ checkPeriod: 86400000 }),
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: "lax",
      },
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const [user] = await db.select().from(users).where(eq(users.username, username));
        if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
          return done(null, false, { message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
        }
        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
        return done(null, toSessionUser(user));
      } catch (err) {
        return done(err);
      }
    }),
  );

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      if (!user || !user.isActive) return done(null, false);
      done(null, toSessionUser(user));
    } catch (err) {
      done(err);
    }
  });

  // ── Auth endpoints ──────────────────────────────────────────────────────────
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        return sendError(res, 401, "bad_credentials",
          info?.message || "بيانات الدخول غير صحيحة",
          "Invalid username or password");
      }
      req.login(user, async (loginErr) => {
        if (loginErr) return next(loginErr);
        res.json(await buildMePayload(user));
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ message: "ok" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.isAuthenticated()) {
      return sendError(res, 401, "unauthenticated", "غير مسجّل", "Not logged in");
    }
    res.json(await buildMePayload(req.user as SessionUser));
  });

  app.post("/api/auth/change-password", async (req, res) => {
    if (!req.isAuthenticated()) {
      return sendError(res, 401, "unauthenticated", "غير مسجّل", "Not logged in");
    }
    const sessionUser = req.user as SessionUser;
    const { currentPassword, newPassword } = req.body ?? {};
    if (!newPassword || String(newPassword).length < 8) {
      return sendError(res, 400, "weak_password",
        "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل",
        "New password must be at least 8 characters");
    }
    const [user] = await db.select().from(users).where(eq(users.id, sessionUser.id));
    if (!user) return sendError(res, 404, "not_found", "المستخدم غير موجود", "User not found");
    if (!verifyPassword(String(currentPassword ?? ""), user.passwordHash)) {
      return sendError(res, 400, "bad_current_password",
        "كلمة المرور الحالية غير صحيحة", "Current password is incorrect");
    }
    await db.update(users).set({
      passwordHash: hashPassword(String(newPassword)),
      forcePasswordChange: false,
      updatedAt: new Date(),
    }).where(eq(users.id, user.id));
    (req.user as SessionUser).forcePasswordChange = false;
    res.json({ message: "ok" });
  });

  app.patch("/api/auth/language", async (req, res) => {
    if (!req.isAuthenticated()) {
      return sendError(res, 401, "unauthenticated", "غير مسجّل", "Not logged in");
    }
    const { language } = req.body ?? {};
    if (!["ar", "en"].includes(language)) {
      return sendError(res, 400, "invalid_language", "لغة غير مدعومة", "Unsupported language");
    }
    const sessionUser = req.user as SessionUser;
    await db.update(users).set({ preferredLanguage: language, updatedAt: new Date() })
      .where(eq(users.id, sessionUser.id));
    sessionUser.preferredLanguage = language;
    res.json({ message: "ok" });
  });
}

/** /me payload: profile + live permissions + feature flags relevant to the role. */
export async function buildMePayload(user: SessionUser) {
  const permissions = Array.from(await getPermissionsForRole(user.role));
  const flags = await getFlags();
  const features: Record<string, boolean> = {};
  for (const key of flags.keys()) {
    features[key] = await isFeatureEnabled(key, user.role);
  }
  return { ...user, permissions, features };
}

export type AuthedUser = SessionUser;
export { hashPassword, verifyPassword };
