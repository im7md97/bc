import { type Express, type RequestHandler } from "express";
import session from "express-session";
import MemoryStore from "memorystore";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage } from "./storage";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

const MemoryStoreSession = MemoryStore(session);

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${hash}:${salt}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [hash, salt] = stored.split(":");
  if (!hash || !salt) return false;
  const inputHash = scryptSync(password, salt, 64);
  const storedHash = Buffer.from(hash, "hex");
  return timingSafeEqual(inputHash, storedHash);
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
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getSystemUserByUsername(username);
        if (!user) return done(null, false, { message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
        if (!verifyPassword(password, user.passwordHash)) {
          return done(null, false, { message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
        }
        return done(null, { id: user.id, username: user.username, email: user.email, role: user.role });
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getSystemUserById(id);
      if (!user) return done(null, false);
      done(null, { id: user.id, username: user.username, email: user.email, role: user.role });
    } catch (err) {
      done(err);
    }
  });
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: "يجب تسجيل الدخول أولاً" });
};

export function requireRole(roles: string[]): RequestHandler {
  return (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "يجب تسجيل الدخول أولاً" });
    const user = req.user as any;
    if (!roles.includes(user.role)) return res.status(403).json({ message: "ليس لديك صلاحية الوصول لهذه العملية" });
    next();
  };
}
