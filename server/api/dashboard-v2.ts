import type { Express } from "express";
import { db } from "../db";
import { users, agents } from "@shared/schema";
import { eq, inArray, and } from "drizzle-orm";
import { requireAuth, getPermissionsForRole } from "../permissions";
import { errInternal, sendError } from "../http-errors";
import { getScopedAgents } from "../scoping";
import { DATA_SOURCES, enrichSourceDefs, type QueryContext } from "../dashboard/sources";
import { getCatalog, runQuery, type QuerySpec } from "../dashboard/introspect";
import { publicCatalog as metricsPublicCatalog, runMetric, type MetricRunSpec } from "../dashboard/metrics";
import type { SessionUser } from "../auth";
import type { DashboardLayout, WidgetInstance } from "@shared/dashboard-v2";

const SCOPE = {
  all: "apr.view_all",
  project: "apr.view_project",
  team: "apr.view_team",
  own: "apr.view_own",
};

async function buildContext(user: SessionUser): Promise<QueryContext> {
  const grants = await getPermissionsForRole(user.role);
  const scopedAgents = await getScopedAgents(user, grants, SCOPE);
  return {
    user,
    grants,
    scopedAgentIds: scopedAgents.map((a) => a.id),
  };
}

/** In-place validation: strip anything a widget instance shouldn't have. */
function sanitizeLayout(raw: unknown): DashboardLayout {
  const empty: DashboardLayout = { cols: 12, rowHeight: 60, instances: [] };
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as any;
  const cols = Math.max(1, Math.min(24, Number(obj.cols) || 12));
  const rowHeight = Math.max(20, Math.min(200, Number(obj.rowHeight) || 60));
  const instances: WidgetInstance[] = Array.isArray(obj.instances)
    ? obj.instances.map((i: any) => ({
        id: String(i?.id ?? Math.random().toString(36).slice(2)),
        type: String(i?.type ?? "text"),
        layout: {
          x: Math.max(0, Number(i?.layout?.x) || 0),
          y: Math.max(0, Number(i?.layout?.y) || 0),
          w: Math.max(1, Math.min(cols, Number(i?.layout?.w) || 3)),
          h: Math.max(1, Number(i?.layout?.h) || 3),
        },
        config: typeof i?.config === "object" && i.config ? i.config : {},
        dataSource: i?.dataSource?.source ? {
          source: String(i.dataSource.source),
          params: (typeof i.dataSource.params === "object" && i.dataSource.params) || {},
        } : undefined,
        query: i?.query?.table ? i.query : undefined,
        metricSpec: i?.metricSpec?.metric ? {
          metric: String(i.metricSpec.metric),
          dimension: i.metricSpec.dimension ? String(i.metricSpec.dimension) : undefined,
          filters: Array.isArray(i.metricSpec.filters) ? i.metricSpec.filters : [],
          sort: i.metricSpec.sort === "asc" || i.metricSpec.sort === "desc" ? i.metricSpec.sort : undefined,
          limit: Number(i.metricSpec.limit) || 0,
        } : undefined,
        refreshMs: i?.refreshMs ? Math.max(1000, Math.min(3600000, Number(i.refreshMs))) : undefined,
        collapsed: !!i?.collapsed,
      }))
    : [];
  return { cols, rowHeight, instances };
}

export function registerDashboardV2Routes(app: Express) {
  // GET /api/dashboard/catalog — advertise every widget type + data source.
  app.get("/api/dashboard/catalog", requireAuth, async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const ctx = await buildContext(me);
      const sources = await enrichSourceDefs(ctx);
      const allowedSources = sources.filter((s) =>
        s.requiredPerms.some((p) => ctx.grants.has(p)));
      res.json({ sources: allowedSources });
    } catch (err) {
      console.error("[dashboard.catalog]", err);
      errInternal(res);
    }
  });

  // GET /api/dashboard/layout — the caller's saved dashboard.
  app.get("/api/dashboard/layout", requireAuth, async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const [row] = await db.select().from(users).where(eq(users.id, me.id));
      const rawLayout = (row as any)?.dashboardLayout ?? row?.dashboardWidgets;
      const layout = sanitizeLayout(rawLayout);
      res.json(layout);
    } catch (err) {
      console.error("[dashboard.layout.get]", err);
      errInternal(res);
    }
  });

  // PUT /api/dashboard/layout — save the whole layout.
  app.put("/api/dashboard/layout", requireAuth, async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const layout = sanitizeLayout(req.body);
      await db.update(users).set({
        dashboardWidgets: layout as any,
        updatedAt: new Date(),
      }).where(eq(users.id, me.id));
      res.json(layout);
    } catch (err) {
      console.error("[dashboard.layout.put]", err);
      errInternal(res);
    }
  });

  // POST /api/dashboard/query — run one data source with params.
  //
  //   Body: { source: string, params?: Record<string, any> }
  //   The user NEVER writes SQL. We look up the source, check its permissions
  //   against the caller's grants, validate the params, and execute.
  // GET /api/dashboard/schema — every visible table + column, live-introspected.
  app.get("/api/dashboard/schema", requireAuth, async (_req, res) => {
    try {
      const catalog = await getCatalog();
      res.json({ tables: catalog });
    } catch (err) {
      console.error("[dashboard.schema]", err);
      errInternal(res);
    }
  });

  // GET /api/dashboard/metrics — curated business KPIs (QC/APR/Scorecard/…).
  app.get("/api/dashboard/metrics", requireAuth, (_req, res) => {
    try {
      res.json(metricsPublicCatalog());
    } catch (err) {
      console.error("[dashboard.metrics]", err);
      errInternal(res);
    }
  });

  // POST /api/dashboard/run-metric — execute a curated metric with dimension + filters.
  app.post("/api/dashboard/run-metric", requireAuth, async (req, res) => {
    try {
      const spec = req.body as MetricRunSpec;
      if (!spec?.metric) {
        return sendError(res, 400, "missing_metric",
          "المؤشر مطلوب", "Metric is required");
      }
      const result = await runMetric({
        metric: String(spec.metric),
        dimension: spec.dimension ? String(spec.dimension) : undefined,
        filters: Array.isArray(spec.filters) ? spec.filters : [],
        sort: spec.sort === "asc" || spec.sort === "desc" ? spec.sort : undefined,
        limit: Number(spec.limit) || 0,
      });
      res.json(result);
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (msg.startsWith("unknown_")) {
        return sendError(res, 400, "invalid_identifier", msg, msg);
      }
      console.error("[dashboard.run-metric]", err);
      errInternal(res);
    }
  });

  // POST /api/dashboard/run-query — execute a QuerySpec built in the UI.
  // The executor validates every identifier against the introspected catalog,
  // so no arbitrary SQL can be smuggled through.
  app.post("/api/dashboard/run-query", requireAuth, async (req, res) => {
    try {
      const spec = req.body as QuerySpec;
      if (!spec?.table) {
        return sendError(res, 400, "missing_table",
          "الجدول مطلوب", "Table is required");
      }
      const result = await runQuery({
        table: String(spec.table),
        xColumn: spec.xColumn ? String(spec.xColumn) : undefined,
        yColumn: spec.yColumn ? String(spec.yColumn) : undefined,
        aggregation: (spec.aggregation ?? "count"),
        filters: Array.isArray(spec.filters) ? spec.filters : [],
        sort: spec.sort === "asc" || spec.sort === "desc" ? spec.sort : undefined,
        limit: Number(spec.limit) || 0,
      });
      res.json(result);
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (msg.startsWith("unknown_table:") || msg.startsWith("unknown_column:")) {
        return sendError(res, 400, "invalid_identifier", msg, msg);
      }
      console.error("[dashboard.run-query]", err);
      errInternal(res);
    }
  });

  app.post("/api/dashboard/query", requireAuth, async (req, res) => {
    try {
      const me = req.user as SessionUser;
      const { source, params } = req.body ?? {};
      const impl = DATA_SOURCES[String(source ?? "")];
      if (!impl) {
        return sendError(res, 400, "unknown_source",
          "مصدر بيانات غير معروف", "Unknown data source");
      }
      const ctx = await buildContext(me);
      const allowed = impl.def.requiredPerms.some((p) => ctx.grants.has(p));
      if (!allowed) {
        return sendError(res, 403, "forbidden",
          "لا صلاحية لهذا المصدر", "No permission for this data source");
      }
      const sanitizedParams: Record<string, any> = {};
      for (const p of impl.def.params) {
        const raw = params?.[p.key];
        if (raw === undefined || raw === null || raw === "") {
          if (p.defaultValue !== undefined) sanitizedParams[p.key] = p.defaultValue;
          continue;
        }
        if (p.type === "number" || p.type === "month" || p.type === "year") {
          sanitizedParams[p.key] = Number(raw);
        } else {
          sanitizedParams[p.key] = String(raw);
        }
      }
      const rows = await impl.execute(ctx, sanitizedParams);
      res.json({
        columns: impl.def.columns,
        rows,
      });
    } catch (err) {
      console.error("[dashboard.query]", err);
      errInternal(res);
    }
  });
}
