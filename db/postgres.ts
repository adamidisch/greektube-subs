import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

export function database() {
  const url = process.env.DATABASE_URL_STANDBY || process.env.DATABASE_URL;
  if (!url) {
    throw new Error("No database connection is configured.");
  }
  if (!client) client = neon(url);
  return client;
}
