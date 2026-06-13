import { db } from "./db";
import { agents, projects, type Agent } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import type { SessionUser } from "./auth";

/**
 * Resolves which agents the caller may see, decided purely by which scoped
 * permission keys they hold (never by raw role names):
 *   *.view_all / agent.list_all      → every agent
 *   *.view_project / agent.list_project → agents in projects they manage
 *   *.view_team / agent.list_team    → agents whose supervisor is the caller
 *   *.view_own                       → the agent row linked to their user_id
 */
export async function getScopedAgents(
  user: SessionUser,
  grants: Set<string>,
  scope: { all: string; project?: string; team?: string; own?: string },
): Promise<Agent[]> {
  if (grants.has(scope.all)) {
    return db.select().from(agents).where(eq(agents.isActive, true));
  }
  if (scope.project && grants.has(scope.project)) {
    const managed = await db.select({ id: projects.id }).from(projects)
      .where(eq(projects.managerUserId, user.id));
    const ids = managed.map((p) => p.id);
    if (ids.length === 0) return [];
    return db.select().from(agents)
      .where(and(eq(agents.isActive, true), inArray(agents.projectId, ids)));
  }
  if (scope.team && grants.has(scope.team)) {
    return db.select().from(agents)
      .where(and(eq(agents.isActive, true), eq(agents.supervisorUserId, user.id)));
  }
  if (scope.own && grants.has(scope.own)) {
    return db.select().from(agents)
      .where(and(eq(agents.isActive, true), eq(agents.userId, user.id)));
  }
  return [];
}

/** Pagination/search helpers for list endpoints (§13). */
export function parseListParams(query: any) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 50));
  const search = typeof query.search === "string" ? query.search.trim() : "";
  const sort = typeof query.sort === "string" ? query.sort : "";
  return { page, pageSize, search, sort, offset: (page - 1) * pageSize };
}
