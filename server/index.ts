import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { createServer } from "http";
import fs from "fs";
import path from "path";

// ─── Fail fast + clearly if a required env var is missing ────────────────
// Prints a plain-text banner Railway will show in Deploy Logs so we never
// have to hunt for the cause of a start-up crash again.
(function assertEnv() {
  const required = ["DATABASE_URL", "SESSION_SECRET"];
  const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim() === "");
  if (missing.length) {
    console.error("\n════════════════════════════════════════════════");
    console.error("[bc] STARTUP FAILED — missing env vars:");
    for (const k of missing) console.error(`   • ${k}`);
    console.error("════════════════════════════════════════════════\n");
    process.exit(1);
  }
  const dbUrl = String(process.env.DATABASE_URL);
  if (/localhost|127\.0\.0\.1/.test(dbUrl) && process.env.NODE_ENV === "production") {
    console.error("\n════════════════════════════════════════════════");
    console.error("[bc] DATABASE_URL points at localhost in production!");
    console.error("     Attach the Postgres plugin and reference its DATABASE_URL.");
    console.error("════════════════════════════════════════════════\n");
    process.exit(1);
  }
  console.log(`[bc] env ok · NODE_ENV=${process.env.NODE_ENV} · DB host=${dbUrl.split("@")[1]?.split("/")[0] ?? "?"}`);
})();

process.on("uncaughtException", (err) => {
  console.error("[bc] uncaughtException:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[bc] unhandledRejection:", reason);
});

function serveStatic(app: express.Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) throw new Error(`Could not find the build directory: ${distPath}`);
  app.use(express.static(distPath));
  app.use("/{*path}", (_req: any, res: any) => res.sendFile(path.resolve(distPath, "index.html")));
}

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  // reusePort isn't supported on Windows — listen with just port/host.
  const listenOpts: any = process.platform === "win32"
    ? { port, host: "127.0.0.1" }
    : { port, host: "0.0.0.0", reusePort: true };
  httpServer.listen(listenOpts, () => {
    log(`serving on port ${port}`);
  });
})();
