import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import {
  entries, systemUsers, projects, schedules,
  type CreateEntryRequest, type UpdateEntryRequest, type EntryResponse,
  type CreateSystemUserRequest, type SystemUser,
  type CreateProjectRequest, type ProjectResponse,
  type InsertSchedule, type Schedule,
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set.");
const db = drizzle(new pg.Pool({ connectionString: process.env.DATABASE_URL }), { schema });

export interface IStorage {
  // Entries
  getEntries(): Promise<EntryResponse[]>;
  getEntriesByRole(role: string, userId: number): Promise<EntryResponse[]>;
  getEntry(id: number): Promise<EntryResponse | undefined>;
  createEntry(entry: CreateEntryRequest): Promise<EntryResponse>;
  updateEntry(id: number, updates: UpdateEntryRequest): Promise<EntryResponse>;
  reviewEntry(id: number, status: string, comment?: string): Promise<EntryResponse>;
  resubmitEntry(id: number, qualityNote: string): Promise<EntryResponse>;
  deleteEntry(id: number): Promise<void>;
  // System Users
  getSystemUsers(): Promise<Omit<SystemUser, "passwordHash">[]>;
  getSystemUserById(id: number): Promise<SystemUser | undefined>;
  getSystemUserByUsername(username: string): Promise<SystemUser | undefined>;
  createSystemUser(user: CreateSystemUserRequest): Promise<Omit<SystemUser, "passwordHash">>;
  updateSystemUserPassword(id: number, passwordHash: string): Promise<void>;
  updateSystemUserRole(id: number, role: string): Promise<void>;
  deleteSystemUser(id: number): Promise<void>;
  // Projects
  getProjects(): Promise<ProjectResponse[]>;
  getProject(id: number): Promise<ProjectResponse | undefined>;
  createProject(project: CreateProjectRequest): Promise<ProjectResponse>;
  updateProject(id: number, updates: Partial<CreateProjectRequest>): Promise<ProjectResponse>;
  deleteProject(id: number): Promise<void>;
  // Schedules
  getSchedules(): Promise<Schedule[]>;
  getScheduleByAgentAndWeek(agentId: number, weekStart: string): Promise<Schedule | undefined>;
  getSchedulesByAgent(agentId: number): Promise<Schedule[]>;
  createSchedule(schedule: InsertSchedule): Promise<Schedule>;
  updateSchedule(id: number, updates: Partial<InsertSchedule>): Promise<Schedule>;
  deleteSchedule(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getEntries(): Promise<EntryResponse[]> {
    return await db.select().from(entries).orderBy(desc(entries.createdAt));
  }

  async getEntriesByRole(role: string, userId: number): Promise<EntryResponse[]> {
    const all = await db.select().from(entries).orderBy(desc(entries.createdAt));
    if (role === "quality") {
      return all.filter(e => e.createdByUserId === userId);
    }
    if (role === "agent") {
      return all.filter(e => e.status === "approved");
    }
    // admin, manager, supervisor see all
    return all;
  }

  async getEntry(id: number): Promise<EntryResponse | undefined> {
    const [entry] = await db.select().from(entries).where(eq(entries.id, id));
    return entry;
  }

  async createEntry(entry: CreateEntryRequest): Promise<EntryResponse> {
    const [created] = await db.insert(entries).values({
      ...entry,
      status: "pending_supervisor",
    }).returning();
    return created;
  }

  async updateEntry(id: number, updates: UpdateEntryRequest): Promise<EntryResponse> {
    const [updated] = await db.update(entries).set(updates).where(eq(entries.id, id)).returning();
    return updated;
  }

  async reviewEntry(id: number, status: string, comment?: string): Promise<EntryResponse> {
    const updateData: any = { status };
    if (comment !== undefined) updateData.supervisorComment = comment;
    const [updated] = await db.update(entries).set(updateData).where(eq(entries.id, id)).returning();
    return updated;
  }

  async resubmitEntry(id: number, qualityNote: string): Promise<EntryResponse> {
    const [updated] = await db.update(entries)
      .set({ status: "pending_supervisor", qualityNote, supervisorComment: null })
      .where(eq(entries.id, id))
      .returning();
    return updated;
  }

  async deleteEntry(id: number): Promise<void> {
    await db.delete(entries).where(eq(entries.id, id));
  }

  async getSystemUsers(): Promise<Omit<SystemUser, "passwordHash">[]> {
    const users = await db.select().from(systemUsers).orderBy(desc(systemUsers.createdAt));
    return users.map(({ passwordHash: _, ...u }) => u);
  }

  async getSystemUserById(id: number): Promise<SystemUser | undefined> {
    const [user] = await db.select().from(systemUsers).where(eq(systemUsers.id, id));
    return user;
  }

  async getSystemUserByUsername(username: string): Promise<SystemUser | undefined> {
    const [user] = await db.select().from(systemUsers).where(eq(systemUsers.username, username));
    return user;
  }

  async createSystemUser(user: CreateSystemUserRequest): Promise<Omit<SystemUser, "passwordHash">> {
    const [created] = await db.insert(systemUsers).values(user).returning();
    const { passwordHash: _, ...safe } = created;
    return safe;
  }

  async updateSystemUserPassword(id: number, passwordHash: string): Promise<void> {
    await db.update(systemUsers).set({ passwordHash }).where(eq(systemUsers.id, id));
  }

  async updateSystemUserRole(id: number, role: string): Promise<void> {
    await db.update(systemUsers).set({ role }).where(eq(systemUsers.id, id));
  }

  async deleteSystemUser(id: number): Promise<void> {
    await db.delete(systemUsers).where(eq(systemUsers.id, id));
  }

  // ── Projects ────────────────────────────────────────────────────────────────

  async getProjects(): Promise<ProjectResponse[]> {
    return await db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async getProject(id: number): Promise<ProjectResponse | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(project: CreateProjectRequest): Promise<ProjectResponse> {
    const [created] = await db.insert(projects).values(project).returning();
    return created;
  }

  async updateProject(id: number, updates: Partial<CreateProjectRequest>): Promise<ProjectResponse> {
    const [updated] = await db.update(projects).set(updates).where(eq(projects.id, id)).returning();
    return updated;
  }

  async deleteProject(id: number): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  // ── Schedules ───────────────────────────────────────────────────────────────

  async getSchedules(): Promise<Schedule[]> {
    return await db.select().from(schedules).orderBy(desc(schedules.weekStart));
  }

  async getScheduleByAgentAndWeek(agentId: number, weekStart: string): Promise<Schedule | undefined> {
    const [s] = await db.select().from(schedules)
      .where(eq(schedules.agentId, agentId));
    // filter in memory since drizzle doesn't allow compound where easily here
    const all = await db.select().from(schedules)
      .where(eq(schedules.agentId, agentId));
    return all.find(x => x.weekStart === weekStart);
  }

  async getSchedulesByAgent(agentId: number): Promise<Schedule[]> {
    return await db.select().from(schedules)
      .where(eq(schedules.agentId, agentId))
      .orderBy(desc(schedules.weekStart));
  }

  async createSchedule(schedule: InsertSchedule): Promise<Schedule> {
    const [created] = await db.insert(schedules).values(schedule).returning();
    return created;
  }

  async updateSchedule(id: number, updates: Partial<InsertSchedule>): Promise<Schedule> {
    const [updated] = await db.update(schedules)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schedules.id, id))
      .returning();
    return updated;
  }

  async deleteSchedule(id: number): Promise<void> {
    await db.delete(schedules).where(eq(schedules.id, id));
  }
}

export const storage = new DatabaseStorage();
