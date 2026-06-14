import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, FolderOpen, Headset, BarChart3, Upload, Star,
  Settings2, ShieldCheck, ClipboardCheck, FilePlus2, LogOut, Languages, KeyRound, Menu, CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth, useLogout, useSetLanguage, can, featureOn, type AuthUser } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ROLE_LABEL_KEYS, type TranslationKey } from "@/lib/i18n";

interface NavItem {
  path: string;
  labelKey: TranslationKey;
  icon: React.ComponentType<{ className?: string }>;
  need: string[];
  feature?: string;
}

// Order matters: most-used items first per role; visibility is permission-driven (§10).
const NAV_ITEMS: NavItem[] = [
  { path: "/", labelKey: "navDashboard", icon: LayoutDashboard, need: [] },
  { path: "/qc/dashboard", labelKey: "navQc", icon: ClipboardCheck, need: ["qc.evaluate", "qc.approve", "qc.approve_team", "qc.view_own"], feature: "menu.qc" },
  { path: "/qc/new-entry", labelKey: "navQcNew", icon: FilePlus2, need: ["qc.evaluate"], feature: "menu.qc" },
  { path: "/apr", labelKey: "navApr", icon: BarChart3, need: ["apr.view_all", "apr.view_project", "apr.view_team", "apr.view_own"], feature: "menu.apr" },
  { path: "/apr/upload", labelKey: "navAprUpload", icon: Upload, need: ["apr.upload"], feature: "menu.apr" },
  { path: "/scorecards", labelKey: "navScorecards", icon: Star, need: ["scorecard.view_all", "scorecard.view_project", "scorecard.view_team", "scorecard.view_own"], feature: "menu.scorecards" },
  { path: "/scorecards/grid", labelKey: "navGridConfig", icon: Settings2, need: ["scorecard.grid_edit"], feature: "menu.scorecards" },
  { path: "/agents", labelKey: "navAgents", icon: Headset, need: ["agent.list_all", "agent.list_project", "agent.list_team"] },
  { path: "/schedule", labelKey: "navSchedule", icon: CalendarClock, need: ["schedule.manage", "schedule.view_team", "schedule.view_project", "schedule.view_own"], feature: "menu.schedule" },
  { path: "/projects", labelKey: "navProjects", icon: FolderOpen, need: ["project.create", "project.edit", "project.edit_own"], feature: "menu.projects" },
  { path: "/users", labelKey: "navUsers", icon: Users, need: ["user.list_all"], feature: "menu.users" },
  { path: "/super-admin", labelKey: "navSuperAdmin", icon: ShieldCheck, need: ["permission.grant", "feature_flag.toggle"] },
];

function visibleItems(user: AuthUser | null | undefined): NavItem[] {
  return NAV_ITEMS.filter((item) =>
    (item.need.length === 0 || can(user, ...item.need)) &&
    (!item.feature || featureOn(user, item.feature)));
}

export function Navbar() {
  const { data: user } = useAuth();
  const { t, lang, toggleLang, dir } = useLanguage();
  const logout = useLogout();
  const setServerLang = useSetLanguage();
  const [location, setLocation] = useLocation();

  const items = visibleItems(user);
  const displayName = lang === "ar" ? user?.displayNameAr : user?.displayNameEn;
  const roleKey = user ? ROLE_LABEL_KEYS[user.role] : undefined;

  const handleToggleLang = () => {
    toggleLang();
    // Persist the choice on the user record (§12).
    setServerLang.mutate(lang === "ar" ? "en" : "ar");
  };

  return (
    <header className="sticky top-0 z-40 bg-card/95 backdrop-blur border-b border-border/60">
      <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center gap-2">
        <Link href="/" className="font-extrabold text-primary text-lg whitespace-nowrap me-2">
          {t("appName")}
        </Link>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1 flex-1 overflow-x-auto">
          {items.map((item) => {
            const Icon = item.icon;
            const active = location === item.path;
            return (
              <Link key={item.path} href={item.path}>
                <Button variant={active ? "secondary" : "ghost"} size="sm" className="gap-1.5 whitespace-nowrap">
                  <Icon className="w-4 h-4" />
                  {t(item.labelKey)}
                </Button>
              </Link>
            );
          })}
        </nav>

        <div className="flex-1 lg:hidden" />

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={handleToggleLang} title={lang === "ar" ? "English" : "العربية"}>
            <Languages className="w-5 h-5" />
          </Button>
          <NotificationBell />

          {/* Mobile menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon"><Menu className="w-5 h-5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 lg:hidden">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem key={item.path} onClick={() => setLocation(item.path)} className="gap-2">
                    <Icon className="w-4 h-4" />
                    {t(item.labelKey)}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 ps-2 pe-3">
                <span className="w-8 h-8 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center text-sm">
                  {(displayName || "?").charAt(0)}
                </span>
                <span className="hidden sm:flex flex-col items-start leading-tight">
                  <span className="text-sm font-semibold">{displayName}</span>
                  <span className="text-[10px] text-muted-foreground">{roleKey ? t(roleKey) : ""}</span>
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => setLocation("/change-password")} className="gap-2">
                <KeyRound className="w-4 h-4" />
                {t("navChangePassword")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout.mutate()} className="gap-2 text-red-600 focus:text-red-600">
                <LogOut className="w-4 h-4" />
                {t("navLogout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
