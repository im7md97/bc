// Compact card showing the supervisor's own on-duty week. Read + inline edit.
// Rendered at the top of the schedule page for supervisors.

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CalendarClock, Save, Edit3 } from "lucide-react";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { apiRequest } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface DayShift { start?: string; end?: string; isOff?: boolean }
type WeeklyShifts = Record<string, DayShift>;

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DAY_LABELS = {
  ar: { sun: "الأحد", mon: "الإثنين", tue: "الثلاثاء", wed: "الأربعاء", thu: "الخميس", fri: "الجمعة", sat: "السبت" },
  en: { sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" },
};

export function SupervisorScheduleCard({ weekStart }: { weekStart: string }) {
  const { lang } = useLanguage();
  const { data, refetch } = useApi<{ shifts: WeeklyShifts }>(
    `/api/supervisor-schedule?weekStart=${weekStart}`,
    { queryKey: ["/api/supervisor-schedule", weekStart] },
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WeeklyShifts>({});

  const shifts = editing ? draft : (data?.shifts ?? {});

  const save = useApiMutation<WeeklyShifts, unknown>(
    (input) => apiRequest("PUT", "/api/supervisor-schedule", { weekStart, shifts: input }),
    { onSuccess: () => { setEditing(false); refetch(); }, successMessage: lang === "ar" ? "تم الحفظ" : "Saved" },
  );

  const startEdit = () => {
    setDraft(data?.shifts ?? {});
    setEditing(true);
  };

  const updateDay = (key: string, patch: Partial<DayShift>) => {
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }));
  };

  return (
    <Card className="rounded-2xl border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] text-primary font-bold tracking-wider">
                {lang === "ar" ? "جدولي" : "MY SCHEDULE"}
              </div>
              <div className="text-sm font-medium">
                {lang === "ar" ? "أوقاتي هذا الأسبوع" : "My on-duty hours this week"}
              </div>
            </div>
          </div>
          {editing ? (
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                {lang === "ar" ? "إلغاء" : "Cancel"}
              </Button>
              <Button size="sm" onClick={() => save.mutate(draft)} disabled={save.isPending} className="gap-1">
                <Save className="w-3.5 h-3.5" />
                {lang === "ar" ? "حفظ" : "Save"}
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={startEdit} className="gap-1">
              <Edit3 className="w-3.5 h-3.5" />
              {lang === "ar" ? "تعديل" : "Edit"}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
          {DAY_KEYS.map((k) => {
            const s = shifts[k] ?? {};
            const label = DAY_LABELS[lang][k];
            return (
              <div key={k} className={cn(
                "border rounded-lg p-2 min-h-[86px]",
                s.isOff && "bg-muted/50",
              )}>
                <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">{label}</div>
                {editing ? (
                  <div className="space-y-1">
                    <label className="text-[10px] flex items-center gap-1">
                      <input type="checkbox" checked={!!s.isOff}
                        onChange={(e) => updateDay(k, { isOff: e.target.checked })} />
                      {lang === "ar" ? "إجازة" : "Off"}
                    </label>
                    {!s.isOff && (
                      <>
                        <Input type="time" className="h-7 text-[11px]" value={s.start ?? ""}
                          onChange={(e) => updateDay(k, { start: e.target.value })} />
                        <Input type="time" className="h-7 text-[11px]" value={s.end ?? ""}
                          onChange={(e) => updateDay(k, { end: e.target.value })} />
                      </>
                    )}
                  </div>
                ) : s.isOff ? (
                  <div className="text-xs uppercase tracking-wider text-slate-400 font-bold mt-1">
                    {lang === "ar" ? "إجازة" : "OFF"}
                  </div>
                ) : s.start && s.end ? (
                  <div className="text-sm font-bold text-primary mt-1">{s.start}–{s.end}</div>
                ) : (
                  <div className="text-[10px] text-muted-foreground mt-2">—</div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
