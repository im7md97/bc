import { db } from "./db";
import {
  entries, systemUsers,
  type CreateEntryRequest, type UpdateEntryRequest, type EntryResponse,
  type CreateSystemUserRequest, type SystemUser,
} from "@shared/schema";
import { eq } from "drizzle-orm";

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
}

export class DatabaseStorage implements IStorage {
  async getEntries(): Promise<EntryResponse[]> {
    return await db.select().from(entries).orderBy(entries.createdAt);
  }

  async getEntriesByRole(role: string, userId: number): Promise<EntryResponse[]> {
    const all = await db.select().from(entries).orderBy(entries.createdAt);
    if (role === "quality") {
      return all.filter(e => e.createdByUserId === userId);
    }
    if (role === "supervisor") {
      return all; // supervisor sees all entries at all statuses
    }
    if (role === "agent") {
      return all.filter(e => e.status === "approved");
    }
    // admin sees all
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
    const users = await db.select().from(systemUsers);
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
}

export const storage = new DatabaseStorage();
