// Duration helpers. Internally every duration is stored as integer seconds;
// the UI always displays HH:MM:SS regardless of the uploaded format (§7.6).

/** "1:02:03" | "02:03" | "75" → seconds. Returns null when unparseable. */
export function parseHms(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t));
  const parts = t.split(":").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (parts.length === 2) return nums[0] * 60 + nums[1];
  return nums[0] * 3600 + nums[1] * 60 + nums[2];
}

export function formatHms(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || isNaN(totalSeconds)) return "";
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Normalises a raw Excel cell for a duration metric to seconds,
 * honouring the WFM-selected file time format.
 */
export function normalizeDuration(value: unknown, timeFormat: "hh_mm_ss" | "seconds"): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    // raw:false keeps strings, but numbers can still appear; Excel stores
    // times as a fraction of a day — treat values < 1 that way.
    if (timeFormat === "hh_mm_ss" && value < 1) return Math.round(value * 86400);
    return Math.round(value);
  }
  const text = String(value).trim();
  if (timeFormat === "seconds") {
    const n = Number(text.replace(/[^\d.-]/g, ""));
    return isNaN(n) ? null : Math.round(n);
  }
  return parseHms(text);
}

/** Normalises percent cells: "89%", "0.89", 89 → 0.89 (fraction of 1). */
export function normalizePercent(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  let n: number;
  if (typeof value === "number") n = value;
  else {
    const text = String(value).trim().replace("%", "");
    n = Number(text);
    if (isNaN(n)) return null;
    if (String(value).includes("%")) n = n / 100;
  }
  if (isNaN(n)) return null;
  return n > 1.5 ? n / 100 : n;
}

export function normalizeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim().replace(/,/g, ""));
  return isNaN(n) ? null : n;
}
