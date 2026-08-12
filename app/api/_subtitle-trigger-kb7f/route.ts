import { POST as runCaptions } from "../captions/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const source = new URL(request.url);
  const internalRequest = new Request(`${source.origin}/api/captions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://www.youtube.com/watch?v=KkBy__7d9Fs",
      force: true,
      translationMode: "google",
    }),
  });
  return runCaptions(internalRequest);
}
