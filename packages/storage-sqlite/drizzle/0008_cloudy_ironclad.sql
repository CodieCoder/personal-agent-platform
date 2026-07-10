CREATE TABLE `research_report_feedback` (
	`report_id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`rating` text NOT NULL,
	`useful` integer DEFAULT 0 NOT NULL,
	`reason` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `research_reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `research_report_feedback_workspace_idx` ON `research_report_feedback` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `research_source_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`report_id` text NOT NULL,
	`source_id` text NOT NULL,
	`rating` text NOT NULL,
	`helpful` integer DEFAULT 0 NOT NULL,
	`reason` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `research_reports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `research_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `research_source_feedback_workspace_report_idx` ON `research_source_feedback` (`workspace_id`,`report_id`);--> statement-breakpoint
CREATE INDEX `research_source_feedback_report_source_idx` ON `research_source_feedback` (`report_id`,`source_id`);--> statement-breakpoint
CREATE INDEX `research_source_feedback_rating_idx` ON `research_source_feedback` (`rating`);--> statement-breakpoint
CREATE UNIQUE INDEX `research_source_feedback_source_id_unique` ON `research_source_feedback` (`source_id`);