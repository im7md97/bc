import { pgTable, text, serial, timestamp, varchar, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Roles: quality | supervisor | agent | admin
// Workflow: quality creates → pending_supervisor → supervisor approves (approved) or rejects (rejected) → agent sees approved

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
