import { POST as runCaptions } from "../captions/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const source = new URL(request.url);
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const internalRequest = new Request(`${source.origin}/api/captions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://www.youtube.com/watch?v=KkBy__7d9Fs",
        force: false,
        translationMode: "legacy",
      }),
    });

    lastResponse = await runCaptions(internalRequest);
    if (lastResponse.status !== 202) return lastResponse;
  }

  return lastResponse ?? new Response(JSON.stringify({ error: "No response" }), { status: 500 });
}
