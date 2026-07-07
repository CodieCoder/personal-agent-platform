CREATE TABLE `source_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`domain` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`article_container_selector` text,
	`title_selector` text,
	`byline_selector` text,
	`published_at_selector` text,
	`content_selector` text,
	`canonical_url_selector` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_profiles_domain_unique` ON `source_profiles` (`domain`);--> statement-breakpoint
CREATE INDEX `source_profiles_status_idx` ON `source_profiles` (`status`);--> statement-breakpoint
CREATE INDEX `source_profiles_updated_at_idx` ON `source_profiles` (`updated_at`);