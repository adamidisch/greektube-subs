import { GET as runReviewAction } from "../review-zc8-v6/route";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const target = new URL("/api/review-zc8-v6", incoming.origin);
  target.searchParams.set("action", "step");
  return runReviewAction(new Request(target.toString(), {
    method: "GET",
    headers: request.headers,
  }));
}
