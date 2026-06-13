import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: string;
  displayNameAr: string;
  displayNameEn: string;
  preferredLanguage: string;
  forcePasswordChange: boolean;
  permissions: string[];
  features: Record<string, boolean>;
}

export function useAuth() {
  return useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to fetch auth");
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
}

/** Permission / feature-flag helpers — all menu and button visibility flows
 *  through these so Super Admin toggles apply on next fetch. */
export function can(user: AuthUser | null | undefined, ...keys: string[]): boolean {
  if (!user) return false;
  return keys.some((k) => user.permissions.includes(k));
}

export function featureOn(user: AuthUser | null | undefined, key: string): boolean {
  if (!user) return false;
  return user.features[key] !== false;
}

export function useLogin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (creds: { username: string; password: string }) =>
      apiRequest<AuthUser>("POST", "/api/auth/login", creds),
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/me"], user);
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout"),
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
      window.location.href = "/login";
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      apiRequest("POST", "/api/auth/change-password", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });
}

export function useSetLanguage() {
  return useMutation({
    mutationFn: (language: "ar" | "en") => apiRequest("PATCH", "/api/auth/language", { language }),
  });
}
