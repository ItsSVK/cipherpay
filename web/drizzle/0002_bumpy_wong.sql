ALTER TABLE `employees` RENAME TO `addresses`;--> statement-breakpoint
DROP INDEX `employees_employer_wallet`;--> statement-breakpoint
CREATE UNIQUE INDEX `addresses_employer_wallet` ON `addresses` (`employer`,`wallet`);--> statement-breakpoint
ALTER TABLE `addresses` DROP COLUMN `role`;--> statement-breakpoint
ALTER TABLE `addresses` DROP COLUMN `amount`;