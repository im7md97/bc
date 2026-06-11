import { useState, useMemo } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useSchedules, useSaveSchedule, useDeleteSchedule, type Schedule } from "@/hooks/use-schedules";
import { useSystemUsers } from "@/hooks/use-users";
import { useAuth } from "@/hooks/use-auth";
import {
  Calendar, ChevronLeft, ChevronRight, Clock, Coffee, Moon, Save, Trash2, Loader2, AlertCircle,
} from "lucide-react";
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
  return `${start.toLocaleDateString(locale, opts)} - ${end.toLocaleDateString(locale, opts)}`;
}

const DEFAULT_SHIFT: ShiftDay = { start: "08:00", end: "17:00", breakStart: "12:00", breakEnd: "13:00", isOff: false };

function ShiftEditor({
  day, value, onChange, dayLabel, dir,
}: {
  day: DayKey;
  value: ShiftDay;
  onChange: (v: ShiftDay) => void;
  dayLabel: string;
  dir: string;
}) {
  const { t } = useLanguage();
  return (
    <div className={`bg-card border border-border/60 rounded-2xl p-4 shadow-sm ${value.isOff ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="font-bold text-foreground">{dayLabel}</span>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-xs text-muted-foreground">{t("scheduleDayOff")}</span>
          <div
            onClick={() => onChange({ ...value, isOff: !value.isOff })}
            className={`w-10 h-5 rounded-full transition-colors cursor-pointer flex items-center px-0.5 ${value.isOff ? "bg-red-400" : "bg-green-500"}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${value.isOff ? "translate-x-0" : "translate-x-5"}`} />
          </div>
        </label>
      </div>
      {!value.isOff && (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {t("scheduleShiftStart")}
            </p>
            <input
              type="time" value={value.start}
              onChange={(e) => onChange({ ...value, start: e.target.value })}
              className="w-full h-9 rounded-lg border border-border bg-secondary/30 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Moon className="w-3 h-3" /> {t("scheduleShiftEnd")}
            </p>
            <input
              type="time" value={value.end}
              onChange={(e) => onChange({ ...value, end: e.target.value })}
              className="w-full h-9 rounded-lg border border-border bg-secondary/30 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Coffee className="w-3 h-3" /> {t("scheduleBreakStart")}
            </p>
            <input
              type="time" value={value.breakStart || ""}
              onChange={(e) => onChange({ ...value, breakStart: e.target.value })}
              className="w-full h-9 rounded-lg border border-border bg-secondary/30 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Coffee className="w-3 h-3" /> {t("scheduleBreakEnd")}
            </p>
            <input
              type="time" value={value.breakEnd || ""}
              onChange={(e) => onChange({ ...value, breakEnd: e.target.value })}
              className="w-full h-9 rounded-lg border border-border bg-secondary/30 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      )}
      {value.isOff && (
        <div className="flex items-center justify-center h-12 text-muted-foreground text-sm">
          {t("scheduleDayOff")}
        </div>
      )}
    </div>
  );
}

function ScheduleReadonly({ schedule, lang, t, dir }: { schedule: Schedule; lang: string; t: any; dir: string }) {
  let shifts: WeeklyShifts = {};
  try { shifts = JSON.parse(schedule.shiftsJson); } catch {}

  const dayLabels: Record<string, string> = {
    monday: t("scheduleMonday"), tuesday: t("scheduleTuesday"), wednesday: t("scheduleWednesday"),
    thursday: t("scheduleThursday"), friday: t("scheduleFriday"), saturday: t("scheduleSaturday"), sunday: t("scheduleSunday"),
  };

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
            {!shift?.isOff && shift && (
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1"><Clock className="w-3 h-3" />{shift.start} — {shift.end}</div>
                {shift.breakStart && shift.breakEnd && (
                  <div className="flex items-center gap-1"><Coffee className="w-3 h-3" />{shift.breakStart} — {shift.breakEnd}</div>
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

export default function SchedulePage() {
  const { data: user } = useAuth();
  const { data: schedules, isLoading } = useSchedules();
  const { data: allUsers } = useSystemUsers();
  const saveMutation = useSaveSchedule();
  const deleteMutation = useDeleteSchedule();
  const { t, dir, lang } = useLanguage();

  const role = user?.role || "";
  const isAgent = role === "agent";
  const canEdit = ["admin", "manager", "supervisor"].includes(role);

  const [currentWeek, setCurrentWeek] = useState(() => getWeekStart(new Date()));
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(isAgent ? (user?.id ?? null) : null);
  const [editMode, setEditMode] = useState(false);
  const [editShifts, setEditShifts] = useState<WeeklyShifts>({});

  const agents = useMemo(() => {
    if (!allUsers) return [];
    return allUsers.filter(u => u.role === "agent");
  }, [allUsers]);

  const agentSchedule = useMemo(() => {
    if (!schedules || !selectedAgentId) return null;
    return schedules.find(s => s.agentId === selectedAgentId && s.weekStart === currentWeek) || null;
  }, [schedules, selectedAgentId, currentWeek]);

  const startEdit = () => {
    let shifts: WeeklyShifts = {};
    if (agentSchedule) {
      try { shifts = JSON.parse(agentSchedule.shiftsJson); } catch {}
    }
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

  const dayLabels: Record<string, string> = {
    monday: t("scheduleMonday"), tuesday: t("scheduleTuesday"), wednesday: t("scheduleWednesday"),
    thursday: t("scheduleThursday"), friday: t("scheduleFriday"), saturday: t("scheduleSaturday"), sunday: t("scheduleSunday"),
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans" dir={dir}>
      <Navbar />

      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-foreground tracking-tight">{t("scheduleTitle")}</h2>
            <p className="text-muted-foreground mt-1">{t("scheduleSubtitle")}</p>
          </div>
        </div>

        {/* Week Nav + Agent Selector */}
        <div className="bg-card border border-border/60 rounded-2xl p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Week Navigation */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setCurrentWeek(w => addWeeks(w, -1))} className="rounded-xl h-9 w-9">
                {dir === "rtl" ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </Button>
              <div className="flex items-center gap-2 px-4 py-2 bg-secondary/40 rounded-xl min-w-[180px] justify-center">
                <Calendar className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">{formatWeekLabel(currentWeek, lang)}</span>
              </div>
              <Button variant="outline" size="icon" onClick={() => setCurrentWeek(w => addWeeks(w, 1))} className="rounded-xl h-9 w-9">
                {dir === "rtl" ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </Button>
            </div>

            {/* Agent selector (non-agent roles) */}
            {!isAgent && (
              <div className="flex-1 min-w-[200px]">
                <Select
                  value={selectedAgentId?.toString() || ""}
                  onValueChange={(v) => { setSelectedAgentId(Number(v)); setEditMode(false); }}
                >
                  <SelectTrigger className="h-9 rounded-xl bg-secondary/40 border-transparent">
                    <SelectValue placeholder={t("scheduleSelectAgent")} />
                  </SelectTrigger>
                  <SelectContent dir={dir}>
                    {agents.length === 0
                      ? <SelectItem value="none" disabled>{t("scheduleNoAgents")}</SelectItem>
                      : agents.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.username}</SelectItem>)
                    }
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Actions */}
            {canEdit && selectedAgentId && !editMode && (
              <div className="flex gap-2 ml-auto">
                <Button onClick={startEdit} className="h-9 rounded-xl bg-primary text-white px-4 font-semibold text-sm">
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
                <Button variant="outline" onClick={() => setEditMode(false)} className="h-9 rounded-xl px-4 text-sm">
                  {t("cancel")}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Schedule Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {DAYS.map(d => <Skeleton key={d} className="h-40 rounded-2xl" />)}
          </div>
        ) : !selectedAgentId ? (
          <div className="p-16 text-center flex flex-col items-center bg-card rounded-2xl border border-border/60">
            <Calendar className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-semibold text-muted-foreground">{t("scheduleSelectAgent")}</p>
          </div>
        ) : editMode ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {DAYS.map(day => (
              <ShiftEditor
                key={day}
                day={day}
                value={editShifts[day] ?? { ...DEFAULT_SHIFT }}
                onChange={(v) => setEditShifts(prev => ({ ...prev, [day]: v }))}
                dayLabel={dayLabels[day]}
                dir={dir}
              />
            ))}
          </div>
        ) : agentSchedule ? (
          <ScheduleReadonly schedule={agentSchedule} lang={lang} t={t} dir={dir} />
        ) : (
          <div className="p-16 text-center flex flex-col items-center bg-card rounded-2xl border border-border/60">
            <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-semibold text-muted-foreground">{t("scheduleNoSchedule")}</p>
            {canEdit && (
              <Button onClick={startEdit} className="mt-4 bg-primary text-white rounded-xl px-6">
                {t("scheduleAddBtn")}
              </Button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
