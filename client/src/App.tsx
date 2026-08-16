import { Switch, Route, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import HomePage from "./pages/Home";
import LoginPage from "./pages/Login";
import ChangePasswordPage from "./pages/ChangePassword";
import ProfilePage from "./pages/Profile";
import UsersPage from "./pages/Users";
import ProjectsPage from "./pages/Projects";
import AgentsPage from "./pages/Agents";
import AprPage from "./pages/Apr";
import AprUploadPage from "./pages/AprUpload";
import ScoreCardsPage from "./pages/ScoreCards";
import ScoreCardDetailPage from "./pages/ScoreCardDetail";
import GridConfigPage from "./pages/GridConfig";
import SuperAdminPage from "./pages/SuperAdmin";
import SchedulePage from "./pages/Schedule";
import QcDashboardPage from "./pages/QcDashboard";
import QcNewEntryPage from "./pages/QcNewEntry";
import CoachingPage from "./pages/Coaching";
import { useAuth, can, featureOn } from "@/hooks/use-auth";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AnasWidget } from "@/components/anas/AnasWidget";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const res = await fetch(queryKey.join("/") as string, { credentials: "include" });
        if (!res.ok) { const t = (await res.text()) || res.statusText; throw new Error(`${res.status}: ${t}`); }
        return res.json();
      },
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: false,
    },
    mutations: { retry: false },
  },
});

function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold">404</h1>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Guard({
  component: Component,
  need,
  feature,
}: {
  component: React.ComponentType;
  need?: string[];
  feature?: string;
}) {
  const { data: user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!user) { setLocation("/login"); return; }
    if (user.forcePasswordChange && location !== "/change-password") {
      setLocation("/change-password");
      return;
    }
    const permitted = !need || can(user, ...need);
    const featured = !feature || featureOn(user, feature);
    // Disabled feature or missing permission → behave like the page is gone (§11.3).
    if (!permitted || !featured) setLocation("/");
  }, [user, isLoading, location]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return null;
  if (user.forcePasswordChange && location !== "/change-password") return null;
  if (need && !can(user, ...need)) return null;
  if (feature && !featureOn(user, feature)) return null;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/change-password" component={() => <Guard component={ChangePasswordPage} />} />
      <Route path="/profile" component={() => <Guard component={ProfilePage} />} />
      <Route path="/" component={() => <Guard component={HomePage} />} />

      <Route path="/users" component={() => <Guard component={UsersPage} need={["user.list_all"]} feature="menu.users" />} />
      <Route path="/projects" component={() => <Guard component={ProjectsPage} need={["project.create", "project.edit", "project.edit_own"]} feature="menu.projects" />} />
      <Route path="/agents" component={() => <Guard component={AgentsPage} need={["agent.list_all", "agent.list_project", "agent.list_team"]} />} />

      <Route path="/apr/upload" component={() => <Guard component={AprUploadPage} need={["apr.upload"]} feature="menu.apr" />} />
      <Route path="/apr" component={() => <Guard component={AprPage} need={["apr.view_all", "apr.view_project", "apr.view_team", "apr.view_own"]} feature="menu.apr" />} />

      <Route path="/scorecards/grid" component={() => <Guard component={GridConfigPage} need={["scorecard.grid_edit"]} feature="menu.scorecards" />} />
      <Route path="/scorecards/:id" component={() => <Guard component={ScoreCardDetailPage} need={["scorecard.view_all", "scorecard.view_project", "scorecard.view_team", "scorecard.view_own"]} feature="menu.scorecards" />} />
      <Route path="/scorecards" component={() => <Guard component={ScoreCardsPage} need={["scorecard.view_all", "scorecard.view_project", "scorecard.view_team", "scorecard.view_own"]} feature="menu.scorecards" />} />

      <Route path="/schedule" component={() => <Guard component={SchedulePage} need={["schedule.manage", "schedule.view_team", "schedule.view_project", "schedule.view_own"]} feature="menu.schedule" />} />

      <Route path="/qc/new-entry" component={() => <Guard component={QcNewEntryPage} need={["qc.evaluate"]} feature="menu.qc" />} />
      <Route path="/qc/dashboard" component={() => <Guard component={QcDashboardPage} need={["qc.evaluate", "qc.approve", "qc.approve_team", "qc.view_own"]} feature="menu.qc" />} />
      <Route path="/coaching" component={() => <Guard component={CoachingPage} need={["coaching.create", "coaching.view_all", "coaching.view_project", "coaching.view_team", "coaching.view_own"]} feature="menu.coaching" />} />

      <Route path="/super-admin" component={() => <Guard component={SuperAdminPage} need={["permission.grant", "feature_flag.toggle"]} />} />

      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router />
          <Toaster />
          <AnasWidget />
        </TooltipProvider>
      </QueryClientProvider>
    </LanguageProvider>
  );
}
