ALTER TABLE `tasks` ADD `outcome` text;
--> statement-breakpoint
ALTER TABLE `tasks` ADD `kind` text;
--> statement-breakpoint
UPDATE `tasks` SET `status` = 'scheduled' WHERE `status` = 'waiting';
