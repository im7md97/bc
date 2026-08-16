// Monthly calendar view for agents — replaces the week-table for their view.
//
// - Grid: 7 columns (days of the week) × 6 rows, spanning the visible month
// - Each cell shows the shift range + break count (or an "off" pill)
// - Prev/Next month + jump-to-today
// - Click a day → toast the details (light-weight; expansion left for later)

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Coffee } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ShiftDay, ShiftBreak, WeeklyShifts } from "@shared/schema";
import { cn } from "@/lib/utils";

interface ScheduleRow {
  id: number;
  agentId: number;
  weekStart: string;
  shifts: WeeklyShifts;
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function iso(d: Date): string {
  const dd = new Date(d); dd.setHours(0, 0, 0, 0);
  return dd.toISOString().slice(0, 10);
}

/** Sunday of the week containing `d`. */
function sundayOf(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function readBreaks(s: ShiftDay | undefined): ShiftBreak[] {
  if (!s) return [];
  if (s.breaks?.length) return s.breaks;
  if (s.breakStart && s.breakEnd) return [{ start: s.breakStart, end: s.breakEnd }];
  return [];
}

export function AgentMonthlyCalendar() {
  const { lang, dir } = useLanguage();
  const [cursor, setCursor] = useState(() => {
    const d = new Date(); d.setDate(1); return d;
  });

  // Compute the calendar range — start from Sunday of the first row so days
  // from the previous month fill the leading cells.
  const gridStart = useMemo(() => sundayOf(cursor), [cursor]);
  const cells = useMemo(() => {
    const out: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      out.push(d);
    }
    return out;
  }, [gridStart]);

  // The grid always spans exactly 6 rows = 6 unique week starts. Fixed count
  // → we can call useApi in a stable order (Rules of Hooks safe).
  const weekStarts = useMemo(() => {
    const arr: string[] = [];
    for (let w = 0; w < 6; w++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + w * 7);
      arr.push(iso(d));
    }
    return arr;
  }, [gridStart]);

  const w0 = useApi<{ schedules: ScheduleRow[] }>(`/api/schedules?weekStart=${weekStarts[0]}`, { queryKey: ["/api/schedules", weekStarts[0]] });
  const w1 = useApi<{ schedules: ScheduleRow[] }>(`/api/schedules?weekStart=${weekStarts[1]}`, { queryKey: ["/api/schedules", weekStarts[1]] });
  const w2 = useApi<{ schedules: ScheduleRow[] }>(`/api/schedules?weekStart=${weekStarts[2]}`, { queryKey: ["/api/schedules", weekStarts[2]] });
  const w3 = useApi<{ schedules: ScheduleRow[] }>(`/api/schedules?weekStart=${weekStarts[3]}`, { queryKey: ["/api/schedules", weekStarts[3]] });
  const w4 = useApi<{ schedules: ScheduleRow[] }>(`/api/schedules?weekStart=${weekStarts[4]}`, { queryKey: ["/api/schedules", weekStarts[4]] });
  const w5 = useApi<{ schedules: ScheduleRow[] }>(`/api/schedules?weekStart=${weekStarts[5]}`, { queryKey: ["/api/schedules", weekStarts[5]] });
  const weekResults = [w0, w1, w2, w3, w4, w5];
  const loading = weekResults.some((q) => q.isLoading);

  const shiftsByDate: Record<string, ShiftDay | undefined> = useMemo(() => {
    const map: Record<string, ShiftDay | undefined> = {};
    weekResults.forEach((q, i) => {
      const ws = weekStarts[i];
      const wsDate = new Date(ws);
      const row = q.data?.schedules?.[0]; // agent sees only their own schedule
      if (!row) return;
      const shifts = (typeof row.shifts === "string")
        ? (() => { try { return JSON.parse(row.shifts as unknown as string); } catch { return {}; } })()
        : (row.shifts ?? {});
      DAY_KEYS.forEach((key, di) => {
        const d = new Date(wsDate); d.setDate(wsDate.getDate() + di);
        map[iso(d)] = shifts[key];
      });
    });
    return map;
  }, [w0.dataUpdatedAt, w1.dataUpdatedAt, w2.dataUpdatedAt, w3.dataUpdatedAt, w4.dataUpdatedAt, w5.dataUpdatedAt, weekStarts.join("|")]);

  const monthLabel = cursor.toLocaleDateString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US", {
    month: "long", year: "numeric",
  });
  const currentMonth = cursor.getMonth();

  const dayNames = lang === "ar"
    ? ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const stepMonth = (delta: number) => {
    const c = new Date(cursor);
    c.setMonth(c.getMonth() + delta);
    setCursor(c);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-primary font-bold tracking-wider">
            {lang === "ar" ? "جدولي الشهري" : "MY MONTHLY SCHEDULE"}
          </div>
          <h1 className="text-2xl font-bold mt-1 flex items-center gap-2">
            <CalIcon className="w-6 h-6 text-primary" />
            {monthLabel}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => stepMonth(-1)}>
            {dir === "rtl" ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
          <Button variant="outline" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
            {lang === "ar" ? "اليوم" : "Today"}
          </Button>
          <Button variant="outline" size="icon" onClick={() => stepMonth(1)}>
            {dir === "rtl" ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Calendar */}
      <Card>
        <CardContent className="p-0">
          {/* Day names row */}
          <div className="grid grid-cols-7 border-b bg-muted/40">
            {dayNames.map((n) => (
              <div key={n} className="p-2 text-center text-xs font-bold text-muted-foreground">{n}</div>
            ))}
          </div>
          {/* Cells */}
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              const inMonth = d.getMonth() === currentMonth;
              const isToday = iso(d) === iso(new Date());
              const shift = shiftsByDate[iso(d)];
              const isOff = shift?.isOff;
              const hasShift = shift && !isOff && shift.start && shift.end;
              const breaks = readBreaks(shift);

              return (
                <div key={i}
                  className={cn(
                    "min-h-[100px] border-e border-b p-2 last:border-e-0 relative",
                    !inMonth && "bg-muted/20 text-muted-foreground",
                    isToday && "bg-primary/5",
                    (i + 1) % 7 === 0 && "border-e-0",
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn(
                      "text-sm font-medium",
                      isToday && "w-6 h-6 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs",
                    )}>{d.getDate()}</span>
                  </div>

                  {loading && inMonth ? (
                    <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                  ) : hasShift ? (
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-primary bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5 inline-block">
                        {shift!.start}–{shift!.end}
                      </div>
                      {breaks.length > 0 && (
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Coffee className="w-3 h-3" />
                          {breaks.length} {lang === "ar" ? "بريك" : "brk"}
                        </div>
                      )}
                    </div>
                  ) : isOff ? (
                    <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                      {lang === "ar" ? "إجازة" : "OFF"}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="text-[11px] text-muted-foreground text-center">
        {lang === "ar"
          ? "شفتاتك مسجّلة عبر إدارة القوى العاملة (WFM). لأي تعديل تواصل مع مشرفك."
          : "Shifts are set by Workforce Management. For any change, contact your supervisor."}
      </div>
    </div>
  );
}
