import {
  pgTable, text, serial, timestamp, varchar, integer, boolean, date,
  jsonb, numeric, unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Roles ────────────────────────────────────────────────────────────────────
// Exactly 7 roles. Stored as varchar(50) — NOT a pg enum, so the set can evolve.
export const ROLES = [
  "super_admin",
  "admin",
  "wfm",
  "project_manager",
  "supervisor",
  "quality",
  "agent",
] as const;
export type Role = (typeof ROLES)[number];

// ─── users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  displayNameAr: text("display_name_ar").notNull(),
  displayNameEn: text("display_name_en").notNull(),
  preferredLanguage: varchar("preferred_language", { length: 5 }).notNull().default("ar"),
  isActive: boolean("is_active").notNull().default(true),
  forcePasswordChange: boolean("force_password_change").notNull().default(false),
  // Customisable home dashboard: array of widget keys the user has pinned.
  dashboardWidgets: jsonb("dashboard_widgets").$type<string[] | null>(),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true, createdAt: true, updatedAt: true, lastLoginAt: true,
});
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type SafeUser = Omit<User, "passwordHash">;

// ─── projects ─────────────────────────────────────────────────────────────────

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  description: text("description").notNull().default(""),
  status: varchar("status", { length: 50 }).notNull().default("active"), // active | archived
  managerUserId: integer("manager_user_id").references(() => users.id),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

// ─── supervisors_projects (junction) ─────────────────────────────────────────
// Business rule today: one active project per supervisor (enforced app-side).

export const supervisorsProjects = pgTable("supervisors_projects", {
  id: serial("id").primaryKey(),
  supervisorUserId: integer("supervisor_user_id").notNull().references(() => users.id),
  projectId: integer("project_id").notNull().references(() => projects.id),
}, (t) => [unique().on(t.supervisorUserId, t.projectId)]);

export type SupervisorProject = typeof supervisorsProjects.$inferSelect;

// ─── agents ───────────────────────────────────────────────────────────────────
// Measured employees. Not necessarily portal users; user_id optional for login.

export const agents = pgTable("agents", {
  id: serial("id").primaryKey(),
  employeeId: text("employee_id").notNull().unique(), // join key for Excel uploads
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  inboundId: text("inbound_id"),
  supervisorUserId: integer("supervisor_user_id").references(() => users.id),
  projectId: integer("project_id").notNull().references(() => projects.id),
  userId: integer("user_id").references(() => users.id),
  isActive: boolean("is_active").notNull().default(true),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAgentSchema = createInsertSchema(agents).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type Agent = typeof agents.$inferSelect;
export type InsertAgent = z.infer<typeof insertAgentSchema>;

// ─── apr_metric_definitions ──────────────────────────────────────────────────
// Per-project metric columns shown in APR.

export const aprMetricDefinitions = pgTable("apr_metric_definitions", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  key: text("key").notNull(),
  labelAr: text("label_ar").notNull(),
  labelEn: text("label_en").notNull(),
  // 'number' | 'percent' | 'duration_text' | 'duration_seconds' | 'integer'
  valueType: varchar("value_type", { length: 20 }).notNull(),
  excelHeader: text("excel_header"), // header name in the uploaded file (editable mapping)
  displayOrder: integer("display_order").notNull().default(0),
  isVisible: boolean("is_visible").notNull().default(true),
}, (t) => [unique().on(t.projectId, t.key)]);

export const insertAprMetricDefinitionSchema = createInsertSchema(aprMetricDefinitions).omit({ id: true });
export type AprMetricDefinition = typeof aprMetricDefinitions.$inferSelect;
export type InsertAprMetricDefinition = z.infer<typeof insertAprMetricDefinitionSchema>;

// ─── apr_snapshots ────────────────────────────────────────────────────────────
// One row per WFM daily upload. Historical, never overwritten.

export const aprSnapshots = pgTable("apr_snapshots", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  asOfDate: date("as_of_date").notNull(),
  timeFormat: varchar("time_format", { length: 20 }).notNull(), // 'hh_mm_ss' | 'seconds'
  uploadedByUserId: integer("uploaded_by_user_id").notNull().references(() => users.id),
  fileName: text("file_name"),
  rowCount: integer("row_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AprSnapshot = typeof aprSnapshots.$inferSelect;
export type InsertAprSnapshot = typeof aprSnapshots.$inferInsert;

// ─── apr_rows ─────────────────────────────────────────────────────────────────

export const aprRows = pgTable("apr_rows", {
  id: serial("id").primaryKey(),
  snapshotId: integer("snapshot_id").notNull()
    .references(() => aprSnapshots.id, { onDelete: "cascade" }),
  agentId: integer("agent_id").notNull().references(() => agents.id),
  // keyed by apr_metric_definitions.key — set differs per project, hence jsonb
  metrics: jsonb("metrics").notNull().$type<Record<string, string | number | null>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [unique().on(t.snapshotId, t.agentId)]);

export type AprRow = typeof aprRows.$inferSelect;
export type InsertAprRow = typeof aprRows.$inferInsert;

// ─── agent_latest_apr ─────────────────────────────────────────────────────────
// Convenience pointer to each agent's most recent row; updated on every upload.

export const agentLatestApr = pgTable("agent_latest_apr", {
  agentId: integer("agent_id").primaryKey().references(() => agents.id),
  snapshotId: integer("snapshot_id").notNull().references(() => aprSnapshots.id),
  rowId: integer("row_id").notNull().references(() => aprRows.id),
  asOfDate: date("as_of_date").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export type AgentLatestApr = typeof agentLatestApr.$inferSelect;

// ─── score_card_grid_configs ─────────────────────────────────────────────────

export interface ScoreTier {
  max?: number;       // tiered: value < max (or <= for the inclusive variants seeded)
  maxInclusive?: boolean;
  score: number;      // 0.2 | 0.4 | 0.6 | 0.8 | 1.0
}

export const scoreCardGridConfigs = pgTable("score_card_grid_configs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  metricKey: text("metric_key").notNull(),
  labelAr: text("label_ar").notNull(),
  labelEn: text("label_en").notNull(),
  weight: numeric("weight", { precision: 5, scale: 4 }).notNull(),
  scoringType: varchar("scoring_type", { length: 20 }).notNull(), // 'tiered' | 'binary'
  tiers: jsonb("tiers").$type<ScoreTier[]>(),
  // tiered direction: 'higher_better' applies tiers ascending; 'lower_better' descending
  tierDirection: varchar("tier_direction", { length: 15 }).notNull().default("higher_better"),
  binaryThreshold: numeric("binary_threshold"),
  binaryDirection: varchar("binary_direction", { length: 10 }), // 'gte' | 'lte'
  // how the monthly raw_value is computed from APR rows: 'average' | 'sum'
  aggregation: varchar("aggregation", { length: 10 }).notNull().default("average"),
  // which APR metric key feeds this grid line (defaults to metricKey)
  sourceMetricKey: text("source_metric_key"),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
}, (t) => [unique().on(t.projectId, t.metricKey)]);

export const insertGridConfigSchema = createInsertSchema(scoreCardGridConfigs).omit({ id: true });
export type ScoreCardGridConfig = typeof scoreCardGridConfigs.$inferSelect;
export type InsertScoreCardGridConfig = z.infer<typeof insertGridConfigSchema>;

// ─── score_cards ──────────────────────────────────────────────────────────────

export const SCORE_CARD_STATUSES = ["draft", "awaiting_agent", "confirmed"] as const;
export type ScoreCardStatus = (typeof SCORE_CARD_STATUSES)[number];

export const scoreCards = pgTable("score_cards", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  agentId: integer("agent_id").notNull().references(() => agents.id),
  periodYear: integer("period_year").notNull(),
  periodMonth: integer("period_month").notNull(), // 1–12
  generatedByUserId: integer("generated_by_user_id").references(() => users.id),
  status: varchar("status", { length: 30 }).notNull().default("draft"),
  finalScore: numeric("final_score", { precision: 6, scale: 4 }),
  rankInTeam: integer("rank_in_team"),
  sentToAgentAt: timestamp("sent_to_agent_at"),
  confirmedAt: timestamp("confirmed_at"),
  agentComment: text("agent_comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [unique().on(t.projectId, t.agentId, t.periodYear, t.periodMonth)]);

export type ScoreCard = typeof scoreCards.$inferSelect;
export type InsertScoreCard = typeof scoreCards.$inferInsert;

// ─── score_card_lines ─────────────────────────────────────────────────────────

export const scoreCardLines = pgTable("score_card_lines", {
  id: serial("id").primaryKey(),
  scoreCardId: integer("score_card_id").notNull()
    .references(() => scoreCards.id, { onDelete: "cascade" }),
  metricKey: text("metric_key").notNull(),
  rawValue: numeric("raw_value"),
  gridScore: numeric("grid_score", { precision: 3, scale: 2 }).notNull(),
  weightedScore: numeric("weighted_score", { precision: 6, scale: 4 }).notNull(),
  issues: text("issues"),
  solution: text("solution"),
  authoredByUserId: integer("authored_by_user_id").references(() => users.id),
  authoredAt: timestamp("authored_at"),
});

export type ScoreCardLine = typeof scoreCardLines.$inferSelect;
export type InsertScoreCardLine = typeof scoreCardLines.$inferInsert;

// ─── notifications ────────────────────────────────────────────────────────────

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  type: varchar("type", { length: 50 }).notNull(),
  titleAr: text("title_ar").notNull(),
  titleEn: text("title_en").notNull(),
  bodyAr: text("body_ar"),
  bodyEn: text("body_en"),
  linkPath: text("link_path"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ─── feature_flags ────────────────────────────────────────────────────────────

export const featureFlags = pgTable("feature_flags", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  labelAr: text("label_ar").notNull(),
  labelEn: text("label_en").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  appliesToRoles: jsonb("applies_to_roles").$type<string[] | null>(), // null = global
  updatedByUserId: integer("updated_by_user_id").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type InsertFeatureFlag = typeof featureFlags.$inferInsert;

// ─── permission_grants ────────────────────────────────────────────────────────
// Each row: "this role currently has this permission". Super Admin edits live.

export const permissionGrants = pgTable("permission_grants", {
  id: serial("id").primaryKey(),
  role: varchar("role", { length: 50 }).notNull(),
  permissionKey: text("permission_key").notNull(),
  grantedByUserId: integer("granted_by_user_id").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [unique().on(t.role, t.permissionKey)]);

export type PermissionGrant = typeof permissionGrants.$inferSelect;

// ─── schedules (WFM weekly shifts) ───────────────────────────────────────────
// One row per agent per week; shifts_json holds 7 days of WeeklyShifts.

export const schedules = pgTable("schedules", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agents.id),
  weekStart: text("week_start").notNull(), // ISO date, Sunday
  shiftsJson: text("shifts_json").notNull().default("{}"),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [unique().on(t.agentId, t.weekStart)]);

export type Schedule = typeof schedules.$inferSelect;
export type InsertSchedule = typeof schedules.$inferInsert;

export interface ShiftBreak {
  start: string; // "12:00"
  end: string;   // "12:30"
}

export interface ShiftDay {
  start?: string;       // "08:00"
  end?: string;         // "16:00"
  breaks?: ShiftBreak[];        // multi-break support (preferred)
  breakStart?: string;          // legacy single-break (read-only fallback)
  breakEnd?: string;
  isOff?: boolean;
}

export interface WeeklyShifts {
  [day: string]: ShiftDay;  // keys: sun, mon, tue, wed, thu, fri, sat
}

// ─── schedule_settings (WFM break policy per project per week) ───────────────

export const scheduleSettings = pgTable("schedule_settings", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  weekStart: text("week_start").notNull(),
  breaksPerShift: integer("breaks_per_shift").notNull().default(1),
  breakDurationMin: integer("break_duration_min").notNull().default(30),
  // Hard cap: at most N agents on break at the same minute on the same day.
  maxConcurrentBreaks: integer("max_concurrent_breaks").notNull().default(2),
  updatedByUserId: integer("updated_by_user_id").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [unique().on(t.projectId, t.weekStart)]);

export type ScheduleSettings = typeof scheduleSettings.$inferSelect;
export type InsertScheduleSettings = typeof scheduleSettings.$inferInsert;

// ─── shift_swap_requests (agent → supervisor → WFM) ──────────────────────────

export const SWAP_STATUSES = [
  "pending_supervisor",
  "pending_wfm",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type SwapStatus = (typeof SWAP_STATUSES)[number];

export const shiftSwapRequests = pgTable("shift_swap_requests", {
  id: serial("id").primaryKey(),
  requesterAgentId: integer("requester_agent_id").notNull().references(() => agents.id),
  targetAgentId: integer("target_agent_id").notNull().references(() => agents.id),
  weekStart: text("week_start").notNull(),
  dayKey: text("day_key").notNull(),                       // sun..sat
  status: varchar("status", { length: 30 }).notNull().default("pending_supervisor"),
  requesterComment: text("requester_comment"),
  supervisorComment: text("supervisor_comment"),
  wfmComment: text("wfm_comment"),
  supervisorUserId: integer("supervisor_user_id").references(() => users.id),
  wfmUserId: integer("wfm_user_id").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ShiftSwapRequest = typeof shiftSwapRequests.$inferSelect;
export type InsertShiftSwapRequest = typeof shiftSwapRequests.$inferInsert;

// ─── qc_entries (legacy QC flow, rebuilt clean) ──────────────────────────────

export const qcEntries = pgTable("qc_entries", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull().references(() => agents.id),
  callDate: text("call_date").notNull(),
  contactNumber: text("contact_number").notNull(),
  caseNumber: text("case_number").notNull(),
  actionRequired: text("action_required").notNull(),
  qualityInternal: text("quality_internal").notNull(),
  qualityExternal: text("quality_external").notNull(),
  customerSatisfaction: text("customer_satisfaction").notNull(),
  defectReason: text("defect_reason").notNull(),
  requiredActionDetail: text("required_action_detail").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending_supervisor"),
  audioUrl: text("audio_url"),
  supervisorComment: text("supervisor_comment"),
  qualityNote: text("quality_note"),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertQcEntrySchema = createInsertSchema(qcEntries).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type QcEntry = typeof qcEntries.$inferSelect;
export type InsertQcEntry = z.infer<typeof insertQcEntrySchema>;
