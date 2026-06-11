import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import NotFound from "@/pages/not-found";
import Dashboard from "./pages/Dashboard";
import CreateEntry from "./pages/CreateEntry";
import UsersPage from "./pages/Users";
import ProjectsPage from "./pages/Projects";
import SchedulePage from "./pages/Schedule";
import LoginPage from "./pages/Login";
import { useAuth } from "@/hooks/use-auth";
import { LanguageProvider } from "@/contexts/LanguageContext";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { data: user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) setLocation("/login");
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/create" component={() => <ProtectedRoute component={CreateEntry} />} />
      <Route path="/users" component={() => <ProtectedRoute component={UsersPage} />} />
      <Route path="/projects" component={() => <ProtectedRoute component={ProjectsPage} />} />
      <Route path="/schedule" component={() => <ProtectedRoute component={SchedulePage} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </LanguageProvider>
  );
}

export default App;
