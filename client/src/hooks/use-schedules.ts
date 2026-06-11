import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { WeeklyShifts } from "@shared/schema";

export interface Schedule {
  id: number;
  agentId: number;
  weekStart: string;
  shiftsJson: string;
  createdByUserId: number | null;
  createdAt: string;
  updatedAt: string;
}

export function useSchedules() {
  return useQuery<Schedule[]>({
    queryKey: ["/api/schedules"],
    queryFn: async () => {
      const res = await fetch("/api/schedules", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch schedules");
      return res.json();
    },
  });
}

export function useAgentSchedules(agentId: number | null) {
  return useQuery<Schedule[]>({
    queryKey: ["/api/schedules/agent", agentId],
    queryFn: async () => {
      if (!agentId) return [];
      const res = await fetch(`/api/schedules/agent/${agentId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch agent schedules");
      return res.json();
    },
    enabled: !!agentId,
  });
}

export function useSaveSchedule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: { agentId: number; weekStart: string; shiftsJson: WeeklyShifts }) => {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, shiftsJson: JSON.stringify(data.shiftsJson) }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to save schedule" }));
        throw new Error(err.message);
      }
      return res.json() as Promise<Schedule>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      toast({ title: "تم الحفظ", description: "تم حفظ الجدول بنجاح." });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/schedules/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to delete schedule" }));
        throw new Error(err.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      toast({ title: "تم الحذف", description: "تم حذف الجدول." });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });
}
