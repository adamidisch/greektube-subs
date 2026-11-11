import { database } from "@/db/postgres";

// Server-side analytics events (admin logins). Not accepted from clients, so they cannot be forged.
// Fails silently: analytics must never block a login.
export async function recordServerEvent(request: Request, name: "login" | "login_failed", properties: Record<string, unknown> = {}) {
  try {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    const ipMasked = forwarded.includes(":")
      ? forwarded.split(":").slice(0, 3).join(":") + ":…"
      : forwarded.split(".").slice(0, 3).join(".") + (forwarded ? ".x" : "");
    const ua = request.headers.get("user-agent") || "";
    const device = /iPad|Tablet/i.test(ua) ? "Tablet" : /Mobi|iPhone|Android/i.test(ua) ? "Mobile" : "Desktop";
    const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Other";
    let city = request.headers.get("x-vercel-ip-city") || "";
    try { city = decodeURIComponent(city); } catch {}
    await database().query(
      `INSERT INTO analytics_events (session_id,event_name,path,country,city,device,browser,properties)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      ["admin", name, "/admin", (request.headers.get("x-vercel-ip-country") || "").toUpperCase().slice(0, 8), city.slice(0, 80), device, browser, JSON.stringify({ ip: ipMasked, ...properties })],
    );
  } catch {}
}
