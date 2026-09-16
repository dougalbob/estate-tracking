CREATE TABLE `finance_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_pence` integer NOT NULL,
	`occurred_on` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`voided_at` integer,
	`void_reason` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`record_id`) REFERENCES `finance_records`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `finance_records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`category` text,
	`amount_pence` integer,
	`occurred_on` text,
	`funded_by` text,
	`beneficiary` text,
	`organisation_id` text,
	`project_id` text,
	`voided_at` integer,
	`void_reason` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `document_links` ADD `finance_record_id` text REFERENCES finance_records(id);