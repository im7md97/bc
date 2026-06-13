/**
 * Promotes an existing user to super_admin.
 *
 *   npm run grant-super-admin -- <username>
 */
import "dotenv/config";

async function main() {
  const username = process.argv[2];
  if (!username) {
    console.error("Usage: npm run grant-super-admin -- <username>");
    process.exit(1);
  }
  const { db } = await import("../server/db");
  const { users } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const [user] = await db.select().from(users).where(eq(users.username, username));
  if (!user) {
    console.error(`User "${username}" not found`);
    process.exit(1);
  }
  await db.update(users).set({ role: "super_admin", updatedAt: new Date() }).where(eq(users.id, user.id));
  console.log(`✅ ${username} is now super_admin`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
