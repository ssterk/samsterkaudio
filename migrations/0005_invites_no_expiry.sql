PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_invites` (
	`token` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`release_id` text NOT NULL,
	`expires_at` integer,
	`used_at` integer,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_invites`("token", "email", "release_id", "expires_at", "used_at") SELECT "token", "email", "release_id", "expires_at", "used_at" FROM `invites`;--> statement-breakpoint
DROP TABLE `invites`;--> statement-breakpoint
ALTER TABLE `__new_invites` RENAME TO `invites`;--> statement-breakpoint
PRAGMA foreign_keys=ON;