import { POST as captionsPOST } from "../captions/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VIDEO_URL = "https://www.youtube.com/watch?v=n1G3xqgzB2c";

export async function GET() {
  const request = new Request("https://greektubesubs.com/api/captions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: VIDEO_URL }),
  });
  return captionsPOST(request);
}
