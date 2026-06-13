// Client-side duration display — server always sends durations as seconds; we
// always show HH:MM:SS regardless of how WFM stored them (§7.6).
export function formatHms(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || isNaN(Number(totalSeconds))) return "";
  const s = Math.max(0, Math.round(Number(totalSeconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || isNaN(Number(value))) return "";
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

export interface MetricDef {
  key: string;
  labelAr: string;
  labelEn: string;
  valueType: "number" | "percent" | "duration_text" | "duration_seconds" | "integer";
  displayOrder: number;
  isVisible: boolean;
}

export function formatMetric(def: MetricDef | undefined, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (!def) return String(value);
  if (def.valueType === "duration_seconds") return formatHms(Number(value));
  if (def.valueType === "percent" && typeof value === "number") return formatPercent(value);
  if (def.valueType === "integer") return String(Math.round(Number(value)));
  return String(value);
}
