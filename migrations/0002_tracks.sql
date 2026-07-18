CREATE TABLE `track_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`label` text NOT NULL,
	`original_key` text NOT NULL,
	`stream_key` text,
	`peaks_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`duration` real,
	`sample_rate` integer,
	`bit_depth` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade
);
