CREATE TABLE `auth_nonces` (
	`nonce` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`employer` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'Team member' NOT NULL,
	`wallet` text NOT NULL,
	`amount` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_employer_wallet` ON `employees` (`employer`,`wallet`);--> statement-breakpoint
CREATE TABLE `payroll_run_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`recipient` text NOT NULL,
	`name` text NOT NULL,
	`amount` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`signature` text,
	`error` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `payroll_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `payroll_run_items_run` ON `payroll_run_items` (`run_id`);--> statement-breakpoint
CREATE TABLE `payroll_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`employer` text NOT NULL,
	`label` text NOT NULL,
	`status` text DEFAULT 'done' NOT NULL,
	`recipients` integer NOT NULL,
	`total` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payroll_runs_employer` ON `payroll_runs` (`employer`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_address` ON `sessions` (`address`);