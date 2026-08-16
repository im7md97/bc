import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import type { WidgetInstance } from "@shared/dashboard-v2";
import type { QueryResult } from "@/widgets/types";

/** Widget data loader. Priority:
 *    1. metricSpec — curated business KPI
 *    2. query      — raw pivot spec
 *    3. dataSource — legacy source key
 */
export function useWidgetData(instance: WidgetInstance) {
  const { metricSpec, query, dataSource, refreshMs } = instance;
  const hasMetric = !!metricSpec?.metric;
  const hasQuery  = !!query?.table;
  const hasSource = !!dataSource?.source;

  return useQuery<QueryResult>({
    queryKey: hasMetric
      ? ["dashboard.run-metric", metricSpec]
      : hasQuery
        ? ["dashboard.run-query", query]
        : ["dashboard.query", dataSource?.source, dataSource?.params],
    queryFn: async () => {
      if (hasMetric) {
        const r = await apiRequest<{ rows: { x: any; y: any }[] }>(
          "POST", "/api/dashboard/run-metric", metricSpec);
        return {
          columns: [
            { key: "x", type: "string", labelAr: "المحور X", labelEn: "X" },
            { key: "y", type: "number", labelAr: "القيمة",   labelEn: "Value" },
          ],
          rows: r.rows.map((row) => ({ x: row.x, y: row.y, value: row.y, label: row.x })),
        };
      }
      if (hasQuery) {
        const r = await apiRequest<{ rows: { x: any; y: any }[] }>(
          "POST", "/api/dashboard/run-query", query);
        return {
          columns: [
            { key: "x", type: "string", labelAr: "المحور X", labelEn: "X" },
            { key: "y", type: "number", labelAr: "المحور Y", labelEn: "Y" },
          ],
          rows: r.rows.map((row) => ({ x: row.x, y: row.y, value: row.y, label: row.x })),
        };
      }
      return apiRequest<QueryResult>("POST", "/api/dashboard/query", {
        source: dataSource!.source,
        params: dataSource!.params ?? {},
      });
    },
    enabled: hasMetric || hasQuery || hasSource,
    staleTime: 30_000,
    refetchInterval: refreshMs && refreshMs > 0 ? refreshMs : false,
  });
}
