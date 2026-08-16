import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft, ChevronRight, Calendar, Save, Search, Settings2, Upload, Sparkles, Repeat2,
  Plus, Trash2, Check, X,
} from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useApi, useApiMutation } from "@/hooks/use-api";
import { apiRequest, parseError, downloadFile } from "@/lib/api";
import { useAuth, can } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import type { TranslationKey } from "@/lib/i18n";
import { AgentMonthlyCalendar } from "@/components/schedule/AgentMonthlyCalendar";
import { SupervisorScheduleCard } from "@/components/schedule/SupervisorScheduleCard";

interface AgentSummary {
  id: number;
  employeeId: string;
  nameAr: string;
  nameEn: string;
  projectId: number;
  supervisorUserId: number | null;
  projectNameAr: string | null;
  projectNameEn: string | null;
}
interface ShiftBreak { start: string; end: string; }
interface ShiftDay {
  start?: string; end?: string;
  breaks?: ShiftBreak[];
  breakStart?: string; breakEnd?: string;     // legacy
  isOff?: boolean;
}
interface ScheduleRow {
  id: number;
  agentId: number;
  weekStart: string;
  shifts: Record<string, ShiftDay>;
  updatedAt: string;
}
interface ScheduleSettings {
  projectId: number;
  weekStart: string;
  breaksPerShift: number;
  breakDurationMin: number;
  maxConcurrentBreaks: number;
}
interface SwapRequest {
  id: number;
  requesterAgentId: number;
  targetAgentId: number;
  weekStart: string;
  dayKey: string;
  dayKeys: string[] | null;
  status: "pending_target_agent" | "pending_supervisor" | "pending_wfm" | "approved" | "rejected" | "cancelled";
  requesterComment: string | null;
  supervisorComment: string | null;
  wfmComment: string | null;
  createdAt: string;
  requesterNameAr: string | null;
  requesterNameEn: string | null;
  requesterEmp: string | null;
  targetNameAr: string | null;
  targetNameEn: string | null;
  targetEmp: string | null;
}

interface AttendanceData {
  agents: { id: number; employeeId: string; nameAr: string; nameEn: string; supervisorUserId: number | null }[];
  records: { agentId: number; date: string; status: "present" | "late" | "absent"; note: string | null }[];
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

function readBreaks(shift: ShiftDay | undefined): ShiftBreak[] {
  if (!shift) return [];
  if (Array.isArray(shift.breaks)) return shift.breaks.filter((b) => b?.start && b?.end);
  if (shift.breakStart && shift.breakEnd) return [{ start: shift.breakStart, end: shift.breakEnd }];
  return [];
}

export default function SchedulePage() {
  const { t, lang, dir } = useLanguage();
  const { toast } = useToast();
  const { data: me } = useAuth();
  const canManage = can(me, "schedule.manage");
  const canImport = can(me, "schedule.import");
  const canPolicy = can(me, "schedule.policy_edit");
  const canAutoBreaks = can(me, "schedule.auto_breaks");
  const canRequestSwap = can(me, "schedule.swap_request");
  const canReviewSwap = can(me, "schedule.swap_review_team");
  const canApproveSwap = can(me, "schedule.swap_approve");
  const canRecordAttendance = can(me, "attendance.record");
  const canViewAttendance = can(me, "attendance.view_own", "attendance.view_team", "attendance.view_all", "attendance.record");
  const isAgentView = can(me, "schedule.view_own") && !canManage && !can(me, "schedule.view_team", "schedule.view_project");

  const [weekStart, setWeekStart] = useState<string>(weekStartFor(new Date()));
  const [search, setSearch] = useState("");
  const [breakHour, setBreakHour] = useState("_all");
  const [shiftFilter, setShiftFilter] = useState("_all");
  const [editing, setEditing] = useState<{ agent: AgentSummary; dayKey: string; shift: ShiftDay; scheduleId: number | null; weekShifts: Record<string, ShiftDay> } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importBidateOpen, setImportBidateOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState<{ dayKey: string } | null>(null);

  const { data, isLoading, refetch } = useApi<{ agents: AgentSummary[]; schedules: ScheduleRow[]; settings: ScheduleSettings | null }>(
    `/api/schedules?weekStart=${weekStart}`,
    { queryKey: ["/api/schedules", weekStart] },
  );

  const { data: swapRequests, refetch: refetchSwaps } = useApi<SwapRequest[]>(
    "/api/schedules/swap-requests",
    { enabled: canRequestSwap || canReviewSwap || canApproveSwap },
  );

  /** Build week-wide attendance map (agentId|date → status) so the grid can
   *  show a badge per cell. Fetched lazily for the 7 days of the visible week. */
  const weekDates = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
  [weekStart]);

  const { data: weekAttendance, refetch: refetchAttendance } = useApi<{ records: { agentId: number; date: string; status: string }[] }[]>(
    "_attendance_for_week",
    {
      enabled: canRecordAttendance || canViewAttendance,
      queryKey: ["/api/attendance/week", weekStart],
    },
  );

  // Lightweight per-cell upsert.
  const recordAttendance = useApiMutation(
    ({ agentId, date, status }: { agentId: number; date: string; status: string }) =>
      apiRequest("POST", "/api/attendance", { agentId, date, status }),
    {
      onSuccess: () => refetchAttendance(),
      successMessage: t("attSaved"),
    },
  );

  const [attendanceMap, setAttendanceMap] = useState<Map<string, string>>(new Map());

  // Fetch each day in parallel and merge into one map keyed by "agentId|date".
  useEffect(() => {
    if (!canRecordAttendance && !canViewAttendance) return;
    let cancelled = false;
    (async () => {
      const merged = new Map<string, string>();
      for (const date of weekDates) {
        try {
          const res = await fetch(`/api/attendance?date=${date}`, { credentials: "include" });
          if (!res.ok) continue;
          const body = await res.json();
          for (const r of body.records ?? []) {
            merged.set(`${r.agentId}|${r.date}`, r.status);
          }
        } catch { /* ignore */ }
      }
      if (!cancelled) setAttendanceMap(merged);
    })();
    return () => { cancelled = true; };
  }, [weekStart, canRecordAttendance, canViewAttendance, recordAttendance.isPending]);

  const scheduleByAgent = useMemo(() => {
    const m = new Map<number, ScheduleRow>();
    for (const s of data?.schedules ?? []) m.set(s.agentId, s);
    return m;
  }, [data]);

  /** Collect dropdown options from the data we already have on hand. */
  const { breakHourOptions, shiftOptions } = useMemo(() => {
    const hours = new Set<number>();
    const shifts = new Set<string>();
    for (const row of data?.schedules ?? []) {
      for (const shift of Object.values(row.shifts) as any[]) {
        if (shift?.isOff) shifts.add("OFF");
        else if (shift?.start && shift?.end) shifts.add(`${shift.start}-${shift.end}`);
        const breaks = readBreaks(shift);
        for (const b of breaks) {
          const h = Number(b.start.split(":")[0]);
          if (!isNaN(h)) hours.add(h);
        }
      }
    }
    return {
      breakHourOptions: Array.from(hours).sort((a, b) => a - b),
      shiftOptions: Array.from(shifts).sort(),
    };
  }, [data]);

  const filteredAgents = useMemo(() => {
    const list = data?.agents ?? [];
    const s = search.toLowerCase();
    let out = s ? list.filter((a) =>
      a.employeeId.toLowerCase().includes(s) ||
      a.nameAr.toLowerCase().includes(s) ||
      a.nameEn.toLowerCase().includes(s)) : list;
    // Break-hour filter: keep agents who have at least one break starting at that hour.
    if (breakHour !== "_all") {
      const h = Number(breakHour);
      out = out.filter((a) => {
        const row = scheduleByAgent.get(a.id);
        if (!row) return false;
        return Object.values(row.shifts).some((shift: any) =>
          readBreaks(shift).some((b) => Number(b.start.split(":")[0]) === h));
      });
    }
    // Shift filter: keep agents whose any day matches the picked shift (or "OFF").
    if (shiftFilter !== "_all") {
      out = out.filter((a) => {
        const row = scheduleByAgent.get(a.id);
        if (!row) return false;
        return Object.values(row.shifts).some((shift: any) => {
          if (shiftFilter === "OFF") return !!shift?.isOff;
          if (!shift?.start || !shift?.end) return false;
          return `${shift.start}-${shift.end}` === shiftFilter;
        });
      });
    }
    return out;
  }, [data, search, breakHour, shiftFilter, scheduleByAgent]);

  const save = useApiMutation(
    ({ agentId, shifts }: { agentId: number; shifts: Record<string, ShiftDay> }) =>
      apiRequest("POST", "/api/schedules", { agentId, weekStart, shifts }),
    {
      invalidate: [["/api/schedules", weekStart]],
      onSuccess: () => setEditing(null),
      successMessage: t("schSaved"),
    },
  );

  const autoBreaks = useApiMutation(
    () => apiRequest("POST", "/api/schedules/auto-breaks",
      { projectId: data?.agents[0]?.projectId, weekStart }),
    {
      invalidate: [["/api/schedules", weekStart]],
      successMessage: t("schAutoBreaksDone"),
    },
  );

  // ── Agent view ─────────────────────────────────────────────────────────────
  if (isAgentView) {
    const myRow = data?.schedules[0];
    const myAgent = data?.agents[0];
    return (
      <PageShell
        title={t("schMyTitle")}
        actions={<WeekNav weekStart={weekStart} setWeekStart={setWeekStart} t={t} dir={dir} />}
      >
        <Tabs defaultValue="month">
          <TabsList>
            <TabsTrigger value="month">{lang === "ar" ? "شهري" : "Monthly"}</TabsTrigger>
            <TabsTrigger value="week">{t("schMyTitle")}</TabsTrigger>
            {canRequestSwap && <TabsTrigger value="swap">{t("schSwapTab")}</TabsTrigger>}
          </TabsList>
          <TabsContent value="month">
            <AgentMonthlyCalendar />
          </TabsContent>
          <TabsContent value="week">
            {isLoading && <Skeleton className="h-72 rounded-2xl" />}
            {!isLoading && !myRow && (
              <Card className="rounded-2xl"><CardContent className="py-16 text-center text-muted-foreground">{t("schEmpty")}</CardContent></Card>
            )}
            {myRow && (
              <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
                {DAY_KEYS.map((d, i) => {
                  const shift = myRow.shifts[d.key] ?? {};
                  const breaks = readBreaks(shift);
                  return (
                    <Card key={d.key} className="rounded-2xl">
                      <CardContent className="pt-4 pb-4">
                        <div className="text-xs text-muted-foreground mb-1" dir="ltr">{addDays(weekStart, i)}</div>
                        <div className="font-bold mb-2">{t(d.labelKey)}</div>
                        {shift.isOff && <Badge variant="secondary">{t("schDayOff")}</Badge>}
                        {!shift.isOff && (
                          <div className="space-y-1 text-sm" dir="ltr">
                            <div>{formatRange(shift) || "—"}</div>
                            {breaks.map((b, bi) => (
                              <div key={bi} className="text-xs text-muted-foreground">
                                {t("schBreaks")} {bi + 1}: {b.start} – {b.end}
                              </div>
                            ))}
                          </div>
                        )}
                        {canRequestSwap && !shift.isOff && shift.start && (
                          <Button size="sm" variant="ghost" className="mt-2 h-7 gap-1 text-xs"
                            onClick={() => setSwapOpen({ dayKey: d.key })}>
                            <Repeat2 className="w-3 h-3" /> {t("schSwapNew")}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
          {canRequestSwap && (
            <TabsContent value="swap">
              <SwapList
                items={swapRequests ?? []}
                myUserId={me?.id}
                myAgentId={myAgent?.id}
                role="agent"
                refetch={refetchSwaps}
                t={t} lang={lang} dir={dir}
              />
            </TabsContent>
          )}
        </Tabs>

        {swapOpen && myAgent && (
          <SwapDialog
            dayKey={swapOpen.dayKey}
            weekStart={weekStart}
            onClose={() => setSwapOpen(null)}
            onSuccess={() => { setSwapOpen(null); refetchSwaps(); }}
            t={t} lang={lang} dir={dir}
          />
        )}
      </PageShell>
    );
  }

  // ── Manager / Supervisor / WFM view ────────────────────────────────────────
  return (
    <PageShell
      title={t("schTitle")}
      subtitle={t("schSubtitle")}
      actions={
        <>
          <WeekNav weekStart={weekStart} setWeekStart={setWeekStart} t={t} dir={dir} />
          {canPolicy && (
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="gap-1.5">
              <Settings2 className="w-4 h-4" /> {t("schSettings")}
            </Button>
          )}
          {canImport && (
            <>
              <Button variant="outline" size="sm" onClick={() => downloadFile("/api/schedules/template", "schedules-template.xlsx")} className="gap-1.5">
                <Upload className="w-4 h-4 rotate-180" /> {t("schTemplate")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1.5">
                <Upload className="w-4 h-4" /> {t("schImport")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setImportBidateOpen(true)} className="gap-1.5">
                <Upload className="w-4 h-4" /> {t("schImportBidate")}
              </Button>
            </>
          )}
          {canAutoBreaks && (
            <Button size="sm" onClick={() => autoBreaks.mutate(undefined as any)}
              disabled={autoBreaks.isPending || (data?.agents.length ?? 0) === 0}
              className="gap-1.5">
              <Sparkles className="w-4 h-4" /> {t("schAutoBreaks")}
            </Button>
          )}
        </>
      }
    >
      {me?.role === "supervisor" && (
        <div className="mb-4">
          <SupervisorScheduleCard weekStart={weekStart} />
        </div>
      )}
      <Tabs defaultValue="week">
        <TabsList>
          <TabsTrigger value="week">{t("schTitle")}</TabsTrigger>
          {canViewAttendance && (
            <TabsTrigger value="attendance">{t("attTabTitle")}</TabsTrigger>
          )}
          {(canReviewSwap || canApproveSwap) && (
            <TabsTrigger value="swap" className="gap-1.5">
              {t("schSwapTab")}
              {(swapRequests ?? []).filter((r) =>
                canApproveSwap ? r.status === "pending_wfm" : r.status === "pending_supervisor",
              ).length > 0 && (
                <Badge variant="default" className="ms-1 text-[10px] h-4 px-1.5">
                  {(swapRequests ?? []).filter((r) => canApproveSwap ? r.status === "pending_wfm" : r.status === "pending_supervisor").length}
                </Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="week">
          <div className="flex flex-wrap gap-2 mb-4">
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
            <div className="w-44">
              <Select value={breakHour} onValueChange={setBreakHour}>
                <SelectTrigger data-testid="filter-break-hour"><SelectValue placeholder={t("schBreakFilter")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">{t("schBreakFilter")} — {t("all")}</SelectItem>
                  {breakHourOptions.map((h) => (
                    <SelectItem key={h} value={String(h)} dir="ltr">{String(h).padStart(2, "0")}:00</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-44">
              <Select value={shiftFilter} onValueChange={setShiftFilter}>
                <SelectTrigger data-testid="filter-shift"><SelectValue placeholder={t("schShiftFilter")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">{t("schShiftFilter")} — {t("all")}</SelectItem>
                  {shiftOptions.map((s) => (
                    <SelectItem key={s} value={s} dir="ltr">{s === "OFF" ? t("schDayOff") : s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  {isLoading && <tr><td colSpan={8} className="p-4"><Skeleton className="h-12 w-full" /></td></tr>}
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
                        {DAY_KEYS.map((d, dayIndex) => {
                          const shift = weekShifts[d.key] ?? {};
                          const breaks = readBreaks(shift);
                          const filled = shift.isOff || shift.start;
                          const cellDate = addDays(weekStart, dayIndex);
                          const attStatus = attendanceMap.get(`${a.id}|${cellDate}`);
                          return (
                            <td key={d.key} className="px-2 py-2 text-center">
                              <ScheduleCell
                                agent={a}
                                dayKey={d.key}
                                shift={shift}
                                breaks={breaks}
                                filled={!!filled}
                                date={cellDate}
                                attStatus={attStatus}
                                canManage={canManage}
                                canRecord={canRecordAttendance}
                                onEdit={() => setEditing({ agent: a, dayKey: d.key, shift, scheduleId: row?.id ?? null, weekShifts })}
                                onMarkAttendance={(status: string) => recordAttendance.mutate({ agentId: a.id, date: cellDate, status })}
                                t={t}
                              />
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
        </TabsContent>

        {canViewAttendance && (
          <TabsContent value="attendance">
            <AttendancePanel canRecord={canRecordAttendance} t={t} lang={lang} dir={dir} />
          </TabsContent>
        )}

        {(canReviewSwap || canApproveSwap) && (
          <TabsContent value="swap">
            <SwapList
              items={swapRequests ?? []}
              role={canApproveSwap ? "wfm" : "supervisor"}
              refetch={refetchSwaps}
              t={t} lang={lang} dir={dir}
            />
          </TabsContent>
        )}
      </Tabs>

      {editing && (
        <DayEditor
          editing={editing}
          onClose={() => setEditing(null)}
          onSave={(shifts) => save.mutate({ agentId: editing.agent.id, shifts })}
          saving={save.isPending}
        />
      )}

      {settingsOpen && data && (
        <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          projectId={data.agents[0]?.projectId ?? null}
          weekStart={weekStart}
          initial={data.settings}
          onSaved={() => { setSettingsOpen(false); refetch(); }}
          t={t} dir={dir}
        />
      )}

      {importOpen && data && (
        <ImportDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          projectId={data.agents[0]?.projectId ?? null}
          weekStart={weekStart}
          onImported={() => { setImportOpen(false); refetch(); }}
          t={t} dir={dir} toast={toast}
        />
      )}

      {importBidateOpen && data && (
        <ImportBidateDialog
          open={importBidateOpen}
          onClose={() => setImportBidateOpen(false)}
          projectId={data.agents[0]?.projectId ?? null}
          onImported={() => { setImportBidateOpen(false); refetch(); }}
          t={t} dir={dir} toast={toast}
        />
      )}
    </PageShell>
  );
}

function WeekNav({ weekStart, setWeekStart, t, dir }: any) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))} className="gap-1">
        <ChevronRight className={`w-4 h-4 ${dir === "rtl" ? "" : "rotate-180"}`} />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => {
        const d = new Date();
        d.setDate(d.getDate() - d.getDay());
        setWeekStart(d.toISOString().slice(0, 10));
      }} className="gap-1">
        <Calendar className="w-4 h-4" />
        <span dir="ltr" className="text-xs">{weekStart}</span>
      </Button>
      <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))} className="gap-1">
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
  const [shift, setShift] = useState<ShiftDay>({
    ...editing.shift,
    breaks: readBreaks(editing.shift),
    breakStart: undefined,
    breakEnd: undefined,
  });

  const dayKeyToLabel: Record<string, TranslationKey> = {
    sun: "schDaySun", mon: "schDayMon", tue: "schDayTue", wed: "schDayWed",
    thu: "schDayThu", fri: "schDayFri", sat: "schDaySat",
  };

  const setBreak = (i: number, patch: Partial<ShiftBreak>) =>
    setShift((s) => ({ ...s, breaks: (s.breaks ?? []).map((b, j) => j === i ? { ...b, ...patch } : b) }));
  const addBreak = () => setShift((s) => ({ ...s, breaks: [...(s.breaks ?? []), { start: "", end: "" }] }));
  const removeBreak = (i: number) =>
    setShift((s) => ({ ...s, breaks: (s.breaks ?? []).filter((_, j) => j !== i) }));

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
              </div>
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">{t("schBreaks")}</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addBreak} className="h-7 gap-1">
                    <Plus className="w-3.5 h-3.5" /> {t("schAddBreak")}
                  </Button>
                </div>
                {(shift.breaks ?? []).map((b, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">{t("schBreakStart")}</Label>
                      <Input type="time" dir="ltr" value={b.start} onChange={(e) => setBreak(i, { start: e.target.value })} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">{t("schBreakEnd")}</Label>
                      <Input type="time" dir="ltr" value={b.end} onChange={(e) => setBreak(i, { end: e.target.value })} />
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeBreak(i)} className="text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
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
                    breaks: (shift.breaks ?? []).filter((b) => b.start && b.end),
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

function SettingsDialog({ open, onClose, projectId, weekStart, initial, onSaved, t, dir }: any) {
  const [breaksPerShift, setBpS] = useState(initial?.breaksPerShift ?? 1);
  const [breakDurationMin, setBdM] = useState(initial?.breakDurationMin ?? 30);
  const [maxConcurrentBreaks, setMcb] = useState(initial?.maxConcurrentBreaks ?? 2);
  const save = useApiMutation(
    () => apiRequest("PUT", "/api/schedules/settings", { projectId, weekStart, breaksPerShift, breakDurationMin, maxConcurrentBreaks }),
    { onSuccess: onSaved, successMessage: t("saveSuccess") },
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir={dir} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("schSettingsTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("schBreaksPerShift")}</Label>
            <Input type="number" min={0} max={6} dir="ltr" value={breaksPerShift} onChange={(e) => setBpS(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("schBreakDuration")}</Label>
            <Input type="number" min={5} max={180} dir="ltr" value={breakDurationMin} onChange={(e) => setBdM(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("schMaxConcurrent")}</Label>
            <Input type="number" min={1} max={50} dir="ltr" value={maxConcurrentBreaks} onChange={(e) => setMcb(Number(e.target.value))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button onClick={() => save.mutate(undefined as any)} disabled={save.isPending}>{t("save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ open, onClose, projectId, weekStart, onImported, t, dir, toast }: any) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; unknown: string[]; errors: any[] } | null>(null);
  const submit = async () => {
    if (!file || !projectId) return;
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("projectId", String(projectId));
      fd.append("weekStart", weekStart);
      const res = await fetch("/api/schedules/import", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw await parseError(res);
      const body = await res.json();
      setResult(body);
      toast({ title: `${t("schImported")} ${body.imported} · ${body.skipped} ${t("schImportSkipped")}` });
      if (body.imported > 0) onImported();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir={dir} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("schImportTitle")}</DialogTitle>
          <DialogDescription>{t("schImportFormat")}</DialogDescription>
        </DialogHeader>
        <Button variant="outline" size="sm" className="self-start gap-1.5"
          onClick={() => downloadFile("/api/schedules/template", "schedules-template.xlsx")}>
          <Upload className="w-4 h-4 rotate-180" /> {t("schTemplate")}
        </Button>
        <Input type="file" accept=".xlsx" dir="ltr" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />
        {result && (
          <div className="bg-secondary/30 rounded-lg p-3 text-xs space-y-1">
            <div className="flex justify-between"><span>{t("schImported")}:</span><span className="font-bold" dir="ltr">{result.imported}</span></div>
            <div className="flex justify-between"><span>{t("schImportSkipped")}:</span><span className="font-bold text-amber-600" dir="ltr">{result.skipped}</span></div>
            {result.unknown.length > 0 && (
              <div className="pt-2 border-t mt-2">
                <div className="text-amber-700 font-semibold mb-1">{t("aprUnknownRows")} ({result.unknown.length}):</div>
                <div className="text-[10px] flex flex-wrap gap-1" dir="ltr">
                  {result.unknown.map((e, i) => <span key={i} className="bg-amber-500/10 px-1.5 py-0.5 rounded">{e}</span>)}
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{result ? t("close") : t("cancel")}</Button>
          <Button onClick={submit} disabled={!file || busy} className="gap-2">
            <Upload className="w-4 h-4" /> {busy ? t("loading") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SwapDialog({ dayKey, weekStart, onClose, onSuccess, t, lang, dir }: any) {
  const [target, setTarget] = useState<string>("");
  const [comment, setComment] = useState("");
  // Initialize the selected days with the clicked day already checked.
  const [selectedDays, setSelectedDays] = useState<string[]>([dayKey]);
  const { data: peers, isLoading: peersLoading } = useApi<{ id: number; employeeId: string; nameAr: string; nameEn: string }[]>("/api/schedules/peers");
  const toggleDay = (k: string) =>
    setSelectedDays((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const submit = useApiMutation(
    () => apiRequest("POST", "/api/schedules/swap-requests",
      { targetAgentId: Number(target), weekStart, dayKey: selectedDays[0] ?? dayKey, dayKeys: selectedDays, comment }),
    { onSuccess, successMessage: t("createSuccess") },
  );
  const dayLabel: TranslationKey = DAY_LABEL_BY_KEY[String(dayKey)] ?? "schDaySun";
  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir={dir} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("schSwapTitle")}</DialogTitle>
          <DialogDescription>{t("schSwapPickDays")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t("schSwapDaysLabel")}</Label>
            <div className="grid grid-cols-7 gap-1.5">
              {DAY_KEYS.map((d) => {
                const checked = selectedDays.includes(d.key);
                return (
                  <button
                    type="button"
                    key={d.key}
                    onClick={() => toggleDay(d.key)}
                    className={`rounded-lg px-2 py-2 text-xs border ${
                      checked ? "bg-primary text-primary-foreground border-primary font-bold" : "bg-secondary/30 border-border/40"
                    }`}
                    data-testid={`swap-day-${d.key}`}
                  >
                    {t(d.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("schSwapWith")}</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger><SelectValue placeholder={t("select")} /></SelectTrigger>
              <SelectContent>
                {peersLoading && <SelectItem value="_loading" disabled>{t("loading")}</SelectItem>}
                {!peersLoading && (peers ?? []).length === 0 && <SelectItem value="_empty" disabled>{t("noData")}</SelectItem>}
                {(peers ?? []).map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {lang === "ar" ? a.nameAr : a.nameEn} ({a.employeeId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("schSwapComment")}</Label>
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button onClick={() => submit.mutate(undefined as any)}
            disabled={!target || selectedDays.length === 0 || submit.isPending}>
            {t("schSwapSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function swapStatusBadge(status: string, t: any) {
  const map: Record<string, { className: string; key: TranslationKey }> = {
    pending_target_agent: { className: "bg-purple-500/10 text-purple-700 border-purple-300", key: "schSwapPendingTarget" },
    pending_supervisor: { className: "bg-amber-500/10 text-amber-700 border-amber-300", key: "schSwapPendingSup" },
    pending_wfm:        { className: "bg-blue-500/10 text-blue-700 border-blue-300",     key: "schSwapPendingWfm" },
    approved:           { className: "bg-emerald-500/10 text-emerald-700 border-emerald-300", key: "schSwapApproved" },
    rejected:           { className: "bg-red-500/10 text-red-700 border-red-300",         key: "schSwapRejected" },
    cancelled:          { className: "bg-slate-500/10 text-slate-700 border-slate-300",   key: "schSwapCancelled" },
  };
  const cfg = map[status] ?? map.cancelled;
  return <Badge variant="outline" className={`${cfg.className} text-xs`}>{t(cfg.key)}</Badge>;
}

const DAY_LABEL_BY_KEY: Record<string, TranslationKey> = {
  sun: "schDaySun", mon: "schDayMon", tue: "schDayTue", wed: "schDayWed",
  thu: "schDayThu", fri: "schDayFri", sat: "schDaySat",
};

function SwapList({ items, role, refetch, t, lang, dir, myAgentId }: any) {
  const decide = useApiMutation(
    ({ id, endpoint, action, comment }: { id: number; endpoint: string; action: string; comment?: string }) =>
      apiRequest("PATCH", `/api/schedules/swap-requests/${id}/${endpoint}`, { action, comment }),
    { onSuccess: refetch, successMessage: t("saveSuccess") },
  );
  const cancel = useApiMutation(
    (id: number) => apiRequest("DELETE", `/api/schedules/swap-requests/${id}`),
    { onSuccess: refetch, successMessage: t("saveSuccess") },
  );

  if (items.length === 0) {
    return <Card className="rounded-2xl"><CardContent className="py-12 text-center text-muted-foreground">{t("schSwapNoRequests")}</CardContent></Card>;
  }
  return (
    <div className="space-y-2">
      {items.map((r: SwapRequest) => {
        const days = (r.dayKeys && r.dayKeys.length > 0) ? r.dayKeys : [r.dayKey];
        const dayLabels = days.map((d) => DAY_LABEL_BY_KEY[String(d)] ?? "schDaySun") as TranslationKey[];
        const dayLabel: TranslationKey = dayLabels[0] ?? "schDaySun";
        const showSupActions = role === "supervisor" && r.status === "pending_supervisor";
        const showWfmActions = role === "wfm" && r.status === "pending_wfm";
        const showCancel = role === "agent" && ["pending_target_agent", "pending_supervisor", "pending_wfm"].includes(r.status);
        // Target-agent stage: only the target agent (not requester) can accept/reject.
        const showTargetActions = role === "agent" && r.status === "pending_target_agent" && r.targetAgentId === myAgentId;
        return (
          <Card key={r.id} className="rounded-2xl">
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-bold">{lang === "ar" ? r.requesterNameAr : r.requesterNameEn}</span>
                  <span className="text-xs text-muted-foreground">↔</span>
                  <span className="font-bold">{lang === "ar" ? r.targetNameAr : r.targetNameEn}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {dayLabels.map((k) => t(k)).join(" · ")}
                    {" · "}<span dir="ltr" className="ms-1">{r.weekStart}</span>
                  </Badge>
                  {swapStatusBadge(r.status, t)}
                </div>
              </div>
              {r.requesterComment && <p className="text-xs text-muted-foreground mb-2">"{r.requesterComment}"</p>}
              {r.supervisorComment && <p className="text-xs bg-secondary/30 rounded px-2 py-1 mb-2">{t("roleSupervisor")}: {r.supervisorComment}</p>}
              {r.wfmComment && <p className="text-xs bg-secondary/30 rounded px-2 py-1 mb-2">{t("roleWfm")}: {r.wfmComment}</p>}
              {(showSupActions || showWfmActions || showCancel || showTargetActions) && (
                <div className="flex gap-2 mt-2">
                  {showTargetActions && (
                    <>
                      <Button size="sm" variant="default" className="gap-1"
                        onClick={() => decide.mutate({ id: r.id, endpoint: "target-response", action: "accept" })}>
                        <Check className="w-3.5 h-3.5" /> {t("schSwapAccept") ?? "قبول"}
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-red-600"
                        onClick={() => decide.mutate({ id: r.id, endpoint: "target-response", action: "reject" })}>
                        <X className="w-3.5 h-3.5" /> {t("schSwapReject")}
                      </Button>
                    </>
                  )}
                  {(showSupActions || showWfmActions) && (
                    <>
                      <Button size="sm" variant="default" className="gap-1"
                        onClick={() => decide.mutate({ id: r.id, endpoint: showWfmActions ? "wfm-decision" : "supervisor-review", action: "approve" })}>
                        <Check className="w-3.5 h-3.5" /> {t("schSwapApprove")}
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-red-600"
                        onClick={() => decide.mutate({ id: r.id, endpoint: showWfmActions ? "wfm-decision" : "supervisor-review", action: "reject" })}>
                        <X className="w-3.5 h-3.5" /> {t("schSwapReject")}
                      </Button>
                    </>
                  )}
                  {showCancel && (
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => cancel.mutate(r.id)}>
                      {t("schSwapCancel")}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Day cell on the grid ───────────────────────────────────────────────────
// WFM (canManage) clicks → opens shift editor.
// Supervisor (canRecord only) clicks → opens attendance dropdown for the date.

function ScheduleCell({ agent, dayKey, shift, breaks, filled, date, attStatus, canManage, canRecord, onEdit, onMarkAttendance, t }: any) {
  const interactive = canManage || canRecord;
  const cellContent = shift.isOff ? (
    <Badge variant="secondary" className="text-[10px]">{t("schDayOff")}</Badge>
  ) : shift.start || shift.end ? (
    <div className="space-y-0.5">
      <div dir="ltr">{shift.start} – {shift.end}</div>
      {breaks.length > 0 && (
        <div className="text-[10px] text-muted-foreground" dir="ltr">
          {breaks.map((b: any) => `${b.start}-${b.end}`).join(", ")}
        </div>
      )}
    </div>
  ) : (
    <span>—</span>
  );

  const baseClass = `w-full rounded-lg px-2 py-2 text-xs border ${
    filled ? "bg-primary/10 border-primary/30" : "bg-secondary/20 border-border/40 text-muted-foreground"
  } ${interactive ? "hover:bg-primary/15 cursor-pointer" : "cursor-default"}`;

  // The little attendance dot in the corner of the cell.
  const attColor = attStatus === "present" ? "bg-emerald-500"
                 : attStatus === "late"    ? "bg-amber-500"
                 : attStatus === "absent"  ? "bg-red-500"
                 : "";
  const cellInner = (
    <div className="relative">
      {attColor && <span className={`absolute -top-1 -end-1 w-2.5 h-2.5 rounded-full ${attColor} ring-2 ring-card`} />}
      {cellContent}
    </div>
  );

  if (canManage) {
    return (
      <button type="button" onClick={onEdit} className={baseClass} data-testid={`shift-${agent.id}-${dayKey}`}>
        {cellInner}
      </button>
    );
  }
  if (canRecord) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={baseClass} data-testid={`shift-${agent.id}-${dayKey}`}>
            {cellInner}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-44">
          <div className="px-2 py-1 text-[10px] text-muted-foreground font-bold uppercase">{t("schMarkAttendance")}</div>
          <DropdownMenuItem onClick={() => onMarkAttendance("present")} className={attStatus === "present" ? "bg-emerald-500/10 font-bold" : ""}>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block me-2" />
            {t("attStatusPresent")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onMarkAttendance("late")} className={attStatus === "late" ? "bg-amber-500/10 font-bold" : ""}>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block me-2" />
            {t("attStatusLate")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onMarkAttendance("absent")} className={attStatus === "absent" ? "bg-red-500/10 font-bold" : ""}>
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block me-2" />
            {t("attStatusAbsent")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  return <div className={baseClass}>{cellInner}</div>;
}

// ─── Attendance panel ───────────────────────────────────────────────────────

function AttendancePanel({ canRecord, t, lang, dir }: any) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState<string>(today);
  const { data, isLoading, refetch } = useApi<AttendanceData>(
    `/api/attendance?date=${date}`,
    { queryKey: ["/api/attendance", date] },
  );
  // Local edits keyed by agentId.
  const [edits, setEdits] = useState<Record<number, { status: string; note?: string }>>({});

  // Reset edits when date or data changes.
  const recordByAgent = useMemo(() => {
    const m = new Map<number, { status: string; note: string | null }>();
    for (const r of data?.records ?? []) m.set(r.agentId, { status: r.status, note: r.note });
    return m;
  }, [data]);

  const statusOf = (agentId: number): string =>
    edits[agentId]?.status ?? recordByAgent.get(agentId)?.status ?? "";

  const setStatus = (agentId: number, status: string) =>
    setEdits((s) => ({ ...s, [agentId]: { ...(s[agentId] ?? {}), status } }));

  const saveAll = useApiMutation(
    () => apiRequest("POST", "/api/attendance/bulk", {
      date,
      rows: Object.entries(edits).map(([agentId, v]) => ({
        agentId: Number(agentId), status: v.status, note: v.note,
      })),
    }),
    { onSuccess: () => { setEdits({}); refetch(); }, successMessage: t("attSaved") },
  );

  const STATUS_OPTS: { value: "present" | "late" | "absent"; labelKey: TranslationKey; className: string }[] = [
    { value: "present", labelKey: "attStatusPresent", className: "bg-emerald-500/15 text-emerald-700 border-emerald-300" },
    { value: "late",    labelKey: "attStatusLate",    className: "bg-amber-500/15 text-amber-700 border-amber-300" },
    { value: "absent",  labelKey: "attStatusAbsent",  className: "bg-red-500/15 text-red-700 border-red-300" },
  ];

  return (
    <Card className="rounded-2xl">
      <CardContent className="pt-5 pb-5 space-y-4">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold">{t("attTitle")}</h2>
            <p className="text-xs text-muted-foreground">{t("attSubtitle")}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("attDate")}</Label>
            <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setEdits({}); }} dir="ltr" />
          </div>
          {canRecord && Object.keys(edits).length > 0 && (
            <Button onClick={() => saveAll.mutate(undefined as any)} disabled={saveAll.isPending}
              className="gap-2" data-testid="button-save-attendance">
              <Save className="w-4 h-4" /> {t("attSaveAll")} ({Object.keys(edits).length})
            </Button>
          )}
        </div>

        {isLoading && <Skeleton className="h-40 w-full" />}
        {!isLoading && (data?.agents.length ?? 0) === 0 && (
          <p className="text-center text-muted-foreground py-8">{t("noData")}</p>
        )}
        {!isLoading && (data?.agents.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/30">
                <tr>
                  <th className="text-start px-3 py-2 font-semibold">{t("schAgent")}</th>
                  <th className="text-center px-3 py-2 font-semibold">{t("attStatusPresent")}</th>
                  <th className="text-center px-3 py-2 font-semibold">{t("attStatusLate")}</th>
                  <th className="text-center px-3 py-2 font-semibold">{t("attStatusAbsent")}</th>
                </tr>
              </thead>
              <tbody>
                {data!.agents.map((a) => {
                  const cur = statusOf(a.id);
                  return (
                    <tr key={a.id} className="border-t border-border/40">
                      <td className="px-3 py-2">
                        <div className="font-semibold">{lang === "ar" ? a.nameAr : a.nameEn}</div>
                        <div className="text-[10px] text-muted-foreground" dir="ltr">{a.employeeId}</div>
                      </td>
                      {STATUS_OPTS.map((opt) => (
                        <td key={opt.value} className="px-2 py-2 text-center">
                          <button
                            type="button"
                            disabled={!canRecord}
                            onClick={() => setStatus(a.id, opt.value)}
                            className={`rounded-lg px-3 py-1.5 text-xs border w-full ${
                              cur === opt.value ? `${opt.className} font-bold` : "bg-card border-border/40 text-muted-foreground"
                            } ${canRecord ? "hover:opacity-80 cursor-pointer" : "cursor-default"}`}
                            data-testid={`att-${a.id}-${opt.value}`}
                          >
                            {t(opt.labelKey)}
                          </button>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Multi-week / by-date Excel import ───────────────────────────────────────

function ImportBidateDialog({ open, onClose, projectId, onImported, t, dir, toast }: any) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; weeksAffected: string[]; dateColumns: number; cellErrors: number; unknown: string[] } | null>(null);
  const submit = async () => {
    if (!file || !projectId) return;
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("projectId", String(projectId));
      const res = await fetch("/api/schedules/import-by-date", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw await parseError(res);
      const body = await res.json();
      setResult(body);
      toast({ title: `${t("schImported")} ${body.imported}` });
      if (body.imported > 0) onImported();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir={dir} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("schImportBidate")}</DialogTitle>
          <DialogDescription>{t("schImportBidateHint")}</DialogDescription>
        </DialogHeader>
        <Button variant="outline" size="sm" className="self-start gap-1.5"
          onClick={() => downloadFile("/api/schedules/template-bidate", "schedules-bidate-template.xlsx")}>
          <Upload className="w-4 h-4 rotate-180" /> {t("schImportBidateTemplate")}
        </Button>
        <Input type="file" accept=".xlsx" dir="ltr" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />
        {result && (
          <div className="bg-secondary/30 rounded-lg p-3 text-xs space-y-1">
            <div className="flex justify-between"><span>{t("schImported")}:</span><span className="font-bold" dir="ltr">{result.imported}</span></div>
            <div className="flex justify-between"><span>{t("schImportedWeeks")}:</span>
              <span className="font-bold" dir="ltr">{result.weeksAffected.join(", ") || "—"}</span>
            </div>
            {result.unknown.length > 0 && (
              <div className="pt-2 border-t mt-2">
                <div className="text-amber-700 font-semibold mb-1">{t("aprUnknownRows")} ({result.unknown.length}):</div>
                <div className="text-[10px] flex flex-wrap gap-1" dir="ltr">
                  {result.unknown.map((e, i) => <span key={i} className="bg-amber-500/10 px-1.5 py-0.5 rounded">{e}</span>)}
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{result ? t("close") : t("cancel")}</Button>
          <Button onClick={submit} disabled={!file || busy} className="gap-2">
            <Upload className="w-4 h-4" /> {busy ? t("loading") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
