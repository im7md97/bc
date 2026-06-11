import { LayoutDashboard, Users, LogOut, ChevronDown, Languages } from "lucide-react";
import { useLocation, Link } from "wouter";
import { useAuth, useLogout } from "@/hooks/use-auth";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
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
  };

  const roleBadgeColor: Record<string, string> = {
    quality: "bg-blue-500/10 text-blue-700",
    supervisor: "bg-purple-500/10 text-purple-700",
    agent: "bg-green-500/10 text-green-700",
    admin: "bg-red-500/10 text-red-700",
  };

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    setLocation("/login");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">

        {/* User menu */}
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 h-9 px-3 rounded-xl hover:bg-secondary/60" data-testid="button-user-menu">
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
            <DropdownMenuContent align="start" className="w-52" dir={dir}>
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

        {/* Nav Links */}
        <nav className="flex items-center gap-1">
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

          {user?.role !== "admin" && (
            <Link
              href="/"
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                location === "/" || location.startsWith("/create")
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
              data-testid="link-dashboard"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">{t("navDashboard")}</span>
            </Link>
          )}
          {user?.role === "admin" && (
            <Link
              href="/users"
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                location === "/users"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
              data-testid="link-users"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">{t("navUsers")}</span>
            </Link>
          )}
        </nav>

        {/* Right spacer */}
        <div />
      </div>
    </header>
  );
}
