// Central fetch wrapper: credentials, JSON, the standard error shape (§13)
// and 401 → /login redirect.

export interface ApiError extends Error {
  code?: string;
  messageAr?: string;
  messageEn?: string;
  status?: number;
}

function currentLang(): "ar" | "en" {
  const stored = localStorage.getItem("lang");
  return stored === "en" ? "en" : "ar";
}

export async function parseError(res: Response): Promise<ApiError> {
  let payload: any = null;
  try { payload = await res.json(); } catch { /* not json */ }
  const err = payload?.error;
  const lang = currentLang();
  const message = err
    ? (lang === "ar" ? err.message_ar : err.message_en) || err.message_en || err.code
    : payload?.message || res.statusText;
  const e = new Error(message || `HTTP ${res.status}`) as ApiError;
  e.code = err?.code;
  e.messageAr = err?.message_ar;
  e.messageEn = err?.message_en;
  e.status = res.status;
  return e;
}

export async function apiRequest<T = unknown>(
  method: string,
  url: string,
  body?: unknown,
  opts?: { formData?: FormData },
): Promise<T> {
  const init: RequestInit = { method, credentials: "include" };
  if (opts?.formData) {
    init.body = opts.formData;
  } else if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  if (res.status === 401 && !url.includes("/api/auth/")) {
    window.location.href = "/login";
    throw new Error("unauthenticated");
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Triggers a browser download for export endpoints. */
export async function downloadFile(url: string, fallbackName: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw await parseError(res);
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const match = cd.match(/filename="?([^";]+)"?/);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
