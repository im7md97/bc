import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type EntryInput, type EntryUpdateInput, type EntriesListResponse, type EntryResponse } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

function parseWithLogging<T>(schema: any, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[Zod] ${label} validation failed:`, result.error.format());
    return data as T;
  }
  return result.data;
}

export function useEntries() {
  return useQuery({
    queryKey: [api.entries.list.path],
    queryFn: async () => {
      const res = await fetch(api.entries.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch entries");
      const data = await res.json();
      return parseWithLogging<EntriesListResponse>(api.entries.list.responses[200], data, "entries.list");
    },
  });
}

export function useEntry(id: number) {
  return useQuery({
    queryKey: [api.entries.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.entries.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch entry");
      const data = await res.json();
      return parseWithLogging<EntryResponse>(api.entries.get.responses[200], data, "entries.get");
    },
    enabled: !!id,
  });
}

export function useCreateEntry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: EntryInput) => {
      const res = await fetch(api.entries.create.path, {
        method: api.entries.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to create entry" }));
        throw new Error(err.message || "Failed to create entry");
      }
      const resData = await res.json();
      return parseWithLogging<EntryResponse>(api.entries.create.responses[201], resData, "entries.create");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.entries.list.path] });
      toast({ title: "تمت الإضافة بنجاح", description: "تم إرسال التقييم للمشرف للمراجعة." });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ في الإضافة", description: error.message, variant: "destructive" });
    }
  });
}

export function useDeleteEntry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.entries.delete.path, { id });
      const res = await fetch(url, { method: api.entries.delete.method, credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to delete entry" }));
        throw new Error(err.message || "Failed to delete entry");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.entries.list.path] });
      toast({ title: "تم الحذف", description: "تم إزالة السجل من النظام." });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ في الحذف", description: error.message, variant: "destructive" });
    }
  });
}

export function useResubmitEntry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, qualityNote }: { id: number; qualityNote: string }) => {
      const res = await fetch(`/api/entries/${id}/resubmit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qualityNote }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "فشل الإرسال" }));
        throw new Error(err.message || "فشل الإرسال");
      }
      return res.json() as Promise<EntryResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.entries.list.path] });
      toast({ title: "تم إعادة الإرسال", description: "تم إرسال التقييم للمشرف مع ملاحظتك." });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  });
}

export function useReviewEntry() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, action, comment }: { id: number; action: "approved" | "rejected"; comment?: string }) => {
      const res = await fetch(`/api/entries/${id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, comment }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "فشل التحديث" }));
        throw new Error(err.message || "فشل التحديث");
      }
      return res.json() as Promise<EntryResponse>;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: [api.entries.list.path] });
      toast({
        title: vars.action === "approved" ? "تم القبول" : "تم الرفض",
        description: vars.action === "approved"
          ? "تم اعتماد التقييم وإرساله للوكيل."
          : "تم إرجاع التقييم لموظف الجودة مع التعليق.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  });
}
