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
export async function wordAuthoringJson(system: string, input: unknown,
  options: { apiKey?: string; fetcher?: typeof fetch } = {}): Promise<unknown> {
  const apiKey = options.apiKey ?? process.env.GROQ_API_KEY;
  if (!apiKey) throw new WordAuthoringProviderError(503, 30);
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 50_000);
  try {
    const response = await (options.fetcher ?? fetch)("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: WORD_AUTHORING_MODEL, temperature: 0, max_tokens: 4000,
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
