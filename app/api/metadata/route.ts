import { NextResponse } from "next/server";
import { canonicalSpeakerForVideo } from "@/app/speaker-catalog";

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


type CreatorChapter = { time: number; title: string; summary: string };

function chapterSeconds(value: string) {
  const parts = value.split(":").map(part => Number(part));
  if (parts.length < 2 || parts.length > 3 || parts.some(part => !Number.isFinite(part) || part < 0)) return null;
  const seconds = parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
  return Number.isFinite(seconds) ? seconds : null;
}

function limitCreatorChapters(items: CreatorChapter[]) {
  const meaningful = items
    .filter(item => item.time >= 15 && item.title.trim().length >= 2)
    .sort((a, b) => a.time - b.time)
    .filter((item, index, list) => index === 0 || Math.abs(item.time - list[index - 1].time) >= 8);
  if (meaningful.length <= 5) return meaningful;
  const last = meaningful.length - 1;
  const indexes = [0, Math.round(last * 0.25), Math.round(last * 0.5), Math.round(last * 0.75), last];
  return [...new Set(indexes)].map(index => meaningful[index]).slice(0, 5);
}

function creatorChaptersFromDescription(description: string, duration = 0) {
  const chapters: CreatorChapter[] = [];
  for (const line of description.split(/\r?\n/)) {
    const match = line.match(/^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*(?:[-–—|•·:]\s*)?(.{2,140}?)\s*$/);
    if (!match) continue;
    const time = chapterSeconds(match[1]);
    const title = match[2].replace(/\s+/g, " ").trim();
    if (time === null || !title || (duration > 0 && time >= duration)) continue;
    chapters.push({ time, title, summary: "" });
  }
  const deduped = chapters.filter((item, index, list) => list.findIndex(other => other.time === item.time) === index);
  return limitCreatorChapters(deduped);
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
    if (!response.ok) return { title: "", author: "", authorUrl: "" };
    const metadata = (await response.json()) as { title?: string; author_name?: string; author_url?: string };
    return {
      title: metadata.title || "",
      author: metadata.author_name || "",
      authorUrl: metadata.author_url || "",
    };
  } catch {
    return { title: "", author: "", authorUrl: "" };
  }
}


function speakerNameFromMetadata(title: string, description: string) {
  const source = `${title}\n${description.slice(0, 2600)}`;
  const doctor = source.match(/\b(?:Dr\.?|Doctor)\s+([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]+){1,3})/);
  if (doctor) return `Dr. ${doctor[1].replace(/[|:,\-–—]+$/g, "").trim()}`;

  const credentialed = source.match(/\b([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]+){1,3})\s*,\s*(?:M\.?D\.?|D\.?O\.?|Ph\.?D\.?|MBBS|MD|DO|PhD)\b/);
  if (credentialed) return credentialed[1].trim();

  const guest = source.match(/\b(?:guest|joined by|speaking with|conversation with|interview with|featuring)\s+(?:Dr\.?\s+)?([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]+(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’-]+){1,3})/i);
  return guest ? guest[1].replace(/[|:,\-–—]+$/g, "").trim() : "";
}

const ROLE_LABELS: Array<[RegExp, string]> = [
  [/\bcardiothoracic surgeon\b/i, "Cardiothoracic Surgeon"],
  [/\bneurosurgeon\b/i, "Neurosurgeon"],
  [/\bneurologist\b/i, "Neurologist"],
  [/\bcardiologist\b/i, "Cardiologist"],
  [/\bendocrinologist\b/i, "Endocrinologist"],
  [/\bgastroenterologist\b/i, "Gastroenterologist"],
  [/\boncologist\b/i, "Oncologist"],
  [/\bpsychiatrist\b/i, "Psychiatrist"],
  [/\bpsychologist\b/i, "Psychologist"],
  [/\bneuroscientist\b/i, "Neuroscientist"],
  [/\b(?:medical )?doctor\b/i, "Doctor"],
  [/\bphysician\b/i, "Physician"],
  [/\bsurgeon\b/i, "Surgeon"],
  [/\bdietitian\b/i, "Dietitian"],
  [/\bnutritionist\b/i, "Nutritionist"],
  [/\bbiochemist\b/i, "Biochemist"],
  [/\bpharmacist\b/i, "Pharmacist"],
  [/\bprofessor\b/i, "Professor"],
  [/\bresearcher\b/i, "Researcher"],
  [/\bscientist\b/i, "Scientist"],
  [/\btherapist\b/i, "Therapist"],
];

function speakerRoleFromMetadata(description: string, speakerName: string) {
  if (!description) return "";
  const normalizedName = speakerName.replace(/^Dr\.?\s+/i, "").trim();
  const lower = description.toLowerCase();
  const nameIndex = normalizedName ? lower.indexOf(normalizedName.toLowerCase()) : -1;
  const local = nameIndex >= 0
    ? description.slice(Math.max(0, nameIndex - 180), nameIndex + normalizedName.length + 420)
    : description.slice(0, 1600);
  for (const [pattern, label] of ROLE_LABELS) if (pattern.test(local)) return label;
  return "";
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
        speakerRole: "",
        channelUrl: "",
        originalVideoUrl: `https://www.youtube.com/watch?v=${id}`,
        category: "Other",
        tags: [],
        creatorChapters: [],
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        metadataPending: true,
      });
    }
    const title = await greekTitle(originalTitle);
    const canonicalSpeaker = canonicalSpeakerForVideo(id);
    const speakerName = canonicalSpeaker?.name || speakerNameFromMetadata(originalTitle, details.description);
    const speakerRole = canonicalSpeaker?.role || speakerRoleFromMetadata(details.description, speakerName);
    const category = categoryFor(originalTitle, details.description, speakerName);
    const creatorChapterSource = creatorChaptersFromDescription(details.description, details.duration);
    const creatorChapters = await Promise.all(creatorChapterSource.map(async chapter => ({
      ...chapter,
      title: await greekTitle(chapter.title),
    })));
    return NextResponse.json({
      id,
      title,
      originalTitle,
      channel: metadata.author || details.author || "YouTube",
      channelUrl: metadata.authorUrl || "",
      originalVideoUrl: `https://www.youtube.com/watch?v=${id}`,
      duration: details.duration,
      description: details.description,
      speakerName,
      speakerRole,
      category,
      tags: [category === "Medical" ? "υγεία" : category.toLowerCase(), speakerName].filter(Boolean),
      creatorChapters,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    });
  } catch {
    return NextResponse.json({ error: "Δεν μπόρεσα να διαβάσω τα στοιχεία του video." }, { status: 502 });
  }
}
