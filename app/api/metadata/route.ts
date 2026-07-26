import { NextResponse } from "next/server";

function extractVideoId(value: string) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return parsed.pathname.split("/")[1] || null;
    if (host.endsWith("youtube.com")) {
      if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live"].includes(parts[0])) return parts[1] || null;
    }
  } catch {
    return null;
  }
  return null;
}

function isGreek(value: string) {
  const letters = value.match(/\p{L}/gu)?.length || 0;
  const greek = value.match(/[\u0370-\u03ff\u1f00-\u1fff]/g)?.length || 0;
  return letters > 0 && greek / letters > 0.22;
}

async function greekTitle(value: string) {
  if (!value || isGreek(value)) return value;
  try {
    const body = new URLSearchParams({ client: "gtx", sl: "auto", tl: "el", dt: "t", q: value });
    const response = await fetch("https://translate.googleapis.com/translate_a/single", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
    });
    if (!response.ok) return value;
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) return value;
    return (payload[0] as unknown[])
      .map((part) => Array.isArray(part) && typeof part[0] === "string" ? part[0] : "")
      .join("")
      .trim() || value;
  } catch {
    return value;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== "string") throw new Error();
    const id = extractVideoId(body.url);
    if (!id) return NextResponse.json({ error: "Μη έγκυρο YouTube link." }, { status: 400 });
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
    );
    if (!response.ok) throw new Error();
    const metadata = (await response.json()) as { title?: string; author_name?: string };
    const originalTitle = metadata.title || "YouTube video";
    const title = await greekTitle(originalTitle);
    return NextResponse.json({
      id,
      title,
      originalTitle,
      channel: metadata.author_name || "YouTube",
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    });
  } catch {
    return NextResponse.json({ error: "Δεν μπόρεσα να διαβάσω τα στοιχεία του video." }, { status: 502 });
  }
}
