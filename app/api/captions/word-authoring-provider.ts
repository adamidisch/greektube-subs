import { createHmac } from "node:crypto";
import { WORD_AUTHORING_MODEL } from "./word-authoring.ts";

export class WordAuthoringProviderError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number;
  constructor(status: number, retryAfterSeconds: number) {
    super(`Subtitle provider failed (${status})`);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Same configured Groq account/model as the existing semantic service. Exactly one HTTP attempt. */
export type SubtitleModel = "deepseek-flash" | "deepseek-v4-pro";
export const FOUNDATION_AI_URL = "https://platform-foundation-delta.vercel.app/api/ai-search";

/**
 * Platform Foundation (shared SearchAI) subtitle mode: DeepSeek, signed with GreekTube's own
 * HMAC binding. GreekTube holds no DeepSeek key. Exactly one HTTP attempt, no fallback.
 */
export async function foundationSubtitleJson(system: string, input: unknown,
  options: { secret?: string; url?: string; fetcher?: typeof fetch; maxTokens?: 900 | 1600 | 4000 | 6000; model?: SubtitleModel } = {}): Promise<unknown> {
  const secret = options.secret ?? process.env.FOUNDATION_SEARCHAI_HMAC_SECRET;
  if (!secret || secret.length < 32) throw new WordAuthoringProviderError(503, 30);
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ v: 1, issued_at: now, expires_at: now + 90, app: { id: "greektube" },
    request: { mode: "subtitle", system, context: input, user_id: "greektube-admin", max_tokens: options.maxTokens ?? 4000,
      ...(options.model ? { model: options.model } : {}) } })).toString("base64");
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 58_000);
  try {
    const response = await (options.fetcher ?? fetch)(options.url ?? process.env.FOUNDATION_SEARCHAI_URL ?? FOUNDATION_AI_URL, {
      method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, signature }) });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; answer?: unknown };
    if (!response.ok || payload.ok !== true || typeof payload.answer !== "string") {
      const raw = response.headers.get("retry-after");
      throw new WordAuthoringProviderError(response.ok ? 502 : response.status, raw && /^\d+$/u.test(raw) ? Math.max(20, Number(raw)) : 30);
    }
    return JSON.parse(payload.answer);
  } catch (error) {
    if (error instanceof WordAuthoringProviderError) throw error;
    throw new WordAuthoringProviderError(502, 30);
  } finally { clearTimeout(timeout); }
}

export async function wordAuthoringJson(system: string, input: unknown,
  options: { apiKey?: string; fetcher?: typeof fetch; maxTokens?: number } = {}): Promise<unknown> {
  const apiKey = options.apiKey ?? process.env.GROQ_API_KEY;
  if (!apiKey) throw new WordAuthoringProviderError(503, 30);
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 50_000);
  try {
    const response = await (options.fetcher ?? fetch)("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: WORD_AUTHORING_MODEL, temperature: 0, max_tokens: options.maxTokens === 900 || options.maxTokens === 1600 ? options.maxTokens : 4000,
        reasoning_format: "hidden", reasoning_effort: "low", response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(input) }] }),
    });
    if (!response.ok) {
      const raw = response.headers.get("retry-after");
      const seconds = raw && /^\d+$/u.test(raw) ? Number(raw) : raw ? (Date.parse(raw) - Date.now()) / 1000 : 30;
      throw new WordAuthoringProviderError(response.status, Math.max(20, Math.min(86_400, Math.ceil(Number.isFinite(seconds) ? seconds : 30))));
    }
    const payload = await response.json() as { choices?: { finish_reason?: string; message?: { content?: string } }[] };
    const choice = payload.choices?.[0];
    if (choice?.finish_reason !== "stop" || typeof choice.message?.content !== "string") throw new WordAuthoringProviderError(502, 30);
    return JSON.parse(choice.message.content);
  } catch (error) {
    if (error instanceof WordAuthoringProviderError) throw error;
    throw new WordAuthoringProviderError(502, 30);
  } finally { clearTimeout(timeout); }
}
