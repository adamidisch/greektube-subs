CREATE TABLE `personal_states` (
	`owner_key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `video_transcripts` (
	`video_id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`channel` text DEFAULT '' NOT NULL,
	`thumbnail` text DEFAULT '' NOT NULL,
	`duration` real DEFAULT 0 NOT NULL,
	`original_language` text DEFAULT 'unknown' NOT NULL,
	`english_transcript` text DEFAULT '[]' NOT NULL,
	`greek_transcript` text DEFAULT '[]' NOT NULL,
	`timestamps` text DEFAULT '[]' NOT NULL,
	`topics` text DEFAULT '[]' NOT NULL,
	`key_points` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`lock_token` text,
	`lock_expires_at` text,
	`error` text,
	`transcript_version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `video_transcripts_status_idx` ON `video_transcripts` (`status`,`updated_at`);