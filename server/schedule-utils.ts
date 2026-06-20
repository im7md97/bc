import type { ShiftBreak, ShiftDay, WeeklyShifts } from "@shared/schema";

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

/** ISO date (YYYY-MM-DD) → that week's Sunday + day key for the date itself. */
export function weekStartAndDay(dateStr: string): { weekStart: string; dayKey: DayKey } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(dateStr + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  const dayKey = DAY_KEYS[d.getUTCDay()];
  const ws = new Date(d);
  ws.setUTCDate(ws.getUTCDate() - ws.getUTCDay());
  return { weekStart: ws.toISOString().slice(0, 10), dayKey };
}

const HM = /^(\d{1,2}):(\d{2})$/;

export function parseHm(text: string): number | null {
  const m = HM.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

export function fmtHm(minutes: number): string {
  const m = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Parses "08:00-16:00", "0800-1600", "OFF" / "إجازة" cell formats into a ShiftDay. */
export function parseShiftCell(raw: unknown): ShiftDay | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  if (/^(off|إجازة|اجازة|leave|holiday|x)$/i.test(text)) return { isOff: true };
  const m = /^(\d{1,2}:?\d{2})\s*[-–]\s*(\d{1,2}:?\d{2})$/.exec(text);
  if (!m) return null;
  const normalize = (s: string) => s.includes(":") ? s : `${s.slice(0, -2)}:${s.slice(-2)}`;
  const startMin = parseHm(normalize(m[1]));
  const endMin = parseHm(normalize(m[2]));
  if (startMin === null || endMin === null) return null;
  return { start: fmtHm(startMin), end: fmtHm(endMin) };
}

/** Reads either the new breaks[] or the legacy single break into a normalized array. */
export function readBreaks(shift: ShiftDay | undefined): ShiftBreak[] {
  if (!shift) return [];
  if (Array.isArray(shift.breaks)) return shift.breaks.filter((b) => b?.start && b?.end);
  if (shift.breakStart && shift.breakEnd) return [{ start: shift.breakStart, end: shift.breakEnd }];
  return [];
}

/**
 * Auto-schedules breaks for one day's roster.
 *
 *   Inputs:
 *     roster                 — agents with a shift (start/end) on this day
 *     breaksPerShift         — how many break slots each agent gets
 *     breakDurationMin       — length of each break (e.g. 30)
 *     maxConcurrentBreaks    — hard cap: at any minute, no more than N agents on break
 *
 *   Algorithm:
 *     1) For every agent compute their N "natural" break centers — splitting
 *        the shift into (N+1) equal work blocks.
 *     2) Round each desired start to the nearest 15-minute slot.
 *     3) Process requests in chronological order; greedy-slide each forward
 *        by 15 minutes until placing it would not violate the cap.
 *
 *   Returns: agentId → ShiftBreak[]
 */
export function autoScheduleBreaks(
  roster: { agentId: number; start: string; end: string }[],
  breaksPerShift: number,
  breakDurationMin: number,
  maxConcurrentBreaks: number,
): Map<number, ShiftBreak[]> {
  const requests: { agentId: number; desired: number; index: number }[] = [];
  for (const r of roster) {
    const s = parseHm(r.start);
    const e = parseHm(r.end);
    if (s === null || e === null || e <= s) continue;
    const span = e - s;
    for (let i = 1; i <= breaksPerShift; i++) {
      const center = s + Math.round((span * i) / (breaksPerShift + 1));
      const desired = Math.round(center / 15) * 15 - Math.floor(breakDurationMin / 2);
      requests.push({ agentId: r.agentId, desired, index: i });
    }
  }
  requests.sort((a, b) => a.desired - b.desired);

  const placed: { start: number; end: number }[] = [];
  const out = new Map<number, ShiftBreak[]>();
  for (const r of requests) {
    let proposed = r.desired;
    let safety = 0;
    while (safety++ < 240) {
      const overlap = placed.filter((p) => p.start < proposed + breakDurationMin && p.end > proposed).length;
      if (overlap < maxConcurrentBreaks) break;
      proposed += 15;
    }
    const slot: ShiftBreak = { start: fmtHm(proposed), end: fmtHm(proposed + breakDurationMin) };
    if (!out.has(r.agentId)) out.set(r.agentId, []);
    out.get(r.agentId)!.push(slot);
    placed.push({ start: proposed, end: proposed + breakDurationMin });
  }
  return out;
}

export function readShifts(raw: string | null): WeeklyShifts {
  if (!raw) return {};
  try { return JSON.parse(raw) as WeeklyShifts; } catch { return {}; }
}

export function writeShifts(shifts: WeeklyShifts): string {
  return JSON.stringify(shifts);
}
