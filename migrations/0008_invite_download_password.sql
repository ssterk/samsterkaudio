ALTER TABLE `invites` ADD `can_download` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `invites` ADD `password_hash` text;