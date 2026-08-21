import { NextResponse } from "next/server";
import { page0 } from "../data/page-0";
import { page1 } from "../data/page-1";
import { page2 } from "../data/page-2";
import { page3 } from "../data/page-3";
import { page4 } from "../data/page-4";
import { page5 } from "../data/page-5";
import { page6 } from "../data/page-6";
import { page7 } from "../data/page-7";
import { corrections } from "../data/corrections";

export const dynamic = "force-dynamic";

export function assembledNatashaTranslation() {
  const rows = [...page0, ...page1, ...page2, ...page3, ...page4, ...page5, ...page6, ...page7]
    .map(([index, text]) => [index, corrections.get(index) ?? text] as [number, string]);
  return rows;
}

export function auditNatashaTranslation() {
  const rows = assembledNatashaTranslation();
  const seen = new Set<number>();
  const duplicates: number[] = [];
  const empty: number[] = [];
  const outOfRange: number[] = [];
  for (const [index, text] of rows) {
    if (seen.has(index)) duplicates.push(index);
    seen.add(index);
    if (index < 1 || index > 3086) outOfRange.push(index);
    if (!text.trim()) empty.push(index);
  }
  const missing: number[] = [];
  for (let index = 1; index <= 3086; index += 1) if (!seen.has(index)) missing.push(index);
  const ordered = rows.every(([index], offset) => index === offset + 1);
  return {
    ok: rows.length === 3086 && ordered && !duplicates.length && !missing.length && !empty.length && !outOfRange.length,
    count: rows.length,
    ordered,
    duplicates,
    missing,
    empty,
    outOfRange,
    corrections: [...corrections.keys()],
    first: rows[0]?.[0] ?? null,
    last: rows.at(-1)?.[0] ?? null,
  };
}

export async function GET() {
  return NextResponse.json(auditNatashaTranslation(), { headers: { "Cache-Control": "no-store" } });
}
