import { database } from "@/db/postgres";

// Admin login log. Written only by the server (never accepted from clients) into its own table,
// so it cannot be forged and never mixes with visitor analytics.
// Fails silently: analytics must never block a login.
export async function recordServerEvent(request: Request, name: "login" | "login_failed") {
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
    const db = database();
    await db.query(`CREATE TABLE IF NOT EXISTS admin_login_log (id bigserial PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT NOW(),event_name text NOT NULL,country text NOT NULL DEFAULT '',city text NOT NULL DEFAULT '',device text NOT NULL DEFAULT '',browser text NOT NULL DEFAULT '',ip text NOT NULL DEFAULT '')`);
    await db.query(
      `INSERT INTO admin_login_log (event_name,country,city,device,browser,ip) VALUES ($1,$2,$3,$4,$5,$6)`,
      [name, (request.headers.get("x-vercel-ip-country") || "").toUpperCase().slice(0, 8), city.slice(0, 80), device, browser, ipMasked],
    );
  } catch {}
}
