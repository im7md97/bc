import type { Express } from "express";
import { db } from "../db";
import {
  agents, projects, users, aprSnapshots, aprRows, scoreCards, scoreCardLines,
  scoreCardGridConfigs, type ScoreTier, type ScoreCardGridConfig,
} from "@shared/schema";
import { eq, and, inArray, desc, gte, lte } from "drizzle-orm";
import { requirePermission, requireFeature, grantsOf, isFeatureEnabled } from "../permissions";
import { sendError, errInternal, errNotFound, errInvalidId } from "../http-errors";
import { getScopedAgents } from "../scoping";
import { sendXlsx } from "../excel";
import { formatHms } from "../duration";
import { notifyUser } from "../notify";
import type { SessionUser } from "../auth";

const SC_SCOPE = {
  all: "scorecard.view_all",
  project: "scorecard.view_project",
  team: "scorecard.view_team",
  own: "scorecard.view_own",
};

// ─── Scoring (§8.1) ───────────────────────────────────────────────────────────

/** Bands are evaluated in stored order; first band whose max bounds the value
 *  wins; the catch-all band (no max) closes the list. Works for both
 *  higher-is-better and lower-is-better grids. */
export function evalTiers(tiers: ScoreTier[], value: number): number {
  for (const t of tiers) {
    if (t.max === undefined || t.max === null) return t.score;
    if (t.maxInclusive ? value <= t.max : value < t.max) return t.score;
  }
  return 0;
}

export function evalGrid(config: ScoreCardGridConfig, rawValue: number | null): number {
  if (rawValue === null || rawValue === undefined || isNaN(rawValue)) return 0;
  if (config.scoringType === "binary") {
    const threshold = Number(config.binaryThreshold);
    if (isNaN(threshold)) return 0;
    const pass = config.binaryDirection === "lte" ? rawValue <= threshold : rawValue >= threshold;
    return pass ? 1 : 0;
  }
  const tiers = (config.tiers ?? []) as ScoreTier[];
  if (tiers.length === 0) return 0;
  return evalTiers(tiers, rawValue);
}

/** Monthly raw value for one grid line from the agent's APR rows (§8.1). */
function computeRawValue(config: ScoreCardGridConfig, rowsMetrics: Record<string, unknown>[]): number | null {
  const numbersOf = (key: string) =>
    rowsMetrics.map((m) => Number(m?.[key])).filter((n) => !isNaN(n));

  // Derived metrics from the default grid (§8.6).
  if (config.metricKey === "attendance_pct") {
    const present = numbersOf("present").reduce((a, b) => a + b, 0);
    const absent = numbersOf("absent").reduce((a, b) => a + b, 0);
    return present + absent > 0 ? present / (present + absent) : null;
  }
  if (config.metricKey === "net_login_pct") {
    const login = numbersOf("net_login").reduce((a, b) => a + b, 0);
    const schedule = numbersOf("schedule").reduce((a, b) => a + b, 0);
    return schedule > 0 ? login / schedule : null;
  }

  const sourceKey = config.sourceMetricKey ?? config.metricKey;
  const values = numbersOf(sourceKey);
  if (values.length === 0) return null;
  if (config.aggregation === "sum") return values.reduce((a, b) => a + b, 0);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function validateWeights(rows: { weight: string | number; isActive?: boolean }[]): boolean {
  const sum = rows.filter((r) => r.isActive !== false)
    .reduce((acc, r) => acc + Number(r.weight), 0);
  return Math.abs(sum - 1) <= 0.0001;
}

async function getCardScoped(req: any, cardId: number) {
  const me = req.user as SessionUser;
  const [card] = await db.select().from(scoreCards).where(eq(scoreCards.id, cardId));
  if (!card) return { card: null, agent: null, allowed: false };
  const [agent] = await db.select().from(agents).where(eq(agents.id, card.agentId));
  const grants = grantsOf(req);
  let allowed = false;
  if (grants.has("scorecard.view_all")) allowed = true;
  else if (grants.has("scorecard.view_project")) {
    const [project] = await db.select().from(projects).where(eq(projects.id, card.projectId));
    allowed = project?.managerUserId === me.id;
  } else if (grants.has("scorecard.view_team")) {
    allowed = agent?.supervisorUserId === me.id;
  } else if (grants.has("scorecard.view_own")) {
    allowed = agent?.userId === me.id && card.status !== "draft";
  }
  return { card, agent, allowed };
}

export function registerScoreCardRoutes(app: Express) {
  // ── Grid editor (§8.5) ───────────────────────────────────────────────────────
  app.get("/api/scorecards/grid/:projectId", requirePermission("scorecard.grid_edit"), async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      if (isNaN(projectId)) return errInvalidId(res);
      const rows = await db.select().from(scoreCardGridConfigs)
        .where(eq(scoreCardGridConfigs.projectId, projectId))
        .orderBy(scoreCardGridConfigs.displayOrder);
      res.json(rows);
    } catch {
      errInternal(res);
    }
  });

  app.put("/api/scorecards/grid/:projectId", requirePermission("scorecard.grid_edit"), async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      if (isNaN(projectId)) return errInvalidId(res);
      const rows = req.body?.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        return sendError(res, 400, "missing_fields", "لا توجد صفوف", "No rows provided");
      }
      // Hard rule: active weights must sum to exactly 1.0 ±0.0001 (§8.5).
      if (!validateWeights(rows)) {
        const sum = rows.filter((r: any) => r.isActive !== false).reduce((a: number, r: any) => a + Number(r.weight), 0);
        return sendError(res, 400, "weight_sum_invalid",
          `مجموع الأوزان يجب أن يساوي 1.0 بالضبط (الحالي: ${sum.toFixed(4)})`,
          `Active weights must sum to exactly 1.0 (current: ${sum.toFixed(4)})`,
          { sum });
      }
      for (const row of rows) {
        const values = {
          labelAr: String(row.labelAr ?? ""),
          labelEn: String(row.labelEn ?? ""),
          weight: String(Number(row.weight).toFixed(4)),
          scoringType: row.scoringType === "binary" ? "binary" : "tiered",
          tierDirection: row.tierDirection === "lower_better" ? "lower_better" : "higher_better",
          tiers: Array.isArray(row.tiers) ? row.tiers : null,
          binaryThreshold: row.binaryThreshold !== null && row.binaryThreshold !== undefined && row.binaryThreshold !== ""
            ? String(row.binaryThreshold) : null,
          binaryDirection: ["gte", "lte"].includes(row.binaryDirection) ? row.binaryDirection : null,
          aggregation: row.aggregation === "sum" ? "sum" : "average",
          sourceMetricKey: row.sourceMetricKey ? String(row.sourceMetricKey) : null,
          displayOrder: Number(row.displayOrder) || 0,
          isActive: row.isActive !== false,
        };
        if (row.id) {
          await db.update(scoreCardGridConfigs).set(values)
            .where(and(eq(scoreCardGridConfigs.id, Number(row.id)), eq(scoreCardGridConfigs.projectId, projectId)));
        } else if (row.metricKey) {
          await db.insert(scoreCardGridConfigs)
            .values({ ...values, projectId, metricKey: String(row.metricKey) })
            .onConflictDoNothing();
        }
      }
      const updated = await db.select().from(scoreCardGridConfigs)
        .where(eq(scoreCardGridConfigs.projectId, projectId))
        .orderBy(scoreCardGridConfigs.displayOrder);
      res.json(updated);
    } catch {
      errInternal(res);
    }
  });

  // ── Generation (§8.1, §8.4 re-generation) ───────────────────────────────────
  app.post("/api/scorecards/generate", requirePermission("scorecard.generate"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const projectId = Number(req.body?.projectId);
      const periodYear = Number(req.body?.periodYear);
      const periodMonth = Number(req.body?.periodMonth);
      if (isNaN(projectId) || isNaN(periodYear) || periodMonth < 1 || periodMonth > 12) {
        return sendError(res, 400, "missing_fields",
          "المشروع والسنة والشهر مطلوبة", "Project, year and month are required");
      }

      const configs = await db.select().from(scoreCardGridConfigs)
        .where(and(eq(scoreCardGridConfigs.projectId, projectId), eq(scoreCardGridConfigs.isActive, true)))
        .orderBy(scoreCardGridConfigs.displayOrder);
      if (configs.length === 0) {
        return sendError(res, 400, "no_grid", "لا توجد شبكة تقييم لهذا المشروع", "No grid configured for this project");
      }
      if (!validateWeights(configs)) {
        return sendError(res, 400, "weight_sum_invalid",
          "أوزان الشبكة لا تساوي 1.0 — عدّل الشبكة أولاً", "Grid weights do not sum to 1.0 — fix the grid first");
      }

      const monthStart = `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`;
      const monthEnd = `${periodYear}-${String(periodMonth).padStart(2, "0")}-31`;
      const snaps = await db.select().from(aprSnapshots)
        .where(and(
          eq(aprSnapshots.projectId, projectId),
          gte(aprSnapshots.asOfDate, monthStart),
          lte(aprSnapshots.asOfDate, monthEnd),
        ));
      if (snaps.length === 0) {
        return sendError(res, 400, "no_apr_data",
          "لا توجد بيانات APR لهذا الشهر", "No APR data exists for this month");
      }
      const snapIds = snaps.map((s) => s.id);
      const rows = await db.select().from(aprRows).where(inArray(aprRows.snapshotId, snapIds));

      const rowsByAgent = new Map<number, Record<string, unknown>[]>();
      for (const row of rows) {
        if (!rowsByAgent.has(row.agentId)) rowsByAgent.set(row.agentId, []);
        rowsByAgent.get(row.agentId)!.push(row.metrics as Record<string, unknown>);
      }

      const agentIds = Array.from(rowsByAgent.keys());
      const agentRows = agentIds.length > 0
        ? await db.select().from(agents).where(inArray(agents.id, agentIds))
        : [];
      const agentById = new Map(agentRows.map((a) => [a.id, a]));

      type Computed = { agentId: number; finalScore: number; lines: { metricKey: string; rawValue: number | null; gridScore: number; weightedScore: number }[] };
      const computed: Computed[] = [];
      for (const [agentId, metricRows] of rowsByAgent.entries()) {
        if (!agentById.get(agentId)) continue;
        const lines = configs.map((config) => {
          const rawValue = computeRawValue(config, metricRows);
          const gridScore = evalGrid(config, rawValue);
          const weightedScore = gridScore * Number(config.weight);
          return { metricKey: config.metricKey, rawValue, gridScore, weightedScore };
        });
        const finalScore = lines.reduce((acc, l) => acc + l.weightedScore, 0);
        computed.push({ agentId, finalScore, lines });
      }

      // rank_in_team: position among the same supervisor's agents (§8.1).
      const byTeam = new Map<string, Computed[]>();
      for (const c of computed) {
        const teamKey = String(agentById.get(c.agentId)?.supervisorUserId ?? "none");
        if (!byTeam.has(teamKey)) byTeam.set(teamKey, []);
        byTeam.get(teamKey)!.push(c);
      }
      const rankByAgent = new Map<number, number>();
      for (const team of byTeam.values()) {
        team.sort((a, b) => b.finalScore - a.finalScore);
        team.forEach((c, i) => rankByAgent.set(c.agentId, i + 1));
      }

      let created = 0;
      let regenerated = 0;
      await db.transaction(async (tx) => {
        for (const c of computed) {
          const [existing] = await tx.select().from(scoreCards).where(and(
            eq(scoreCards.projectId, projectId),
            eq(scoreCards.agentId, c.agentId),
            eq(scoreCards.periodYear, periodYear),
            eq(scoreCards.periodMonth, periodMonth),
          ));

          let cardId: number;
          // Supervisor-written text survives regeneration via metric_key join (§8.4).
          const preserved = new Map<string, { issues: string | null; solution: string | null; authoredByUserId: number | null; authoredAt: Date | null }>();
          if (existing) {
            const oldLines = await tx.select().from(scoreCardLines).where(eq(scoreCardLines.scoreCardId, existing.id));
            for (const ol of oldLines) {
              preserved.set(ol.metricKey, {
                issues: ol.issues, solution: ol.solution,
                authoredByUserId: ol.authoredByUserId, authoredAt: ol.authoredAt,
              });
            }
            await tx.delete(scoreCardLines).where(eq(scoreCardLines.scoreCardId, existing.id));
            await tx.update(scoreCards).set({
              finalScore: c.finalScore.toFixed(4),
              rankInTeam: rankByAgent.get(c.agentId) ?? null,
              generatedByUserId: me.id,
              updatedAt: new Date(),
            }).where(eq(scoreCards.id, existing.id));
            cardId = existing.id;
            regenerated++;
          } else {
            const [card] = await tx.insert(scoreCards).values({
              projectId,
              agentId: c.agentId,
              periodYear,
              periodMonth,
              generatedByUserId: me.id,
              status: "draft",
              finalScore: c.finalScore.toFixed(4),
              rankInTeam: rankByAgent.get(c.agentId) ?? null,
            }).returning();
            cardId = card.id;
            created++;
          }

          await tx.insert(scoreCardLines).values(c.lines.map((l) => ({
            scoreCardId: cardId,
            metricKey: l.metricKey,
            rawValue: l.rawValue !== null ? String(l.rawValue) : null,
            gridScore: l.gridScore.toFixed(2),
            weightedScore: l.weightedScore.toFixed(4),
            issues: preserved.get(l.metricKey)?.issues ?? null,
            solution: preserved.get(l.metricKey)?.solution ?? null,
            authoredByUserId: preserved.get(l.metricKey)?.authoredByUserId ?? null,
            authoredAt: preserved.get(l.metricKey)?.authoredAt ?? null,
          })));
        }
      });

      res.json({ created, regenerated, agents: computed.length });
    } catch {
      errInternal(res);
    }
  });

  // ── Lists & detail, scoped (§8.2–8.4) ────────────────────────────────────────
  app.get("/api/scorecards", requirePermission("scorecard.view_all", "scorecard.view_project", "scorecard.view_team", "scorecard.view_own"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const grants = grantsOf(req);
      const scoped = await getScopedAgents(me, grants, SC_SCOPE);
      if (scoped.length === 0) return res.json([]);
      const agentIds = scoped.map((a) => a.id);
      const agentById = new Map(scoped.map((a) => [a.id, a]));

      let cards = await db.select().from(scoreCards)
        .where(inArray(scoreCards.agentId, agentIds))
        .orderBy(desc(scoreCards.periodYear), desc(scoreCards.periodMonth));
      // Agents never see drafts (§8.2: supervisor sends first).
      const ownOnly = !grants.has("scorecard.view_all") && !grants.has("scorecard.view_project") && !grants.has("scorecard.view_team");
      if (ownOnly) cards = cards.filter((c) => c.status !== "draft");
      if (req.query.projectId) cards = cards.filter((c) => c.projectId === Number(req.query.projectId));
      if (req.query.year) cards = cards.filter((c) => c.periodYear === Number(req.query.year));
      if (req.query.month) cards = cards.filter((c) => c.periodMonth === Number(req.query.month));
      if (req.query.status) cards = cards.filter((c) => c.status === String(req.query.status));

      const projectRows = await db.select().from(projects);
      const projectById = new Map(projectRows.map((p) => [p.id, p]));
      res.json(cards.map((c) => ({
        ...c,
        agentNameAr: agentById.get(c.agentId)?.nameAr ?? null,
        agentNameEn: agentById.get(c.agentId)?.nameEn ?? null,
        employeeId: agentById.get(c.agentId)?.employeeId ?? null,
        projectNameAr: projectById.get(c.projectId)?.nameAr ?? null,
        projectNameEn: projectById.get(c.projectId)?.nameEn ?? null,
      })));
    } catch {
      errInternal(res);
    }
  });

  app.get("/api/scorecards/:id", requirePermission("scorecard.view_all", "scorecard.view_project", "scorecard.view_team", "scorecard.view_own"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id)) return errInvalidId(res);
      const { card, agent, allowed } = await getCardScoped(req, id);
      if (!card) return errNotFound(res);
      if (!allowed) {
        return sendError(res, 403, "forbidden", "ليس لديك صلاحية لهذه البطاقة", "No access to this score card");
      }
      const lines = await db.select().from(scoreCardLines).where(eq(scoreCardLines.scoreCardId, id));
      const configs = await db.select().from(scoreCardGridConfigs)
        .where(eq(scoreCardGridConfigs.projectId, card.projectId))
        .orderBy(scoreCardGridConfigs.displayOrder);
      const configByKey = new Map(configs.map((c) => [c.metricKey, c]));
      const orderedLines = [...lines].sort((a, b) =>
        (configByKey.get(a.metricKey)?.displayOrder ?? 0) - (configByKey.get(b.metricKey)?.displayOrder ?? 0));
      res.json({
        card: {
          ...card,
          agentNameAr: agent?.nameAr ?? null,
          agentNameEn: agent?.nameEn ?? null,
          employeeId: agent?.employeeId ?? null,
        },
        lines: orderedLines.map((l) => ({
          ...l,
          labelAr: configByKey.get(l.metricKey)?.labelAr ?? l.metricKey,
          labelEn: configByKey.get(l.metricKey)?.labelEn ?? l.metricKey,
          weight: configByKey.get(l.metricKey)?.weight ?? null,
          tierDirection: configByKey.get(l.metricKey)?.tierDirection ?? "higher_better",
        })),
      });
    } catch {
      errInternal(res);
    }
  });

  // ── Supervisor: issues & solutions (§8.2) ────────────────────────────────────
  app.put("/api/scorecards/lines/:lineId", requirePermission("scorecard.write_issues"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const lineId = Number(req.params.lineId);
      if (isNaN(lineId)) return errInvalidId(res);
      const [line] = await db.select().from(scoreCardLines).where(eq(scoreCardLines.id, lineId));
      if (!line) return errNotFound(res);
      const [card] = await db.select().from(scoreCards).where(eq(scoreCards.id, line.scoreCardId));
      if (!card) return errNotFound(res);
      const [agent] = await db.select().from(agents).where(eq(agents.id, card.agentId));
      if (agent?.supervisorUserId !== me.id && !grantsOf(req).has("scorecard.view_all")) {
        return sendError(res, 403, "forbidden", "هذا الوكيل ليس ضمن فريقك", "This agent is not in your team");
      }
      if (card.status === "confirmed") {
        return sendError(res, 400, "already_confirmed", "البطاقة مؤكدة ولا يمكن تعديلها", "Card already confirmed");
      }
      const { issues, solution } = req.body ?? {};
      const [updated] = await db.update(scoreCardLines).set({
        issues: issues !== undefined ? (issues ? String(issues) : null) : line.issues,
        solution: solution !== undefined ? (solution ? String(solution) : null) : line.solution,
        authoredByUserId: me.id,
        authoredAt: new Date(),
      }).where(eq(scoreCardLines.id, lineId)).returning();
      res.json(updated);
    } catch {
      errInternal(res);
    }
  });

  app.post("/api/scorecards/:id/send", requirePermission("scorecard.send_to_agent"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const id = Number(req.params.id);
      if (isNaN(id)) return errInvalidId(res);
      const [card] = await db.select().from(scoreCards).where(eq(scoreCards.id, id));
      if (!card) return errNotFound(res);
      const [agent] = await db.select().from(agents).where(eq(agents.id, card.agentId));
      if (agent?.supervisorUserId !== me.id && !grantsOf(req).has("scorecard.view_all")) {
        return sendError(res, 403, "forbidden", "هذا الوكيل ليس ضمن فريقك", "This agent is not in your team");
      }
      if (card.status !== "draft") {
        return sendError(res, 400, "invalid_status", "تم إرسال البطاقة مسبقاً", "Card already sent");
      }
      const [updated] = await db.update(scoreCards).set({
        status: "awaiting_agent",
        sentToAgentAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(scoreCards.id, id)).returning();

      if (agent?.userId) {
        await notifyUser({
          userId: agent.userId,
          type: "scorecard_sent",
          titleAr: "بطاقة أداء جديدة بانتظار تأكيدك",
          titleEn: "A new score card awaits your confirmation",
          bodyAr: `بطاقة أداء شهر ${card.periodMonth}/${card.periodYear}`,
          bodyEn: `Score card for ${card.periodMonth}/${card.periodYear}`,
          linkPath: `/scorecards/${card.id}`,
        });
      }
      res.json(updated);
    } catch {
      errInternal(res);
    }
  });

  // ── Agent: confirm (§8.3) ────────────────────────────────────────────────────
  app.post("/api/scorecards/:id/confirm", requirePermission("scorecard.confirm"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const id = Number(req.params.id);
      if (isNaN(id)) return errInvalidId(res);
      const [card] = await db.select().from(scoreCards).where(eq(scoreCards.id, id));
      if (!card) return errNotFound(res);
      const [agent] = await db.select().from(agents).where(eq(agents.id, card.agentId));
      if (agent?.userId !== me.id) {
        return sendError(res, 403, "forbidden", "هذه البطاقة ليست لك", "This score card is not yours");
      }
      if (card.status !== "awaiting_agent") {
        return sendError(res, 400, "invalid_status", "البطاقة غير قابلة للتأكيد", "Card is not awaiting confirmation");
      }
      const commentAllowed = await isFeatureEnabled("scorecard.agent_comment", me.role);
      const comment = commentAllowed && req.body?.comment ? String(req.body.comment).trim() : null;
      const [updated] = await db.update(scoreCards).set({
        status: "confirmed",
        confirmedAt: new Date(),
        agentComment: comment,
        updatedAt: new Date(),
      }).where(eq(scoreCards.id, id)).returning();

      if (agent?.supervisorUserId) {
        await notifyUser({
          userId: agent.supervisorUserId,
          type: "scorecard_confirmed",
          titleAr: "أكد الوكيل بطاقة الأداء",
          titleEn: "Agent confirmed the score card",
          bodyAr: `أكد ${agent.nameAr} بطاقة ${card.periodMonth}/${card.periodYear}${comment ? " مع تعليق" : ""}`,
          bodyEn: `${agent.nameEn} confirmed the ${card.periodMonth}/${card.periodYear} card${comment ? " with a comment" : ""}`,
          linkPath: `/scorecards/${card.id}`,
        });
      }
      res.json(updated);
    } catch {
      errInternal(res);
    }
  });

  // ── Export (§8.4) ────────────────────────────────────────────────────────────
  app.get("/api/scorecards/export", requireFeature("scorecard.export"), requirePermission("scorecard.export"), async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const lang = me.preferredLanguage === "en" ? "en" : "ar";
      const scoped = await getScopedAgents(me, grantsOf(req), SC_SCOPE);
      if (scoped.length === 0) return sendXlsx(res, "scorecards.xlsx", [{ name: "ScoreCards", rows: [] }]);
      const agentIds = scoped.map((a) => a.id);
      const agentById = new Map(scoped.map((a) => [a.id, a]));

      let cards = await db.select().from(scoreCards).where(inArray(scoreCards.agentId, agentIds));
      if (req.query.projectId) cards = cards.filter((c) => c.projectId === Number(req.query.projectId));
      if (req.query.year) cards = cards.filter((c) => c.periodYear === Number(req.query.year));
      if (req.query.month) cards = cards.filter((c) => c.periodMonth === Number(req.query.month));

      const cardIds = cards.map((c) => c.id);
      const lines = cardIds.length > 0
        ? await db.select().from(scoreCardLines).where(inArray(scoreCardLines.scoreCardId, cardIds))
        : [];
      const linesByCard = new Map<number, typeof lines>();
      for (const l of lines) {
        if (!linesByCard.has(l.scoreCardId)) linesByCard.set(l.scoreCardId, []);
        linesByCard.get(l.scoreCardId)!.push(l);
      }
      const projectIds = Array.from(new Set(cards.map((c) => c.projectId)));
      const configs = projectIds.length > 0
        ? await db.select().from(scoreCardGridConfigs).where(inArray(scoreCardGridConfigs.projectId, projectIds))
        : [];
      const configByProjectKey = new Map(configs.map((c) => [`${c.projectId}|${c.metricKey}`, c]));

      const summaryRows = cards.map((c) => ({
        Emp: agentById.get(c.agentId)?.employeeId ?? "",
        Name: lang === "ar" ? agentById.get(c.agentId)?.nameAr ?? "" : agentById.get(c.agentId)?.nameEn ?? "",
        Period: `${c.periodYear}-${String(c.periodMonth).padStart(2, "0")}`,
        "Final Score": c.finalScore ? `${(Number(c.finalScore) * 100).toFixed(1)}%` : "",
        Rank: c.rankInTeam ?? "",
        Status: c.status,
        "Agent Comment": c.agentComment ?? "",
      }));

      const detailRows: Record<string, unknown>[] = [];
      for (const c of cards) {
        for (const l of (linesByCard.get(c.id) ?? [])) {
          const config = configByProjectKey.get(`${c.projectId}|${l.metricKey}`);
          const isDuration = l.metricKey === "aht_seconds";
          detailRows.push({
            Emp: agentById.get(c.agentId)?.employeeId ?? "",
            Name: lang === "ar" ? agentById.get(c.agentId)?.nameAr ?? "" : agentById.get(c.agentId)?.nameEn ?? "",
            Period: `${c.periodYear}-${String(c.periodMonth).padStart(2, "0")}`,
            Metric: lang === "ar" ? config?.labelAr ?? l.metricKey : config?.labelEn ?? l.metricKey,
            "Raw Value": l.rawValue !== null
              ? (isDuration ? formatHms(Number(l.rawValue)) : Number(l.rawValue).toFixed(4))
              : "",
            "Grid Score": l.gridScore,
            Weight: config?.weight ?? "",
            "Weighted Score": l.weightedScore,
            Issues: l.issues ?? "",
            Solution: l.solution ?? "",
          });
        }
      }

      sendXlsx(res, `scorecards-${req.query.year ?? "all"}-${req.query.month ?? "all"}.xlsx`, [
        { name: "Summary", rows: summaryRows },
        { name: "Details", rows: detailRows },
      ]);
    } catch {
      errInternal(res);
    }
  });
}
