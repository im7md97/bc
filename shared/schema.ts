import { pgTable, text, serial, timestamp, varchar, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Roles: quality | supervisor | agent | admin | manager
// Workflow: quality creates → pending_supervisor → supervisor approves/rejects → agent sees approved

export const entries = pgTable("entries", {
  id: serial("id").primaryKey(),
  employeeName: text("employee_name").notNull(),
  nationalId: text("national_id").notNull(),
  callDate: text("call_date").notNull(),
  contactNumber: text("contact_number").notNull(),
  caseNumber: text("case_number").notNull(),
  employeeId: text("employee_id").notNull(),
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
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertEntrySchema = createInsertSchema(entries).omit({ id: true, createdAt: true });

export type Entry = typeof entries.$inferSelect;
export type InsertEntry = z.infer<typeof insertEntrySchema>;
export type CreateEntryRequest = InsertEntry;
export type UpdateEntryRequest = Partial<InsertEntry>;
export type EntryResponse = Entry;
export type EntriesListResponse = Entry[];

// ─── System Users ─────────────────────────────────────────────────────────────

export const systemUsers = pgTable("system_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  role: varchar("role", { length: 50 }).notNull().default("quality"),
  passwordHash: text("password_hash").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSystemUserSchema = createInsertSchema(systemUsers).omit({ id: true, createdAt: true });

export type SystemUser = typeof systemUsers.$inferSelect;
export type InsertSystemUser = z.infer<typeof insertSystemUserSchema>;
export type CreateSystemUserRequest = InsertSystemUser;
export type SystemUserResponse = Omit<SystemUser, "passwordHash">;
export type SystemUsersListResponse = SystemUserResponse[];

// ─── Projects ─────────────────────────────────────────────────────────────────

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true });

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type CreateProjectRequest = InsertProject;
export type ProjectResponse = Project;

// ─── Schedules (WFM) ──────────────────────────────────────────────────────────

export const schedules = pgTable("schedules", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id").notNull(),
  weekStart: text("week_start").notNull(),
  shiftsJson: text("shifts_json").notNull().default("{}"),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertScheduleSchema = createInsertSchema(schedules).omit({ id: true, createdAt: true, updatedAt: true });

export type Schedule = typeof schedules.$inferSelect;
export type InsertSchedule = z.infer<typeof insertScheduleSchema>;

export interface ShiftDay {
  start: string;
  end: string;
  breakStart?: string;
  breakEnd?: string;
  isOff?: boolean;
}

export interface WeeklyShifts {
  [day: string]: ShiftDay;
}
