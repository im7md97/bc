import {
  LayoutDashboard, Users, LogOut, ChevronDown, Languages,
  FolderOpen, Calendar, Settings,
} from "lucide-react";
import { useLocation, Link } from "wouter";
import { useAuth, useLogout } from "@/hooks/use-auth";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export function Navbar() {
  const [location, setLocation] = useLocation();
  const { data: user } = useAuth();
  const logoutMutation = useLogout();
  const { lang, toggleLang, t, dir } = useLanguage();

  const roleLabel: Record<string, string> = {
    quality: t("roleQuality"),
    supervisor: t("roleSupervisor"),
    agent: t("roleAgent"),
    admin: t("roleAdmin"),
    manager: t("roleManager"),
  };

  const roleBadgeColor: Record<string, string> = {
    quality: "bg-blue-500/10 text-blue-700",
    supervisor: "bg-purple-500/10 text-purple-700",
    agent: "bg-green-500/10 text-green-700",
    admin: "bg-red-500/10 text-red-700",
    manager: "bg-orange-500/10 text-orange-700",
  };

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    setLocation("/login");
  };

  const role = user?.role || "";
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isAdminOrManager = isAdmin || isManager;
  const isSupervisor = role === "supervisor";
  const isAgent = role === "agent";
  const isQuality = role === "quality";

  const navLink = (href: string, icon: React.ReactNode, label: string, testId?: string) => (
    <Link
      href={href}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
        location === href || location.startsWith(href + "/")
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
      }`}
      data-testid={testId}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">

        {/* Logo / Brand */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/25">
            <Settings className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold text-foreground text-sm hidden md:inline">
            {t("loginTitle")}
          </span>
        </div>

        {/* Nav Links — Center */}
        <nav className="flex items-center gap-0.5">
          {/* Language toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleLang}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            data-testid="button-lang-toggle"
          >
            <Languages className="w-4 h-4" />
            <span className="hidden sm:inline font-bold">{lang === "ar" ? "EN" : "عربي"}</span>
          </Button>

          {/* Dashboard — all roles except admin-only redirected to users */}
          {!isAdminOrManager && navLink("/", <LayoutDashboard className="w-4 h-4" />, t("navDashboard"), "link-dashboard")}
          {isAdminOrManager && navLink("/", <LayoutDashboard className="w-4 h-4" />, t("navDashboard"), "link-dashboard")}

          {/* Schedule — agent, supervisor, admin, manager */}
          {(isAgent || isSupervisor || isAdminOrManager) && navLink(
            "/schedule",
            <Calendar className="w-4 h-4" />,
            t("navSchedule"),
            "link-schedule",
          )}

          {/* Projects — admin and manager */}
          {isAdminOrManager && navLink(
            "/projects",
            <FolderOpen className="w-4 h-4" />,
            t("navProjects"),
            "link-projects",
          )}

          {/* Users — admin and manager */}
          {isAdminOrManager && navLink(
            "/users",
            <Users className="w-4 h-4" />,
            t("navUsers"),
            "link-users",
          )}
        </nav>

        {/* User Menu */}
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2 h-9 px-3 rounded-xl hover:bg-secondary/60"
                data-testid="button-user-menu"
              >
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                  <span className="font-bold text-xs">{user.username.charAt(0).toUpperCase()}</span>
                </div>
                <div className="hidden sm:flex flex-col items-start gap-0.5">
                  <span className="text-xs font-semibold leading-none">{user.username}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleBadgeColor[user.role] || "bg-secondary text-muted-foreground"}`}>
                    {roleLabel[user.role] || user.role}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <div className="px-3 py-2">
                <p className="text-sm font-semibold text-foreground">{user.username}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${roleBadgeColor[user.role] || "bg-secondary text-muted-foreground"}`}>
                  {roleLabel[user.role] || user.role}
                </span>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                disabled={logoutMutation.isPending}
                className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer gap-2"
                data-testid="button-logout"
              >
                {logoutMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <LogOut className="w-4 h-4" />}
                {t("navLogout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
