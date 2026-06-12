import { useState, useMemo } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSchedules, useSaveSchedule, useDeleteSchedule, type Schedule } from "@/hooks/use-wfm";
import { useSystemUsers } from "@/hooks/use-auth";
import { useAuth } from "@/hooks/use-auth";
import { Calendar, ChevronLeft, ChevronRight, Clock, Coffee, Moon, Save, Trash2, Loader2, AlertCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { WeeklyShifts, ShiftDay } from "@shared/schema";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
type DayKey = typeof DAYS[number];

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().split("T")[0];
}

function formatWeekLabel(weekStart: string, lang: string): string {
  const start = new Date(weekStart);
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const locale = lang === "ar" ? "ar-SA" : "en-US";
  return `${start.toLocaleDateString(locale, opts)} – ${end.toLocaleDateString(locale, opts)}`;
}

const DEFAULT_SHIFT: ShiftDay = { start: "08:00", end: "17:00", breakStart: "12:00", breakEnd: "13:00", isOff: false };

// ─── Shift Editor ──────────────────────────────────────────────────────────────
function ShiftEditor({ day, value, onChange, dayLabel }: { day: DayKey; value: ShiftDay; onChange: (v: ShiftDay) => void; dayLabel: string }) {
  const { t } = useLanguage();
  return (
    <div className={`bg-card border border-border/60 rounded-2xl p-4 shadow-sm transition-opacity ${value.isOff ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="font-bold text-sm">{dayLabel}</span>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-xs text-muted-foreground">{t("scheduleDayOff")}</span>
          <div onClick={() => onChange({ ...value, isOff: !value.isOff })}
            className={`w-10 h-5 rounded-full transition-colors cursor-pointer flex items-center px-0.5 ${value.isOff ? "bg-red-400" : "bg-green-500"}`}>
            <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${value.isOff ? "translate-x-0" : "translate-x-5"}`} />
          </div>
        </label>
      </div>
      {value.isOff ? (
        <div className="flex items-center justify-center h-10 text-muted-foreground text-sm">{t("scheduleDayOff")}</div>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[
            { label: t("scheduleShiftStart"), icon: <Clock className="w-3 h-3" />, field: "start" as const },
            { label: t("scheduleShiftEnd"), icon: <Moon className="w-3 h-3" />, field: "end" as const },
            { label: t("scheduleBreakStart"), icon: <Coffee className="w-3 h-3" />, field: "breakStart" as const },
            { label: t("scheduleBreakEnd"), icon: <Coffee className="w-3 h-3" />, field: "breakEnd" as const },
          ].map(({ label, icon, field }) => (
            <div key={field}>
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">{icon} {label}</p>
              <input type="time" value={(value as any)[field] || ""}
                onChange={(e) => onChange({ ...value, [field]: e.target.value })}
                className="w-full h-9 rounded-lg border border-border bg-secondary/30 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Schedule Read-only View ───────────────────────────────────────────────────
function ScheduleReadonly({ schedule, dayLabels, t }: { schedule: Schedule; dayLabels: Record<string, string>; t: any }) {
  let shifts: WeeklyShifts = {};
  try { shifts = JSON.parse(schedule.shiftsJson); } catch {}
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {DAYS.map(day => {
        const shift = shifts[day];
        return (
          <div key={day} className={`bg-card border border-border/60 rounded-2xl p-4 shadow-sm ${shift?.isOff ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-sm">{dayLabels[day]}</span>
              {shift?.isOff
                ? <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 text-xs">{t("scheduleDayOff")}</Badge>
                : <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">{t("statusActive")}</Badge>}
            </div>
            {shift && !shift.isOff && (
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1"><Clock className="w-3 h-3" />{shift.start} — {shift.end}</div>
                {shift.breakStart && shift.breakEnd && (
                  <div className="flex items-center gap-1 text-amber-600"><Coffee className="w-3 h-3" />{shift.breakStart} — {shift.breakEnd}</div>
                )}
              </div>
            )}
            {!shift && <p className="text-xs text-muted-foreground">{t("scheduleNoSchedule")}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Breaks Overview Tab ───────────────────────────────────────────────────────
function BreaksOverview({ schedules, agents, currentWeek, dayLabels, t, dir, canEdit, onEditBreak }:
  { schedules: Schedule[]; agents: any[]; currentWeek: string; dayLabels: Record<string, string>; t: any; dir: string; canEdit: boolean; onEditBreak: (agentId: number) => void }) {

  const weekSchedules = useMemo(() => {
    return schedules.filter(s => s.weekStart === currentWeek);
  }, [schedules, currentWeek]);

  const getBreak = (agentId: number, day: DayKey) => {
    const s = weekSchedules.find(x => x.agentId === agentId);
    if (!s) return null;
    try {
      const shifts: WeeklyShifts = JSON.parse(s.shiftsJson);
      const d = shifts[day];
      if (!d || d.isOff) return null;
      return d.breakStart && d.breakEnd ? `${d.breakStart}–${d.breakEnd}` : null;
    } catch { return null; }
  };

  if (agents.length === 0) {
    return (
      <div className="p-16 text-center flex flex-col items-center bg-card rounded-2xl border border-border/60">
        <Coffee className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-lg font-semibold text-muted-foreground">{t("scheduleNoAgents")}</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border/60 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50">
            <tr>
              <th className={`px-4 py-3 font-bold text-foreground ${dir === "rtl" ? "text-right" : "text-left"} min-w-[120px]`}>{t("scheduleAgent")}</th>
              {DAYS.map(day => (
                <th key={day} className="px-3 py-3 font-semibold text-foreground text-center min-w-[100px] whitespace-nowrap">{dayLabels[day]}</th>
              ))}
              {canEdit && <th className="px-3 py-3 font-bold text-foreground text-center">{t("actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {agents.map((agent, i) => (
              <tr key={agent.id} className={i % 2 === 0 ? "bg-background hover:bg-secondary/10" : "bg-secondary/5 hover:bg-secondary/20"}>
                <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold border border-primary/20">
                      {agent.username.charAt(0).toUpperCase()}
                    </div>
                    {agent.username}
                  </div>
                </td>
                {DAYS.map(day => {
                  const breakTime = getBreak(agent.id, day);
                  return (
                    <td key={day} className="px-3 py-3 text-center">
                      {breakTime ? (
                        <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap">
                          <Coffee className="w-3 h-3" />{breakTime}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  );
                })}
                {canEdit && (
                  <td className="px-3 py-3 text-center">
                    <Button variant="ghost" size="sm" onClick={() => onEditBreak(agent.id)}
                      className="h-7 px-2 text-xs text-primary hover:bg-primary/10">
                      <Coffee className="w-3 h-3 mr-1" />{t("edit")}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {weekSchedules.length === 0 && (
        <div className="p-6 text-center text-muted-foreground text-sm border-t border-border/40">
          <Coffee className="w-6 h-6 mx-auto mb-2 opacity-40" />
          {t("scheduleNoSchedule")}
        </div>
      )}
    </div>
  );
}

// ─── Main Schedule Page ────────────────────────────────────────────────────────
export default function SchedulePage() {
  const { data: user } = useAuth();
  const { data: schedules = [], isLoading } = useSchedules();
  const { data: allUsers } = useSystemUsers();
  const saveMutation = useSaveSchedule();
  const deleteMutation = useDeleteSchedule();
  const { t, dir, lang } = useLanguage();

  const role = user?.role || "";
  const isAgent = role === "agent";
  const canEdit = ["admin", "manager", "supervisor", "wfm"].includes(role);

  const [currentWeek, setCurrentWeek] = useState(() => getWeekStart(new Date()));
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(isAgent ? (user?.id ?? null) : null);
  const [editMode, setEditMode] = useState(false);
  const [editShifts, setEditShifts] = useState<WeeklyShifts>({});

  const agents = useMemo(() => (allUsers || []).filter(u => u.role === "agent"), [allUsers]);

  const agentSchedule = useMemo(() => {
    if (!selectedAgentId) return null;
    return schedules.find(s => s.agentId === selectedAgentId && s.weekStart === currentWeek) || null;
  }, [schedules, selectedAgentId, currentWeek]);

  const dayLabels: Record<string, string> = {
    monday: t("scheduleMonday"), tuesday: t("scheduleTuesday"), wednesday: t("scheduleWednesday"),
    thursday: t("scheduleThursday"), friday: t("scheduleFriday"), saturday: t("scheduleSaturday"), sunday: t("scheduleSunday"),
  };

  const startEdit = (agentId?: number) => {
    if (agentId) setSelectedAgentId(agentId);
    const targetAgentId = agentId ?? selectedAgentId;
    const s = schedules.find(x => x.agentId === targetAgentId && x.weekStart === currentWeek);
    let shifts: WeeklyShifts = {};
    if (s) { try { shifts = JSON.parse(s.shiftsJson); } catch {} }
    const filled: WeeklyShifts = {};
    DAYS.forEach(d => { filled[d] = shifts[d] ?? { ...DEFAULT_SHIFT }; });
    setEditShifts(filled);
    setEditMode(true);
  };

  const handleSave = async () => {
    if (!selectedAgentId) return;
    await saveMutation.mutateAsync({ agentId: selectedAgentId, weekStart: currentWeek, shiftsJson: editShifts });
    setEditMode(false);
  };

  const handleDelete = async () => {
    if (!agentSchedule) return;
    await deleteMutation.mutateAsync(agentSchedule.id);
  };

  // Week nav bar (shared across tabs)
  const WeekNav = () => (
    <div className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => { setCurrentWeek(w => addWeeks(w, -1)); setEditMode(false); }} className="rounded-xl h-9 w-9">
            {dir === "rtl" ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
          <div className="flex items-center gap-2 px-4 py-2 bg-secondary/40 rounded-xl min-w-[180px] justify-center">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">{formatWeekLabel(currentWeek, lang)}</span>
          </div>
          <Button variant="outline" size="icon" onClick={() => { setCurrentWeek(w => addWeeks(w, 1)); setEditMode(false); }} className="rounded-xl h-9 w-9">
            {dir === "rtl" ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>

        {!isAgent && (
          <Select value={selectedAgentId?.toString() || ""} onValueChange={(v) => { setSelectedAgentId(Number(v)); setEditMode(false); }}>
            <SelectTrigger className="h-9 rounded-xl bg-secondary/40 border-transparent min-w-[170px]">
              <SelectValue placeholder={t("scheduleSelectAgent")} />
            </SelectTrigger>
            <SelectContent dir={dir}>
              {agents.length === 0
                ? <SelectItem value="none" disabled>{t("scheduleNoAgents")}</SelectItem>
                : agents.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.username}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {canEdit && selectedAgentId && !editMode && (
          <div className="flex gap-2 ml-auto">
            <Button onClick={() => startEdit()} className="h-9 rounded-xl bg-primary text-white px-4 font-semibold text-sm">
              <Calendar className="w-4 h-4 mr-1" />
              {agentSchedule ? t("scheduleEditBtn") : t("scheduleAddBtn")}
            </Button>
            {agentSchedule && (
              <Button variant="outline" size="icon" onClick={handleDelete} disabled={deleteMutation.isPending} className="h-9 w-9 rounded-xl text-red-600 border-red-200 hover:bg-red-50">
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              </Button>
            )}
          </div>
        )}

        {editMode && (
          <div className="flex gap-2 ml-auto">
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="h-9 rounded-xl bg-green-600 text-white px-4 font-semibold text-sm">
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              {t("scheduleSave")}
            </Button>
            <Button variant="outline" onClick={() => setEditMode(false)} className="h-9 rounded-xl px-4 text-sm">{t("cancel")}</Button>
          </div>
        )}
      </div>
    </div>
  );

  const ScheduleContent = () => {
    if (isLoading) return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {DAYS.map(d => <Skeleton key={d} className="h-40 rounded-2xl" />)}
      </div>
    );
    if (!selectedAgentId && !isAgent) return (
      <div className="p-16 text-center flex flex-col items-center bg-card rounded-2xl border border-border/60">
        <Calendar className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-lg font-semibold text-muted-foreground">{t("scheduleSelectAgent")}</p>
      </div>
    );
    if (editMode) return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {DAYS.map(day => (
          <ShiftEditor key={day} day={day}
            value={editShifts[day] ?? { ...DEFAULT_SHIFT }}
            onChange={(v) => setEditShifts(prev => ({ ...prev, [day]: v }))}
            dayLabel={dayLabels[day]} />
        ))}
      </div>
    );
    if (agentSchedule) return <ScheduleReadonly schedule={agentSchedule} dayLabels={dayLabels} t={t} />;
    return (
      <div className="p-16 text-center flex flex-col items-center bg-card rounded-2xl border border-border/60">
        <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-lg font-semibold text-muted-foreground">{t("scheduleNoSchedule")}</p>
        {canEdit && (
          <Button onClick={() => startEdit()} className="mt-4 bg-primary text-white rounded-xl px-6">{t("scheduleAddBtn")}</Button>
        )}
      </div>
    );
  };

  // For wfm/admin/manager show tabs; agent/supervisor see simple view
  const showTabs = ["wfm", "admin", "manager"].includes(role);

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans" dir={dir}>
      <Navbar />
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        <div>
          <h2 className="text-3xl font-extrabold text-foreground tracking-tight">{t("scheduleTitle")}</h2>
          <p className="text-muted-foreground mt-1">{t("scheduleSubtitle")}</p>
        </div>

        {showTabs ? (
          <Tabs defaultValue="schedules">
            <TabsList className="mb-4 bg-secondary/40 rounded-xl p-1">
              <TabsTrigger value="schedules" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm font-semibold">
                <Calendar className="w-4 h-4 mr-1.5" />{t("scheduleTitle")}
              </TabsTrigger>
              <TabsTrigger value="breaks" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm font-semibold">
                <Coffee className="w-4 h-4 mr-1.5" />{t("breaksTitle")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="schedules" className="space-y-4 mt-0">
              <WeekNav />
              <ScheduleContent />
            </TabsContent>

            <TabsContent value="breaks" className="space-y-4 mt-0">
              {/* Week nav without agent selector for breaks overview */}
              <div className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => setCurrentWeek(w => addWeeks(w, -1))} className="rounded-xl h-9 w-9">
                    {dir === "rtl" ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                  </Button>
                  <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl min-w-[180px] justify-center">
                    <Coffee className="w-4 h-4 text-amber-600" />
                    <span className="font-semibold text-sm text-amber-800">{formatWeekLabel(currentWeek, lang)}</span>
                  </div>
                  <Button variant="outline" size="icon" onClick={() => setCurrentWeek(w => addWeeks(w, 1))} className="rounded-xl h-9 w-9">
                    {dir === "rtl" ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </Button>
                  <span className="text-sm text-muted-foreground mr-2">
                    {agents.length} {t("scheduleAgent")}
                  </span>
                </div>
              </div>
              <BreaksOverview
                schedules={schedules}
                agents={agents}
                currentWeek={currentWeek}
                dayLabels={dayLabels}
                t={t}
                dir={dir}
                canEdit={canEdit}
                onEditBreak={(agentId) => { setSelectedAgentId(agentId); startEdit(agentId); }}
              />
              {/* Show edit panel below if editing from breaks tab */}
              {editMode && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-foreground">{t("breaksEditTitle")}: {agents.find(a => a.id === selectedAgentId)?.username}</h3>
                    <div className="flex gap-2">
                      <Button onClick={handleSave} disabled={saveMutation.isPending} className="h-9 rounded-xl bg-green-600 text-white px-4 font-semibold text-sm">
                        {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                        {t("scheduleSave")}
                      </Button>
                      <Button variant="outline" onClick={() => setEditMode(false)} className="h-9 rounded-xl px-4 text-sm">{t("cancel")}</Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {DAYS.map(day => (
                      <ShiftEditor key={day} day={day}
                        value={editShifts[day] ?? { ...DEFAULT_SHIFT }}
                        onChange={(v) => setEditShifts(prev => ({ ...prev, [day]: v }))}
                        dayLabel={dayLabels[day]} />
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <>
            <WeekNav />
            <ScheduleContent />
          </>
        )}
      </main>
    </div>
  );
}
