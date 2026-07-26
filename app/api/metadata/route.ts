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
    return NextResponse.json({
      id,
      title: metadata.title || "YouTube video",
      channel: metadata.author_name || "YouTube",
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    });
  } catch {
    return NextResponse.json({ error: "Δεν μπόρεσα να διαβάσω τα στοιχεία του video." }, { status: 502 });
  }
}
