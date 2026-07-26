import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const appState = sqliteTable("app_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const videoTranscripts = sqliteTable("video_transcripts", {
  videoId: text("video_id").primaryKey(),
  title: text("title").notNull().default(""),
  channel: text("channel").notNull().default(""),
  thumbnail: text("thumbnail").notNull().default(""),
  duration: real("duration").notNull().default(0),
  originalLanguage: text("original_language").notNull().default("unknown"),
  englishTranscript: text("english_transcript").notNull().default("[]"),
  greekTranscript: text("greek_transcript").notNull().default("[]"),
  timestamps: text("timestamps").notNull().default("[]"),
  topics: text("topics").notNull().default("[]"),
  keyPoints: text("key_points").notNull().default("[]"),
  status: text("status").notNull().default("processing"),
  progress: integer("progress").notNull().default(0),
  lockToken: text("lock_token"),
  lockExpiresAt: text("lock_expires_at"),
  error: text("error"),
  transcriptVersion: integer("transcript_version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("video_transcripts_status_idx").on(table.status, table.updatedAt)]);

export const personalStates = sqliteTable("personal_states", {
  ownerKey: text("owner_key").primaryKey(),
  value: text("value").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
