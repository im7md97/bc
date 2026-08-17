import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, FolderOpen, Headset, BarChart3, Upload, Star,
  Settings2, ShieldCheck, ClipboardCheck, FilePlus2, LogOut, Languages, KeyRound, Menu, CalendarClock,
  ChevronDown, User, GraduationCap,
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

interface NavGroup {
  labelKey: TranslationKey;
  items: NavItem[];
}

// Four groups matching the user's information architecture.
// Visibility per item is still permission/feature-flag driven.
const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "navGroupQuality",
    items: [
      { path: "/qc/dashboard", labelKey: "navQc", icon: ClipboardCheck,
        need: ["qc.evaluate", "qc.approve", "qc.approve_team", "qc.view_own"], feature: "menu.qc" },
      { path: "/qc/new-entry", labelKey: "navQcNew", icon: FilePlus2,
        need: ["qc.evaluate"], feature: "menu.qc" },
      { path: "/coaching", labelKey: "navCoaching", icon: GraduationCap,
        need: ["coaching.create", "coaching.view_all", "coaching.view_project", "coaching.view_team", "coaching.view_own"],
        feature: "menu.coaching" },
    ],
  },
  {
    labelKey: "navGroupPerformance",
    items: [
      { path: "/apr", labelKey: "navApr", icon: BarChart3,
        need: ["apr.view_all", "apr.view_project", "apr.view_team", "apr.view_own"], feature: "menu.apr" },
      { path: "/scorecards", labelKey: "navScorecards", icon: Star,
        need: ["scorecard.view_all", "scorecard.view_project", "scorecard.view_team", "scorecard.view_own"], feature: "menu.scorecards" },
      { path: "/apr/upload", labelKey: "navAprUpload", icon: Upload,
        need: ["apr.upload"], feature: "menu.apr" },
      { path: "/scorecards/grid", labelKey: "navGridConfig", icon: Settings2,
        need: ["scorecard.grid_edit"], feature: "menu.scorecards" },
    ],
  },
  {
    labelKey: "navGroupSchedule",
    items: [
      { path: "/schedule", labelKey: "navSchedule", icon: CalendarClock,
        need: ["schedule.manage", "schedule.view_team", "schedule.view_project", "schedule.view_own"], feature: "menu.schedule" },
    ],
  },
  {
    labelKey: "navGroupUser",
    items: [
      { path: "/agents", labelKey: "navAgents", icon: Headset,
        need: ["agent.list_all", "agent.list_project", "agent.list_team"] },
      { path: "/users", labelKey: "navUsers", icon: Users,
        need: ["user.list_all"], feature: "menu.users" },
      { path: "/projects", labelKey: "navProjects", icon: FolderOpen,
        need: ["project.create", "project.edit", "project.edit_own"], feature: "menu.projects" },
      { path: "/super-admin", labelKey: "navSuperAdmin", icon: ShieldCheck,
        need: ["permission.grant", "feature_flag.toggle"] },
    ],
  },
];

function itemVisible(user: AuthUser | null | undefined, item: NavItem): boolean {
  return (item.need.length === 0 || can(user, ...item.need))
    && (!item.feature || featureOn(user, item.feature));
}

function visibleItemsOf(user: AuthUser | null | undefined, group: NavGroup): NavItem[] {
  return group.items.filter((item) => itemVisible(user, item));
}

export function Navbar() {
  const { data: user } = useAuth();
  const { t, lang, toggleLang, dir } = useLanguage();
  const logout = useLogout();
  const setServerLang = useSetLanguage();
  const [location, setLocation] = useLocation();

  const visibleGroups = NAV_GROUPS
    .map((g) => ({ group: g, items: visibleItemsOf(user, g) }))
    .filter((g) => g.items.length > 0);

  const displayName = lang === "ar" ? user?.displayNameAr : user?.displayNameEn;
  const roleKey = user ? ROLE_LABEL_KEYS[user.role] : undefined;

  const handleToggleLang = () => {
    toggleLang();
    setServerLang.mutate(lang === "ar" ? "en" : "ar");
  };

  return (
    <header className="sticky top-0 z-40">
      <div className="bg-card border-b border-border/60">
        <div className="max-w-[1400px] mx-auto px-6 h-20 flex items-center gap-3">
        <Link href="/" className="font-extrabold text-primary text-xl whitespace-nowrap me-4 flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground grid place-items-center">
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <span className="hidden sm:inline">{t("appName")}</span>
        </Link>

        {/* Desktop: 4 grouped dropdowns */}
        <nav className="hidden lg:flex items-center gap-2 flex-1 justify-center">
          {visibleGroups.map(({ group, items }) => {
            const isActive = items.some((i) => i.path === location);
            return (
              <DropdownMenu key={group.labelKey}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className={`gap-1.5 px-5 h-12 text-base font-bold rounded-xl ${isActive ? "bg-primary/10 text-primary" : "hover:bg-secondary/60"}`}
                    data-testid={`nav-group-${group.labelKey}`}
                  >
                    {t(group.labelKey)}
                    <ChevronDown className="w-4 h-4 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="min-w-[240px] p-2 rounded-2xl">
                  {items.map((item) => {
                    const active = location === item.path;
                    return (
                      <DropdownMenuItem
                        key={item.path}
                        onClick={() => setLocation(item.path)}
                        className={`py-3 px-4 cursor-pointer rounded-xl text-[15px] ${active ? "bg-primary/10 text-primary font-bold" : "font-medium"}`}
                      >
                        {t(item.labelKey)}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
        </nav>

        <div className="flex-1 lg:hidden" />

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleToggleLang} className="w-10 h-10" title={lang === "ar" ? "English" : "العربية"}>
            <Languages className="w-5 h-5" />
          </Button>
          <NotificationBell />

          {/* Mobile menu — flat list of all visible items */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon"><Menu className="w-5 h-5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 lg:hidden p-1.5">
              {visibleGroups.map(({ group, items }, gi) => (
                <div key={group.labelKey}>
                  {gi > 0 && <DropdownMenuSeparator />}
                  <div className="px-2 py-1.5 text-[10px] font-bold uppercase text-muted-foreground">{t(group.labelKey)}</div>
                  {items.map((item) => (
                    <DropdownMenuItem key={item.path} onClick={() => setLocation(item.path)} className="rounded-lg px-3 py-2.5 text-sm font-medium">
                      {t(item.labelKey)}
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2.5 ps-2 pe-3 h-12 rounded-xl">
                <span className="w-9 h-9 rounded-full bg-primary/15 text-primary font-bold flex items-center justify-center text-base">
                  {(displayName || "?").charAt(0)}
                </span>
                <span className="hidden sm:flex flex-col items-start leading-tight text-start">
                  <span className="text-sm font-bold">{displayName}</span>
                  <span className="text-xs text-muted-foreground">{roleKey ? t(roleKey) : ""}</span>
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2">
              <DropdownMenuItem onClick={() => setLocation("/profile")} className="gap-3 py-2.5 px-3 rounded-xl text-sm font-medium">
                <User className="w-4 h-4" />
                {t("navProfile")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation("/change-password")} className="gap-3 py-2.5 px-3 rounded-xl text-sm font-medium">
                <KeyRound className="w-4 h-4" />
                {t("navChangePassword")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout.mutate()} className="gap-3 py-2.5 px-3 rounded-xl text-sm font-medium text-red-600 focus:text-red-600">
                <LogOut className="w-4 h-4" />
                {t("navLogout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      </div>
    </header>
  );
}
