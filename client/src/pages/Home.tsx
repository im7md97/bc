import { Link } from "wouter";
import {
  ClipboardCheck, BarChart3, Star, Users, FolderOpen, Headset, Upload, ShieldCheck, Settings2, CalendarClock,
} from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth, can, featureOn } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { ROLE_LABEL_KEYS, type TranslationKey } from "@/lib/i18n";

interface Tile {
  path: string;
  labelKey: TranslationKey;
  icon: React.ComponentType<{ className?: string }>;
  need: string[];
  feature?: string;
  color: string;
}

const TILES: Tile[] = [
  { path: "/qc/dashboard", labelKey: "navQc", icon: ClipboardCheck, need: ["qc.evaluate", "qc.approve", "qc.approve_team"], feature: "menu.qc", color: "bg-indigo-500/10 text-indigo-600" },
  { path: "/apr", labelKey: "navApr", icon: BarChart3, need: ["apr.view_all", "apr.view_project", "apr.view_team", "apr.view_own"], feature: "menu.apr", color: "bg-blue-500/10 text-blue-600" },
  { path: "/apr/upload", labelKey: "navAprUpload", icon: Upload, need: ["apr.upload"], feature: "menu.apr", color: "bg-cyan-500/10 text-cyan-600" },
  { path: "/scorecards", labelKey: "navScorecards", icon: Star, need: ["scorecard.view_all", "scorecard.view_project", "scorecard.view_team", "scorecard.view_own"], feature: "menu.scorecards", color: "bg-amber-500/10 text-amber-600" },
  { path: "/scorecards/grid", labelKey: "navGridConfig", icon: Settings2, need: ["scorecard.grid_edit"], feature: "menu.scorecards", color: "bg-orange-500/10 text-orange-600" },
  { path: "/agents", labelKey: "navAgents", icon: Headset, need: ["agent.list_all", "agent.list_project", "agent.list_team"], color: "bg-emerald-500/10 text-emerald-600" },
  { path: "/schedule", labelKey: "navSchedule", icon: CalendarClock, need: ["schedule.manage", "schedule.view_team", "schedule.view_project", "schedule.view_own"], feature: "menu.schedule", color: "bg-sky-500/10 text-sky-600" },
  { path: "/projects", labelKey: "navProjects", icon: FolderOpen, need: ["project.create", "project.edit", "project.edit_own"], feature: "menu.projects", color: "bg-violet-500/10 text-violet-600" },
  { path: "/users", labelKey: "navUsers", icon: Users, need: ["user.list_all"], feature: "menu.users", color: "bg-rose-500/10 text-rose-600" },
  { path: "/super-admin", labelKey: "navSuperAdmin", icon: ShieldCheck, need: ["permission.grant", "feature_flag.toggle"], color: "bg-red-500/10 text-red-600" },
];

export default function HomePage() {
  const { data: user } = useAuth();
  const { t, lang, dir } = useLanguage();

  const tiles = TILES.filter((tile) =>
    can(user, ...tile.need) && (!tile.feature || featureOn(user, tile.feature)));
  const displayName = lang === "ar" ? user?.displayNameAr : user?.displayNameEn;
  const roleKey = user ? ROLE_LABEL_KEYS[user.role] : undefined;

  return (
    <div className="min-h-screen bg-background" dir={dir}>
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-4 py-8">
        <h1 className="text-3xl font-extrabold mb-1">
          {t("homeWelcome")}, {displayName} 👋
        </h1>
        <p className="text-muted-foreground mb-8">
          {roleKey ? t(roleKey) : ""} — {t("homeHint")}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link key={tile.path} href={tile.path}>
                <Card className="rounded-2xl hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer h-full">
                  <CardContent className="pt-6 pb-5 flex flex-col items-center gap-3 text-center">
                    <span className={`w-14 h-14 rounded-2xl flex items-center justify-center ${tile.color}`}>
                      <Icon className="w-7 h-7" />
                    </span>
                    <span className="font-bold">{t(tile.labelKey)}</span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
