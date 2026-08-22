// Anas — Gemini-style side panel + pop-out full page.
//
//   • Floating trigger button (bottom-right)
//   • Click → slide-in dark panel from the side, full height
//   • Pop-out button → opens /anas as a dedicated full-page route
//   • Same underlying data (/api/anas/*) — panel and page share state via the
//     server-persisted history, so a message sent in one shows up in the other.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Sparkles, Send, X, RotateCcw, MessageCircle, PanelRightOpen } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface AnasMessage {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}
interface StatusResp { ready: boolean }

interface Props {
  /** When true, the panel fills its parent container (used for /anas full-page). */
  fullPage?: boolean;
  /** Override the open state — for full-page usage. */
  forceOpen?: boolean;
}

export function AnasWidget(props: Props = {}) {
  const { data: me } = useAuth();
  const { lang } = useLanguage();
  const qc = useQueryClient();
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const isFullPage = !!props.fullPage;
  const panelOpen = isFullPage || open;

  const { data: status } = useQuery<StatusResp>({
    queryKey: ["anas.status"],
    queryFn: () => apiRequest("GET", "/api/anas/status"),
    enabled: !!me && panelOpen,
  });

  const { data: history = [], refetch } = useQuery<AnasMessage[]>({
    queryKey: ["anas.history"],
    queryFn: () => apiRequest("GET", "/api/anas/history"),
    enabled: !!me && panelOpen,
    refetchInterval: isFullPage ? 5000 : false, // keep in sync across tabs when full-page
  });

  const chat = useMutation({
    mutationFn: (message: string) =>
      apiRequest<{ content: string; toolCalls: any[] }>("POST", "/api/anas/chat", { message, lang }),
    onSuccess: () => { refetch(); setDraft(""); },
  });
  const chatError: string | null = chat.isError
    ? (lang === "ar"
        ? (((chat.error as any)?.detail?.code === "not_configured")
            ? "أنس غير مفعّل — يحتاج المشرف إلى ضبط OPENAI_API_KEY."
            : `تعذّر الرد: ${(chat.error as any)?.messageAr ?? (chat.error as any)?.message ?? "خطأ"}`)
        : (((chat.error as any)?.detail?.code === "not_configured")
            ? "Anas isn't configured — an admin must set OPENAI_API_KEY."
            : `Reply failed: ${(chat.error as any)?.messageEn ?? (chat.error as any)?.message ?? "error"}`))
    : null;
  const reset = useMutation({
    mutationFn: () => apiRequest("POST", "/api/anas/reset"),
    onSuccess: () => { qc.setQueryData(["anas.history"], []); },
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history.length, chat.isPending]);

  // Hooks — always ran, above any conditional return.
  const suggestions = useMemo(() => lang === "ar" ? [
    { icon: Sparkles,      text: "ماذا تستطيع أن تفعل؟" },
    { icon: MessageCircle, text: "ما نوع الأسئلة التي أستطيع طرحها؟" },
    { icon: Sparkles,      text: "ساعدني على فهم بياناتي" },
  ] : [
    { icon: Sparkles,      text: "What can you do?" },
    { icon: MessageCircle, text: "What kinds of questions can I ask?" },
    { icon: Sparkles,      text: "Help me think through a problem" },
  ], [lang]);

  if (!me) return null;
  // Hide the floating widget on the dedicated full-page route.
  if (!isFullPage && location.startsWith("/anas")) return null;

  const submit = () => {
    const m = draft.trim();
    if (!m || chat.isPending) return;
    chat.mutate(m);
  };

  const displayName = lang === "ar"
    ? (me.displayNameAr ?? me.username)
    : (me.displayNameEn ?? me.username);

  const openFullPage = () => {
    setOpen(false);
    setLocation("/anas");
  };

  // ═══════════════════════════════════════════════════════════════════════
  // Panel body — reused for both the side-panel and the full-page layout.
  // ═══════════════════════════════════════════════════════════════════════
  const body = (
    <div className={cn(
      "flex flex-col h-full bg-slate-950 text-slate-100",
      isFullPage ? "rounded-none" : "rounded-2xl",
    )}>
      {/* Header */}
      <div className={cn(
        "flex items-center gap-1 px-3 py-2 border-b border-slate-800",
        isFullPage && "px-6 py-3",
      )}>
        <div className="w-8 h-8 rounded-full bg-slate-800 grid place-items-center">
          <span className="text-xs font-bold">
            {(displayName || "?").charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="flex-1" />
        <button onClick={() => reset.mutate()}
          title={lang === "ar" ? "محادثة جديدة" : "New chat"}
          className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400">
          <RotateCcw className="w-4 h-4" />
        </button>
        {!isFullPage && (
          <button onClick={openFullPage}
            title={lang === "ar" ? "فتح في تبويب جديد" : "Open in new tab"}
            className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400">
            <PanelRightOpen className="w-4 h-4" />
          </button>
        )}
        {!isFullPage && (
          <button onClick={() => setOpen(false)}
            title={lang === "ar" ? "إغلاق" : "Close"}
            className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Body */}
      <div ref={scrollRef} className={cn(
        "flex-1 overflow-y-auto",
        isFullPage ? "px-6 py-6 max-w-3xl w-full mx-auto" : "px-4 py-4",
      )}>
        {status && !status.ready && (
          <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/40 rounded-lg p-3 mb-3">
            {lang === "ar"
              ? "أنس غير مفعّل — يحتاج المشرف إلى ضبط OPENAI_API_KEY."
              : "Anas isn't configured — an admin must set OPENAI_API_KEY on the server."}
          </div>
        )}

        {history.length === 0 ? (
          <div className={cn("space-y-4", isFullPage && "pt-16")}>
            <div className={cn("space-y-1", isFullPage ? "text-center" : "")}>
              <h1 className={cn(
                "font-medium bg-gradient-to-r from-sky-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent",
                isFullPage ? "text-4xl md:text-5xl" : "text-2xl",
              )}>
                {lang === "ar" ? `مرحباً، ${displayName}` : `Hello, ${displayName}`}
              </h1>
              <h2 className={cn(
                "text-slate-400 font-medium",
                isFullPage ? "text-3xl md:text-4xl" : "text-xl",
              )}>
                {lang === "ar" ? "كيف أستطيع مساعدتك اليوم؟" : "How can I help you today?"}
              </h2>
            </div>

            <div className={cn(
              "space-y-2",
              isFullPage && "max-w-lg mx-auto pt-4",
            )}>
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => setDraft(s.text)}
                  className="w-full text-start flex items-center gap-3 px-4 py-3 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-800 transition">
                  <s.icon className="w-4 h-4 text-sky-400 shrink-0" />
                  <span className="text-sm text-slate-200">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((m, i) => <Bubble key={i} m={m} isFullPage={isFullPage} />)}
            {chat.isPending && <TypingBubble />}
            {chatError && (
              <div className="text-xs text-red-300 bg-red-950/40 border border-red-800/40 rounded-lg p-2.5">
                {chatError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className={cn(
        "border-t border-slate-800 bg-slate-900",
        isFullPage ? "px-6 py-4" : "px-3 py-3",
      )}>
        <div className={cn(isFullPage && "max-w-3xl mx-auto")}>
          <form onSubmit={(e) => { e.preventDefault(); submit(); }}
            className="flex items-end gap-2">
            <div className="flex-1 rounded-2xl border border-slate-700 bg-slate-950 focus-within:border-sky-500 transition">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
                }}
                placeholder={lang === "ar" ? "اكتب سؤالك… (Enter لإرسال)" : "Type your question… (Enter to send)"}
                disabled={chat.isPending || (status && !status.ready)}
                rows={1}
                className="w-full bg-transparent px-4 py-3 text-sm outline-none resize-none max-h-32 placeholder:text-slate-500"
              />
            </div>
            <button type="submit" disabled={chat.isPending || !draft.trim()}
              className="w-10 h-10 rounded-full bg-sky-500 text-white grid place-items-center disabled:opacity-30 hover:bg-sky-400 transition shrink-0">
              <Send className="w-4 h-4" />
            </button>
          </form>
          {isFullPage && (
            <div className="text-[10px] text-slate-500 mt-2 text-center">
              {lang === "ar" ? "أنس مساعد ذكي — قد يخطئ" : "Anas is AI — may make mistakes"}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // If we're on /anas as a route, body fills the parent — no chrome around it.
  if (isFullPage) return body;

  return (
    <>
      {/* Floating trigger */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 end-6 z-40 h-14 w-14 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-2xl grid place-items-center hover:scale-105 transition"
          aria-label="Anas"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => setOpen(false)} />
      )}

      {/* Slide-in side panel */}
      <div className={cn(
        "fixed top-0 end-0 h-screen z-50 w-[440px] max-w-[95vw]",
        "transition-transform duration-300 ease-out",
        open ? "translate-x-0" : "translate-x-full rtl:-translate-x-full",
      )}>
        <div className="h-full py-3 pe-3">
          <div className="h-full shadow-2xl border border-slate-800 rounded-2xl overflow-hidden">
            {body}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── message rendering ────────────────────────────────────────────────
function Bubble({ m, isFullPage }: { m: AnasMessage; isFullPage: boolean }) {
  const isUser = m.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
        isUser
          ? "bg-sky-500 text-white rounded-br-sm rtl:rounded-br-2xl rtl:rounded-bl-sm"
          : "bg-slate-800 text-slate-100 rounded-bl-sm rtl:rounded-bl-2xl rtl:rounded-br-sm",
        isFullPage && "text-base",
      )}>
        {isUser ? (
          <div className="whitespace-pre-wrap">{m.content}</div>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none [&>*]:my-1">
            <ReactMarkdown
              components={{
                a: ({ href, children }) => href?.startsWith("/")
                  ? <Link href={href} className="text-sky-300 underline">{children}</Link>
                  : <a href={href} className="text-sky-300 underline" target="_blank" rel="noreferrer">{children}</a>,
                code: ({ children }) => <code className="px-1 py-0.5 rounded bg-slate-950 text-xs">{children}</code>,
              }}
            >
              {linkifyPaths(m.content)}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
function linkifyPaths(text: string): string {
  return text.replace(/(^|[\s(])\/([a-z0-9\-/]+)/gi, (_, pre, path) => `${pre}[/${path}](/${path})`);
}
function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="bg-slate-800 rounded-2xl rounded-bl-sm rtl:rounded-bl-2xl rtl:rounded-br-sm px-3 py-2.5 flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse [animation-delay:300ms]" />
      </div>
    </div>
  );
}
