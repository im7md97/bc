import { useQuery, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { apiRequest, type ApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

/** Standard data fetch — credentials/cookies + 401 redirect handled in apiRequest. */
export function useApi<T>(path: string, opts?: { enabled?: boolean; queryKey?: QueryKey }) {
  return useQuery<T>({
    queryKey: opts?.queryKey ?? [path],
    queryFn: () => apiRequest<T>("GET", path),
    enabled: opts?.enabled,
  });
}

/** Mutation wrapper that toasts errors and optionally invalidates queries on success. */
export function useApiMutation<TInput, TOutput = unknown>(
  fn: (input: TInput) => Promise<TOutput>,
  opts?: {
    invalidate?: QueryKey[];
    onSuccess?: (data: TOutput, input: TInput) => void;
    successMessage?: string;
  },
) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation<TOutput, ApiError, TInput>({
    mutationFn: fn,
    onSuccess: (data, input) => {
      opts?.invalidate?.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      if (opts?.successMessage) toast({ title: opts.successMessage });
      opts?.onSuccess?.(data, input);
    },
    onError: (error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });
}
