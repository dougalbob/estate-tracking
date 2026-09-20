CREATE TABLE `gatherings` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`date` text,
	`time` text,
	`place` text,
	`notes` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`party_size` integer DEFAULT 1 NOT NULL,
	`phone` text,
	`email` text,
	`relationship` text,
	`ringing` text,
	`contacted_at` text,
	`contacted_by` text,
	`funeral` text DEFAULT 'not_asked' NOT NULL,
	`wake` text DEFAULT 'not_asked' NOT NULL,
	`notes` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer
);
