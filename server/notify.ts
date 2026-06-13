import { db } from "./db";
import { notifications, users, type InsertNotification } from "@shared/schema";
import { eq } from "drizzle-orm";

type NotificationInput = Omit<InsertNotification, "id" | "createdAt" | "isRead">;

export async function notifyUser(input: NotificationInput): Promise<void> {
  await db.insert(notifications).values(input);
}

export async function notifyUsers(userIds: number[], base: Omit<NotificationInput, "userId">): Promise<void> {
  if (userIds.length === 0) return;
  await db.insert(notifications).values(userIds.map((userId) => ({ ...base, userId })));
}

/** Notify every active user holding the given role (e.g. all admins). */
export async function notifyRole(role: string, base: Omit<NotificationInput, "userId">): Promise<void> {
  const recipients = await db.select({ id: users.id }).from(users)
    .where(eq(users.role, role));
  await notifyUsers(recipients.map((r) => r.id), base);
}
