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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const body = new URLSearchParams({ client: "gtx", sl: "auto", tl: "el", dt: "t", q: value });
      const response = await fetch("https://translate.googleapis.com/translate_a/single", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body,
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload) || !Array.isArray(payload[0])) continue;
      const translated = (payload[0] as unknown[])
        .map((part) => Array.isArray(part) && typeof part[0] === "string" ? part[0] : "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      if (translated && isGreek(translated)) return translated;
    } catch {
      // Retry transient translation failures.
    }
  }
  return value;
}

async function playerDetails(id: string) {
  const clients = [
    {
      clientName: "ANDROID",
      clientVersion: "20.10.38",
      androidSdkVersion: 30,
      userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 11)",
    },
    {
      clientName: "WEB",
      clientVersion: "2.20260723.00.00",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36",
    },
    {
      clientName: "IOS",
      clientVersion: "20.10.4",
      deviceModel: "iPhone16,2",
      userAgent: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3 like Mac OS X)",
    },
  ];

  for (const profile of clients) {
    try {
      const response = await fetch("https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": profile.userAgent,
          Origin: "https://www.youtube.com",
          "X-Youtube-Client-Name": profile.clientName,
          "X-Youtube-Client-Version": profile.clientVersion,
        },
        body: JSON.stringify({
          videoId: id,
          context: {
            client: {
              clientName: profile.clientName,
              clientVersion: profile.clientVersion,
              hl: "en",
              gl: "US",
              ...(profile.androidSdkVersion ? { androidSdkVersion: profile.androidSdkVersion } : {}),
              ...(profile.deviceModel ? { deviceModel: profile.deviceModel } : {}),
            },
          },
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as {
        videoDetails?: {
          title?: string;
          author?: string;
          lengthSeconds?: string;
          shortDescription?: string;
        };
      };
      if (!payload.videoDetails?.title) continue;
      return {
        title: payload.videoDetails.title,
        author: payload.videoDetails.author || "",
        duration: Number(payload.videoDetails.lengthSeconds || 0),
        description: payload.videoDetails.shortDescription || "",
      };
    } catch {
      // Continue with the next YouTube player profile.
    }
  }
  return { title: "", author: "", duration: 0, description: "" };
}

async function oEmbedDetails(id: string) {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
    );
    if (!response.ok) return { title: "", author: "" };
    const metadata = (await response.json()) as { title?: string; author_name?: string };
    return { title: metadata.title || "", author: metadata.author_name || "" };
  } catch {
    return { title: "", author: "" };
  }
}

function doctorName(title: string, description: string) {
  const source = `${title}\n${description.slice(0, 1200)}`;
  const match = source.match(/\b(?:Dr\.?|Doctor)\s+([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]+){1,3})/);
  return match ? `Dr ${match[1].replace(/[|:,\-–—]+$/g, "").trim()}` : "";
}

function categoryFor(title: string, description: string, speakerName: string) {
  const text = `${title} ${description}`.toLowerCase();
  if (speakerName || /\b(health|doctor|medical|medicine|heart|gut|digestion|nutrition|diet|food|insulin|metabolic|disease|vitamin|cancer|brain|blood)\b/.test(text)) return "Medical";
  if (/\b(ai|artificial intelligence|software|technology|tech|computer|coding|programming)\b/.test(text)) return "Tech";
  if (/\b(podcast|interview|conversation)\b/.test(text)) return "Podcasts";
  if (/\b(comedy|comedian|funny|stand-up)\b/.test(text)) return "Comedy";
  if (/\b(documentary|documentaries)\b/.test(text)) return "Documentaries";
  if (/\b(learn|lesson|education|explained|tutorial|course)\b/.test(text)) return "Education";
  return "Other";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== "string") throw new Error();
    const id = extractVideoId(body.url);
    if (!id) return NextResponse.json({ error: "Μη έγκυρο YouTube link." }, { status: 400 });
    const [details, metadata] = await Promise.all([playerDetails(id), oEmbedDetails(id)]);
    const originalTitle = metadata.title || details.title;
    if (!originalTitle) {
      return NextResponse.json({
        id,
        title: "Νέο YouTube video",
        originalTitle: "",
        channel: "YouTube",
        duration: 0,
        description: "Τα στοιχεία του video θα συμπληρωθούν κατά την προετοιμασία των υποτίτλων.",
        speakerName: "",
        category: "Other",
        tags: [],
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        metadataPending: true,
      });
    }
    const title = await greekTitle(originalTitle);
    const speakerName = doctorName(originalTitle, details.description);
    const category = categoryFor(originalTitle, details.description, speakerName);
    return NextResponse.json({
      id,
      title,
      originalTitle,
      channel: metadata.author || details.author || "YouTube",
      duration: details.duration,
      description: details.description,
      speakerName,
      category,
      tags: [category === "Medical" ? "υγεία" : category.toLowerCase(), speakerName].filter(Boolean),
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    });
  } catch {
    return NextResponse.json({ error: "Δεν μπόρεσα να διαβάσω τα στοιχεία του video." }, { status: 502 });
  }
}
