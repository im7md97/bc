import type { Express } from "express";
import type { Server } from "http";
import path from "path";
import { setupAuth } from "./auth";
import { seedCore } from "./seed";
import { registerUserRoutes } from "./api/users";
import { registerProjectRoutes } from "./api/projects";
import { registerAgentRoutes } from "./api/agents";
import { registerAprRoutes } from "./api/apr";
import { registerScoreCardRoutes } from "./api/scorecards";
import { registerNotificationRoutes } from "./api/notifications";
import { registerSuperAdminRoutes } from "./api/super-admin";
import { registerQcRoutes } from "./api/qc";
import { registerScheduleRoutes } from "./api/schedules";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  setupAuth(app);

  const express = (await import("express")).default;
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  registerUserRoutes(app);
  registerProjectRoutes(app);
  registerAgentRoutes(app);
  registerAprRoutes(app);
  registerScoreCardRoutes(app);
  registerNotificationRoutes(app);
  registerSuperAdminRoutes(app);
  registerQcRoutes(app);
  registerScheduleRoutes(app);

  await seedCore();
  return httpServer;
}
