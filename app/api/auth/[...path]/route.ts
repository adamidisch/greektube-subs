import { NextResponse } from "next/server";
import { getAuth } from "@/lib/pro-auth/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };
const unavailable = () => NextResponse.json({ error: "Η σύνδεση δεν είναι ενεργή ακόμη." }, { status: 503, headers: { "Cache-Control": "no-store" } });

// Managed Neon Auth handles Google, email codes, session rotation and its own cookies.
export async function GET(request: Request, context: Context) {
  const auth = getAuth();
  return auth ? auth.handler().GET(request, context) : unavailable();
}
export async function POST(request: Request, context: Context) {
  const auth = getAuth();
  return auth ? auth.handler().POST(request, context) : unavailable();
}
