// Anas — OpenAI orchestrator.
//
// Runs a bounded tool-call loop: ask model → if it wants a tool, execute it →
// feed the result back → repeat until it produces a plain text reply or we hit
// the safety cap. Every tool call runs with the caller's permissions so the
// agent physically cannot leak data outside their scope.

import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { buildContext, findTool, toolsForOpenAI, type ToolContext } from "./tools";
import type { SessionUser } from "../auth";

// Provider config — supports OpenAI or any OpenAI-compatible endpoint
// (OpenRouter, Together, Groq, local vLLM, …).
//
//   OPENAI_BASE_URL   → e.g. https://openrouter.ai/api/v1  (leave blank for OpenAI direct)
//   OPENAI_API_KEY    → provider key
//   OPENAI_MODEL      → model id in that provider's format
//                       (e.g. "openai/gpt-4o-mini" on OpenRouter)
const BASE_URL = process.env.OPENAI_BASE_URL || undefined;
const MODEL = process.env.OPENAI_MODEL ?? "openai/gpt-4o-mini";
const MAX_ITERATIONS = 6;

let clientCache: OpenAI | null = null;
function getClient(): OpenAI {
  if (clientCache) return clientCache;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("openai_not_configured");

  // OpenRouter recommends identifying your app via these headers.
  const defaultHeaders: Record<string, string> = {};
  if (BASE_URL?.includes("openrouter.ai")) {
    if (process.env.PUBLIC_URL) defaultHeaders["HTTP-Referer"] = process.env.PUBLIC_URL;
    defaultHeaders["X-Title"] = "BC Portal — Anas";
  }

  clientCache = new OpenAI({
    apiKey,
    baseURL: BASE_URL,
    defaultHeaders: Object.keys(defaultHeaders).length ? defaultHeaders : undefined,
  });
  return clientCache;
}

const SYSTEM_PROMPT_AR = `أنت "أنس" — مساعد ذكي داخل بوابة BC للجودة والأداء.

مهمتك:
- تساعد المستخدم على استخدام البورتل والوصول للصفحات
- تجيب على أسئلته عن بيانات الجودة، APR، بطاقات الأداء، الجداول، والحضور
- ترشده للخدمات والوحدات المتاحة داخل النظام

مبادئ:
- استخدم الأدوات (functions) دائماً لجلب بيانات حقيقية — لا تخترع أرقاماً أبداً
- ردودك موجزة ومباشرة، بالعربية الفصحى المبسّطة
- إذا لم تجد البيانات، قل ذلك بوضوح واقترح خطوة تالية
- عندما تعطي رابطاً داخل البورتل، اذكره كنص مثل: "افتح: /qc/dashboard"
- لا تفصح عن معلومات لم تسترجعها من الأدوات
- إذا سُئلت عن شخص خارج صلاحية المستخدم، اعتذر بلطف`;

const SYSTEM_PROMPT_EN = `You are "Anas" — an assistant inside the BC Quality & Performance portal.

Your role:
- Help the user navigate the portal and reach the right pages
- Answer questions about quality, APR, scorecards, schedules, and attendance data
- Guide users to available services and modules

Principles:
- Always call tools (functions) to fetch real data — never invent numbers
- Keep answers concise and direct
- If data isn't found, say so plainly and suggest a next step
- When you provide an in-portal path, write it clearly like "Open: /qc/dashboard"
- Never reveal information you didn't retrieve via a tool
- If asked about someone outside the user's scope, politely decline`;

export interface AnasMessage {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

export interface AnasReply {
  content: string;
  toolCalls: { name: string; args: any; result: any }[];
  usage?: any;
}

/** Run one turn of the agent for `user` given the running history. */
export async function runAnas(
  user: SessionUser,
  lang: "ar" | "en",
  history: AnasMessage[],
  newUserMessage: string,
): Promise<AnasReply> {
  const client = getClient();
  const ctx = await buildContext(user, lang);
  const tools = toolsForOpenAI();
  const toolCalls: AnasReply["toolCalls"] = [];

  const systemMessage: ChatCompletionMessageParam = {
    role: "system",
    content: (lang === "ar" ? SYSTEM_PROMPT_AR : SYSTEM_PROMPT_EN) +
      `\n\nالمستخدم الحالي: ${user.username} (الدور: ${user.role}). ` +
      `عدد الموظفين ضمن نطاقه: ${ctx.scopedAgentIds.length}.`,
  };

  const messages: ChatCompletionMessageParam[] = [
    systemMessage,
    ...history.map((m) => ({ role: m.role, content: m.content } as ChatCompletionMessageParam)),
    { role: "user", content: newUserMessage },
  ];

  let lastUsage: any = undefined;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.3,
    });
    lastUsage = res.usage;
    const choice = res.choices[0];
    const msg = choice.message;

    // No tool calls → we have a final answer.
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return {
        content: msg.content ?? "",
        toolCalls,
        usage: lastUsage,
      };
    }

    // Push the assistant tool-call message, then each tool result.
    messages.push({
      role: "assistant",
      content: msg.content ?? "",
      tool_calls: msg.tool_calls,
    } as any);

    for (const call of msg.tool_calls) {
      if (call.type !== "function") continue;
      const name = call.function.name;
      let args: any = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch {}

      const tool = findTool(name);
      let result: any;
      if (!tool) {
        result = { error: `unknown_tool:${name}` };
      } else {
        try {
          result = await tool.execute(ctx, args);
        } catch (err: any) {
          result = { error: String(err?.message ?? err) };
        }
      }
      toolCalls.push({ name, args, result });

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 8000), // cap payload
      } as any);
    }
  }

  return {
    content: lang === "ar"
      ? "توقفت بعد عدة محاولات — أعد صياغة السؤال بشكل أبسط من فضلك."
      : "I stopped after several attempts — please rephrase your question more simply.",
    toolCalls,
    usage: lastUsage,
  };
}

export function isConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
