import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

export function database() {
  const useStandby = process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "codex/new-neon-preview";
  const url = useStandby ? process.env.DATABASE_URL_STANDBY : process.env.DATABASE_URL;
  if (!url) {
    throw new Error(useStandby
      ? "DATABASE_URL_STANDBY is not configured for the standby preview."
      : "DATABASE_URL is not configured.");
  }
  if (!client) client = neon(url);
  return client;
}
