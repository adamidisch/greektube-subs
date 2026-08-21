import { NextResponse } from "next/server";
import { canonicalNumberTokens, numberTokensMatch } from "../../captions/numeric-integrity";
import { canonicalEnglishForImport } from "../../manual-captions/canonical-source";
import { assembledNatashaTranslation, auditNatashaTranslation } from "../audit/route";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const revalidate = false;

const VIDEO_ID = "fX2z-BF8Jac";
const EXPECTED_CUES = 3086;
const EXPECTED_SOURCE_HASH = "61c564d0f35b83db04aedffaedd1c808d2b405294f5d8f0799ed36b04ba155a8";

function greekRatio(text: string) {
  const letters = text.match(/\p{L}/gu)?.length || 0;
  const greek = text.match(/[\u0370-\u03ff\u1f00-\u1fff]/g)?.length || 0;
  return letters ? greek / letters : 0;
}

export async function GET() {
  const environment = process.env.VERCEL_ENV || "";
  const branch = process.env.VERCEL_GIT_COMMIT_REF || "";
  if (environment !== "preview" || branch !== "temp/natasha-owner-import") {
    return NextResponse.json({ skipped: true, reason: "preview-branch-only", environment, branch });
  }

  const structural = auditNatashaTranslation();
  if (!structural.ok || structural.count !== EXPECTED_CUES) {
    throw new Error(`Natasha structural audit failed: ${JSON.stringify(structural)}`);
  }

  const canonical = await canonicalEnglishForImport(VIDEO_ID);
  if (canonical.sourceHash !== EXPECTED_SOURCE_HASH || canonical.cues.length !== EXPECTED_CUES) {
    throw new Error(`Canonical source mismatch: ${canonical.sourceHash} / ${canonical.cues.length}`);
  }

  const rows = assembledNatashaTranslation();
  const numericMismatches: Array<Record<string, unknown>> = [];
  const markerArtifacts: Array<Record<string, unknown>> = [];
  const empty: number[] = [];
  const suspiciousLatinOnly: Array<Record<string, unknown>> = [];

  for (let index = 0; index < canonical.cues.length; index += 1) {
    const source = canonical.cues[index];
    const row = rows[index];
    if (!row || row[0] !== index + 1) throw new Error(`Natasha cue mapping failed at ${index + 1}`);
    const target = row[1].replace(/\s+/g, " ").trim();
    if (!target) empty.push(index + 1);
    if (/\[\s*\d+\s*\]/.test(target)) markerArtifacts.push({ cue: index + 1, target });
    if (!numberTokensMatch(source.text, target)) {
      numericMismatches.push({
        cue: index + 1,
        source: source.text,
        target,
        sourceNumbers: canonicalNumberTokens(source.text),
        targetNumbers: canonicalNumberTokens(target),
      });
    }
    if (/[A-Za-z]/.test(source.text) && source.text.length > 8 && greekRatio(target) < 0.05 && !/^[-—–\sA-Z0-9.%+/]+$/.test(target)) {
      suspiciousLatinOnly.push({ cue: index + 1, source: source.text, target });
    }
  }

  const report = {
    ok: !numericMismatches.length && !markerArtifacts.length && !empty.length,
    structural,
    sourceHash: canonical.sourceHash,
    sourceCount: canonical.cues.length,
    numericMismatches,
    markerArtifacts,
    empty,
    suspiciousLatinOnly,
  };

  console.error("[natasha-owner-import:qa]", JSON.stringify(report));
  if (!report.ok) throw new Error(`Natasha QA failed: ${numericMismatches.length} numeric mismatches, ${markerArtifacts.length} marker artifacts, ${empty.length} empty cues`);
  return NextResponse.json(report);
}
