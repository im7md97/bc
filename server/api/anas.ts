// Anas endpoints. Session-scoped in-memory history keeps recent turns for
// the agent's context; persist to DB later if you need cross-device continuity.

import type { Express } from "express";
import { requireAuth } from "../permissions";
import { errInternal, sendError } from "../http-errors";
import type { SessionUser } from "../auth";
import { isConfigured, runAnas, type AnasMessage } from "../anas/orchestrator";

// per-user rolling history (keep last 20 turns / 40 messages)
const HISTORY = new Map<number, AnasMessage[]>();
const MAX_HISTORY = 40;

export function registerAnasRoutes(app: Express) {
  app.get("/api/anas/status", requireAuth, (_req, res) => {
    res.json({ ready: isConfigured() });
  });

  app.get("/api/anas/history", requireAuth, (req, res) => {
    const me = req.user as SessionUser;
    res.json(HISTORY.get(me.id) ?? []);
  });

  app.post("/api/anas/reset", requireAuth, (req, res) => {
    const me = req.user as SessionUser;
    HISTORY.delete(me.id);
    res.json({ ok: true });
  });

  app.post("/api/anas/chat", requireAuth, async (req, res) => {
    try {
      if (!isConfigured()) {
        return sendError(res, 503, "not_configured",
          "أنس غير مُهيَّأ — أضف OPENAI_API_KEY",
          "Anas is not configured — set OPENAI_API_KEY");
      }
      const me = req.user as SessionUser;
      const message = String(req.body?.message ?? "").trim();
      const lang = req.body?.lang === "en" ? "en" : "ar";
      if (!message) return sendError(res, 400, "empty", "الرسالة فارغة", "Empty message");

      const history = HISTORY.get(me.id) ?? [];
      const reply = await runAnas(me, lang, history, message);

      const updated: AnasMessage[] = [
        ...history,
        { role: "user" as const, content: message, createdAt: new Date().toISOString() },
        { role: "assistant" as const, content: reply.content, createdAt: new Date().toISOString() },
      ].slice(-MAX_HISTORY);
      HISTORY.set(me.id, updated);

      res.json({
        content: reply.content,
        toolCalls: reply.toolCalls.map((t) => ({ name: t.name, args: t.args })),
      });
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (msg === "openai_not_configured") {
        return sendError(res, 503, "not_configured",
          "أنس غير مُهيَّأ — أضف OPENAI_API_KEY",
          "Anas is not configured — set OPENAI_API_KEY");
      }
      console.error("[anas.chat]", err);
      // Surface the OpenAI failure to the UI so the user can act (invalid key,
      // out-of-credits, rate limit, etc.) — Anas is dev-only, safe to reveal.
      const detail = err?.error?.message ?? err?.response?.data?.error?.message ?? msg;
      return sendError(res, 500, "anas_failed",
        `فشل استدعاء الذكاء: ${detail}`, `AI call failed: ${detail}`);
    }
  });
}
