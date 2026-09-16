ALTER TABLE `projects` ADD COLUMN `version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `created_by` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `created_at` integer;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `updated_at` integer;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `deleted_at` integer;
--> statement-breakpoint
ALTER TABLE `interactions` ADD COLUMN `deleted_at` integer;
--> statement-breakpoint
ALTER TABLE `tasks` ADD COLUMN `deleted_at` integer;
--> statement-breakpoint
CREATE TABLE `organisation_projects` (
	`organisation_id` text NOT NULL,
	`project_id` text NOT NULL,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	PRIMARY KEY(`organisation_id`, `project_id`)
);
