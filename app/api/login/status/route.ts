import { NextResponse } from "next/server";
import { neonAuthConfigured } from "@/lib/pro-auth/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ configured: neonAuthConfigured() }, { headers: { "Cache-Control": "no-store" } });
}
