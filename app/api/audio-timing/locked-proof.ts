import { readFile } from "fs/promises";
import path from "path";

const LOCKED_PROOF_VIDEO_ID = "D2RjneeG_xA";

type LockedProofUnit = {
  alignment_id: string;
  start_ms: number;
  end_ms: number;
  greek_text: string;
  rendered_text: string;
};

function parseProofTime(value: string) {
  const match = /^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/.exec(value.trim());
  if (!match) throw new Error(`Invalid locked proof timestamp: ${value}`);
  const [, hours, minutes, seconds, milliseconds] = match;
  return (((Number(hours) * 60 + Number(minutes)) * 60) + Number(seconds)) * 1000
    + Number(milliseconds);
}

export function parseLockedProofSrt(source: string): LockedProofUnit[] {
  const blocks = source.replace(/^\uFEFF/, "").trim().split(/\r?\n\s*\r?\n/);
  return blocks.map((block, index) => {
    const lines = block.split(/\r?\n/);
    const cueId = Number(lines[0]);
    const timing = lines[1]?.split("-->").map(value => value.trim());
    const text = lines.slice(2).join("\n").trim();
    if (!Number.isInteger(cueId) || cueId !== index + 1 || timing?.length !== 2 || !text) {
      throw new Error(`Invalid locked proof cue at block ${index + 1}`);
    }
    const startMs = parseProofTime(timing[0]);
    const endMs = parseProofTime(timing[1]);
    if (endMs <= startMs) throw new Error(`Invalid locked proof duration at cue ${cueId}`);
    return {
      alignment_id: `V81-${String(cueId).padStart(3, "0")}`,
      start_ms: startMs,
      end_ms: endMs,
      greek_text: text.replace(/\n/g, " "),
      rendered_text: text,
    };
  });
}

export async function lockedProofArtifact(videoId: string) {
  if (videoId !== LOCKED_PROOF_VIDEO_ID) return null;
  const proofSrt = await readFile(
    path.join(process.cwd(), "worker", "fixtures", "D2RjneeG_xA-v81-output.srt"),
    "utf8",
  );
  const units = parseLockedProofSrt(proofSrt);
  return {
    proofReady: true,
    durationMs: units.at(-1)?.end_ms || 0,
    proofAlignment: { units },
    proofSrt,
  };
}
