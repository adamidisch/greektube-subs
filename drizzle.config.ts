import type { Config } from "drizzle-kit";

export default {
  dialect: "sqlite",
  schema: "./db/schema.ts",
  out: "./drizzle",
} satisfies Config;
