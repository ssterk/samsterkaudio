CREATE TABLE `anonymous_listens` (
	`id` text PRIMARY KEY NOT NULL,
	`invite_token` text NOT NULL,
	`track_id` text NOT NULL,
	`listened_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`invite_token`) REFERENCES `invites`(`token`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
