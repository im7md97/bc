// Anas — floating chat button + panel. Rendered globally by App.tsx so it
// appears on every page. Talks to /api/anas/*. Uses react-markdown for
// reply rendering; taps a light-weight loading indicator during turns.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Sparkles, Send, X, RotateCcw, MessageCircle } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";

interface AnasMessage {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}
interface StatusResp { ready: boolean }

export function AnasWidget() {
  const { data: me } = useAuth();
  const { lang } = useLanguage();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: status } = useQuery<StatusResp>({
    queryKey: ["anas.status"],
    queryFn: () => apiRequest("GET", "/api/anas/status"),
    enabled: !!me && open,
  });

  const { data: history = [], refetch } = useQuery<AnasMessage[]>({
    queryKey: ["anas.history"],
    queryFn: () => apiRequest("GET", "/api/anas/history"),
    enabled: !!me && open,
  });

  const chat = useMutation({
    mutationFn: (message: string) =>
      apiRequest<{ content: string; toolCalls: any[] }>("POST", "/api/anas/chat", { message, lang }),
    onSuccess: () => { refetch(); setDraft(""); },
  });
  const chatError: string | null = chat.isError
    ? (lang === "ar"
        ? (((chat.error as any)?.detail?.code === "not_configured")
            ? "أنس غير مفعّل — يحتاج المشرف إلى ضبط OPENAI_API_KEY في السيرفر."
            : `تعذّر الرد: ${(chat.error as any)?.messageAr ?? (chat.error as any)?.message ?? "خطأ غير متوقع"}`)
        : (((chat.error as any)?.detail?.code === "not_configured")
            ? "Anas is not enabled — an admin must set OPENAI_API_KEY on the server."
            : `Reply failed: ${(chat.error as any)?.messageEn ?? (chat.error as any)?.message ?? "unexpected error"}`))
    : null;
  const reset = useMutation({
    mutationFn: () => apiRequest("POST", "/api/anas/reset"),
    onSuccess: () => { qc.setQueryData(["anas.history"], []); },
  });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history.length, chat.isPending]);

  // Hooks must run on every render — keep useMemo above the early return.
  const suggestions = useMemo(() => lang === "ar" ? [
    "لخّص تقييمات الجودة هذا الشهر",
    "من أعلى 5 موظفين هذا الشهر؟",
    "وين ألاقي بطاقات الأداء؟",
    "شفت اليوم؟",
  ] : [
    "Summarize this month's QC evaluations",
    "Top 5 agents this month?",
    "Where do I find scorecards?",
    "Today's shift?",
  ], [lang]);

  if (!me) return null;

  const submit = () => {
    const m = draft.trim();
    if (!m || chat.isPending) return;
    chat.mutate(m);
  };

  return (
    <>
      {/* Floating trigger */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 end-6 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-primary to-blue-700 text-white shadow-xl grid place-items-center hover:scale-105 transition"
          aria-label="Anas"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 end-6 z-50 w-[380px] max-w-[95vw] h-[560px] max-h-[85vh] bg-card border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-3 bg-gradient-to-br from-primary to-blue-700 text-white flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-white/20 grid place-items-center">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">
                {lang === "ar" ? "أنس — مساعدك الذكي" : "Anas — your AI assistant"}
              </div>
              <div className="text-[10px] opacity-80">
                {lang === "ar" ? "يعمل بذكاء اصطناعي" : "AI-powered"}
              </div>
            </div>
            <button onClick={() => reset.mutate()} title={lang === "ar" ? "محادثة جديدة" : "New chat"}
              className="p-1.5 rounded-md hover:bg-white/20"><RotateCcw className="h-4 w-4" /></button>
            <button onClick={() => setOpen(false)} title={lang === "ar" ? "إغلاق" : "Close"}
              className="p-1.5 rounded-md hover:bg-white/20"><X className="h-4 w-4" /></button>
          </div>

          {/* Body */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-muted/20">
            {status && !status.ready && (
              <div className="text-xs text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
                {lang === "ar"
                  ? "أنس غير مفعّل — يحتاج المشرف إلى ضبط OPENAI_API_KEY في إعدادات السيرفر."
                  : "Anas is not enabled — an admin needs to set OPENAI_API_KEY on the server."}
              </div>
            )}

            {history.length === 0 && (
              <div className="space-y-3 pt-4">
                <div className="text-center">
                  <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/10 text-primary grid place-items-center mb-2">
                    <MessageCircle className="h-6 w-6" />
                  </div>
                  <div className="text-sm font-medium">
                    {lang === "ar" ? "أهلاً! أنا أنس." : "Hi! I'm Anas."}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {lang === "ar"
                      ? "اسألني عن أي شيء داخل البورتل"
                      : "Ask me anything about the portal"}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {suggestions.map((s, i) => (
                    <button key={i}
                      onClick={() => { setDraft(s); }}
                      className="w-full text-start text-xs p-2.5 rounded-md border bg-card hover:bg-accent transition">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {history.map((m, i) => <Bubble key={i} m={m} />)}
            {chat.isPending && <TypingBubble />}
            {chatError && (
              <div className="text-xs text-center text-red-700 bg-red-50 border border-red-200 rounded-md p-2.5">
                {chatError}
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={(e) => { e.preventDefault(); submit(); }}
            className="p-2 border-t bg-card flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={lang === "ar" ? "اكتب سؤالك…" : "Type your question…"}
              disabled={chat.isPending || (status && !status.ready)}
              className="flex-1 h-10 px-3 rounded-md border bg-background text-sm outline-none focus:border-primary"
            />
            <button type="submit" disabled={chat.isPending || !draft.trim()}
              className="h-10 w-10 rounded-md bg-primary text-primary-foreground grid place-items-center disabled:opacity-40">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

// ─── message rendering ────────────────────────────────────────────────
// Auto-link any "/path" the model outputs so a click routes inside the portal.
function Bubble({ m }: { m: AnasMessage }) {
  const isUser = m.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
        isUser ? "bg-primary text-primary-foreground rounded-br-sm"
               : "bg-card border rounded-bl-sm"
      }`}>
        {isUser ? (
          <div className="whitespace-pre-wrap">{m.content}</div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none [&>*]:my-1">
            <ReactMarkdown
              components={{
                a: ({ href, children }) => href?.startsWith("/")
                  ? <Link href={href} className="text-primary underline">{children}</Link>
                  : <a href={href} className="text-primary underline" target="_blank" rel="noreferrer">{children}</a>,
                code: ({ children }) => <code className="px-1 py-0.5 rounded bg-muted text-xs">{children}</code>,
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
  // turn bare "/path" occurrences into markdown links so ReactMarkdown wraps them
  return text.replace(/(^|[\s(])\/([a-z0-9\-/]+)/gi, (_, pre, path) => `${pre}[/${path}](/${path})`);
}
function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="bg-card border rounded-2xl rounded-bl-sm px-3 py-2 flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse [animation-delay:300ms]" />
      </div>
    </div>
  );
}
