CREATE TABLE `payroll_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payroll_id` text NOT NULL,
	`address_id` text NOT NULL,
	`amount` text NOT NULL,
	FOREIGN KEY (`payroll_id`) REFERENCES `payrolls`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`address_id`) REFERENCES `addresses`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_entries_payroll_address` ON `payroll_entries` (`payroll_id`,`address_id`);--> statement-breakpoint
CREATE INDEX `payroll_entries_address` ON `payroll_entries` (`address_id`);--> statement-breakpoint
CREATE TABLE `payrolls` (
	`id` text PRIMARY KEY NOT NULL,
	`employer` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payrolls_employer` ON `payrolls` (`employer`,`created_at`);--> statement-breakpoint
ALTER TABLE `payroll_runs` ADD `payroll_id` text REFERENCES payrolls(id) ON DELETE SET NULL;