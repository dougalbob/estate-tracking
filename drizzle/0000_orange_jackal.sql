CREATE TABLE `organisations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`main_contact` text,
	`phone_numbers` text DEFAULT '[]' NOT NULL,
	`email` text,
	`reference` text,
	`notes` text,
	`status` text DEFAULT 'not_contacted' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
