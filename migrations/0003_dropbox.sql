CREATE TABLE `dropbox_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`refresh_token_encrypted` text NOT NULL,
	`account_id` text,
	`account_email` text,
	`connected_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `tracks` ADD `source_filename` text;