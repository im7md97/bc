import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar, Save, Search } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { apiRequest } from "@/lib/api";
import { useAuth, can } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/i18n";

interface AgentSummary {
  id: number;
  employeeId: string;
  nameAr: string;
  nameEn: string;
  projectNameAr: string | null;
  projectNameEn: string | null;
}
interface ShiftDay {
  start?: string; end?: string;
  breakStart?: string; breakEnd?: string;
  isOff?: boolean;
}
interface ScheduleRow {
  id: number;
  agentId: number;
  weekStart: string;
  shifts: Record<string, ShiftDay>;
  updatedAt: string;
}

const DAY_KEYS: { key: string; labelKey: TranslationKey }[] = [
  { key: "sun", labelKey: "schDaySun" },
  { key: "mon", labelKey: "schDayMon" },
  { key: "tue", labelKey: "schDayTue" },
  { key: "wed", labelKey: "schDayWed" },
  { key: "thu", labelKey: "schDayThu" },
  { key: "fri", labelKey: "schDayFri" },
  { key: "sat", labelKey: "schDaySat" },
];

/** Returns the ISO date of the Sunday on or before the given date. */
function weekStartFor(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatRange(shift: ShiftDay): string {
  if (shift.isOff) return "";
  if (!shift.start || !shift.end) return "";
  return `${shift.start} – ${shift.end}`;
}

export default function SchedulePage() {
  const { t, lang, dir } = useLanguage();
  const { data: me } = useAuth();
  const canManage = can(me, "schedule.manage");
  const isAgentView = can(me, "schedule.view_own") && !canManage && !can(me, "schedule.view_team", "schedule.view_project");

  const [weekStart, setWeekStart] = useState<string>(weekStartFor(new Date()));
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ agent: AgentSummary; dayKey: string; shift: ShiftDay; scheduleId: number | null; weekShifts: Record<string, ShiftDay> } | null>(null);

  const { data, isLoading } = useApi<{ agents: AgentSummary[]; schedules: ScheduleRow[] }>(
    `/api/schedules?weekStart=${weekStart}`,
    { queryKey: ["/api/schedules", weekStart] },
  );

  const scheduleByAgent = useMemo(() => {
    const m = new Map<number, ScheduleRow>();
    for (const s of data?.schedules ?? []) m.set(s.agentId, s);
    return m;
  }, [data]);

  const filteredAgents = useMemo(() => {
    const list = data?.agents ?? [];
    if (!search) return list;
    const s = search.toLowerCase();
    return list.filter((a) =>
      a.employeeId.toLowerCase().includes(s) ||
      a.nameAr.toLowerCase().includes(s) ||
      a.nameEn.toLowerCase().includes(s));
  }, [data, search]);

  const save = useApiMutation(
    ({ agentId, shifts }: { agentId: number; shifts: Record<string, ShiftDay> }) =>
      apiRequest("POST", "/api/schedules", { agentId, weekStart, shifts }),
    {
      invalidate: [["/api/schedules", weekStart]],
      onSuccess: () => setEditing(null),
      successMessage: t("schSaved"),
    },
  );

  // ── Agent read-only view ───────────────────────────────────────────────────
  if (isAgentView) {
    const myRow = data?.schedules[0];
    return (
      <PageShell
        title={t("schMyTitle")}
        actions={<WeekNav weekStart={weekStart} setWeekStart={setWeekStart} t={t} dir={dir} lang={lang} />}
      >
        {isLoading && <Skeleton className="h-72 rounded-2xl" />}
        {!isLoading && !myRow && (
          <Card className="rounded-2xl"><CardContent className="py-16 text-center text-muted-foreground">{t("schEmpty")}</CardContent></Card>
        )}
        {myRow && (
          <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
            {DAY_KEYS.map((d, i) => {
              const shift = myRow.shifts[d.key] ?? {};
              return (
                <Card key={d.key} className="rounded-2xl">
                  <CardContent className="pt-4 pb-4">
                    <div className="text-xs text-muted-foreground mb-1" dir="ltr">{addDays(weekStart, i)}</div>
                    <div className="font-bold mb-2">{t(d.labelKey)}</div>
                    {shift.isOff && <Badge variant="secondary">{t("schDayOff")}</Badge>}
                    {!shift.isOff && (
                      <div className="space-y-0.5 text-sm" dir="ltr">
                        <div>{formatRange(shift) || "—"}</div>
                        {(shift.breakStart || shift.breakEnd) && (
                          <div className="text-xs text-muted-foreground">
                            {t("schBreakStart")}: {shift.breakStart || "—"} – {shift.breakEnd || "—"}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </PageShell>
    );
  }

  // ── Manager / supervisor table view ────────────────────────────────────────
  return (
    <PageShell
      title={t("schTitle")}
      subtitle={t("schSubtitle")}
      actions={<WeekNav weekStart={weekStart} setWeekStart={setWeekStart} t={t} dir={dir} lang={lang} />}
    >
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className={`absolute ${dir === "rtl" ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
          <Input
            placeholder={t("search")}
            className={dir === "rtl" ? "pr-10" : "pl-10"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-schedule-search"
          />
        </div>
      </div>

      <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30">
              <tr>
                <th className="sticky start-0 bg-secondary/30 text-start px-3 py-2 font-semibold whitespace-nowrap z-10">
                  {t("schAgent")}
                </th>
                {DAY_KEYS.map((d, i) => (
                  <th key={d.key} className="px-2 py-2 font-semibold text-center whitespace-nowrap">
                    <div>{t(d.labelKey)}</div>
                    <div className="text-[10px] font-normal text-muted-foreground" dir="ltr">{addDays(weekStart, i)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="p-4"><Skeleton className="h-12 w-full" /></td></tr>
              )}
              {!isLoading && filteredAgents.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">{t("noData")}</td></tr>
              )}
              {filteredAgents.map((a) => {
                const row = scheduleByAgent.get(a.id);
                const weekShifts = row?.shifts ?? {};
                return (
                  <tr key={a.id} className="border-t border-border/40">
                    <td className="sticky start-0 bg-card px-3 py-2 font-semibold whitespace-nowrap">
                      <div>{lang === "ar" ? a.nameAr : a.nameEn}</div>
                      <div className="text-[10px] text-muted-foreground" dir="ltr">{a.employeeId}</div>
                    </td>
                    {DAY_KEYS.map((d) => {
                      const shift = weekShifts[d.key] ?? {};
                      const filled = shift.isOff || shift.start;
                      return (
                        <td key={d.key} className="px-2 py-2 text-center">
                          <button
                            type="button"
                            disabled={!canManage}
                            onClick={() => setEditing({ agent: a, dayKey: d.key, shift, scheduleId: row?.id ?? null, weekShifts })}
                            className={`w-full rounded-lg px-2 py-2 text-xs border ${
                              filled ? "bg-primary/10 border-primary/30" : "bg-secondary/20 border-border/40 text-muted-foreground"
                            } ${canManage ? "hover:bg-primary/15 cursor-pointer" : "cursor-default"}`}
                            data-testid={`shift-${a.id}-${d.key}`}
                          >
                            {shift.isOff ? (
                              <Badge variant="secondary" className="text-[10px]">{t("schDayOff")}</Badge>
                            ) : shift.start || shift.end ? (
                              <span dir="ltr">{formatRange(shift)}</span>
                            ) : (
                              <span>—</span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <DayEditor
          editing={editing}
          onClose={() => setEditing(null)}
          onSave={(shifts) => save.mutate({ agentId: editing.agent.id, shifts })}
          saving={save.isPending}
        />
      )}
    </PageShell>
  );
}

function WeekNav({ weekStart, setWeekStart, t, dir, lang }: any) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))} className="gap-1">
        <ChevronRight className={`w-4 h-4 ${dir === "rtl" ? "" : "rotate-180"}`} />
        <span className="hidden sm:inline">{t("schPrevWeek")}</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={() => {
        const today = new Date();
        const d = new Date(today);
        d.setDate(d.getDate() - d.getDay());
        setWeekStart(d.toISOString().slice(0, 10));
      }} className="gap-1">
        <Calendar className="w-4 h-4" />
        <span dir="ltr" className="text-xs">{weekStart}</span>
      </Button>
      <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))} className="gap-1">
        <span className="hidden sm:inline">{t("schNextWeek")}</span>
        <ChevronLeft className={`w-4 h-4 ${dir === "rtl" ? "" : "rotate-180"}`} />
      </Button>
    </div>
  );
}

function DayEditor({ editing, onClose, onSave, saving }: {
  editing: { agent: AgentSummary; dayKey: string; shift: ShiftDay; weekShifts: Record<string, ShiftDay> };
  onClose: () => void;
  onSave: (shifts: Record<string, ShiftDay>) => void;
  saving: boolean;
}) {
  const { t, lang, dir } = useLanguage();
  const [shift, setShift] = useState<ShiftDay>(editing.shift);

  const dayKeyToLabel: Record<string, TranslationKey> = {
    sun: "schDaySun", mon: "schDayMon", tue: "schDayTue", wed: "schDayWed",
    thu: "schDayThu", fri: "schDayFri", sat: "schDaySat",
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir={dir} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("schEditDay")} — {t(dayKeyToLabel[editing.dayKey])} · {lang === "ar" ? editing.agent.nameAr : editing.agent.nameEn}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 bg-secondary/30 rounded-lg px-3 py-2">
            <Switch checked={!!shift.isOff} onCheckedChange={(v) => setShift({ ...shift, isOff: v })} id="off" />
            <Label htmlFor="off">{t("schDayOff")}</Label>
          </div>
          {!shift.isOff && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t("schStart")}</Label>
                  <Input type="time" dir="ltr" value={shift.start ?? ""} onChange={(e) => setShift({ ...shift, start: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("schEnd")}</Label>
                  <Input type="time" dir="ltr" value={shift.end ?? ""} onChange={(e) => setShift({ ...shift, end: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("schBreakStart")}</Label>
                  <Input type="time" dir="ltr" value={shift.breakStart ?? ""} onChange={(e) => setShift({ ...shift, breakStart: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("schBreakEnd")}</Label>
                  <Input type="time" dir="ltr" value={shift.breakEnd ?? ""} onChange={(e) => setShift({ ...shift, breakEnd: e.target.value })} />
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button
            disabled={saving}
            onClick={() => {
              const cleaned: ShiftDay = shift.isOff
                ? { isOff: true }
                : {
                    start: shift.start || undefined,
                    end: shift.end || undefined,
                    breakStart: shift.breakStart || undefined,
                    breakEnd: shift.breakEnd || undefined,
                  };
              onSave({ ...editing.weekShifts, [editing.dayKey]: cleaned });
            }}
            className="gap-2"
          >
            <Save className="w-4 h-4" /> {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
