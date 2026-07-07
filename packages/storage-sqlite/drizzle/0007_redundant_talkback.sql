CREATE TABLE `research_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL,
	`workspace_id` text,
	`question` text NOT NULL,
	`summary_json` text NOT NULL,
	`findings_json` text NOT NULL,
	`citations_json` text NOT NULL,
	`limitations_json` text NOT NULL,
	`warnings_json` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`execution_id`) REFERENCES `execution_traces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `research_reports_execution_id_idx` ON `research_reports` (`execution_id`);--> statement-breakpoint
CREATE INDEX `research_reports_workspace_status_created_idx` ON `research_reports` (`workspace_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `research_reports_status_created_idx` ON `research_reports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `research_reports_created_at_idx` ON `research_reports` (`created_at`);--> statement-breakpoint
CREATE TABLE `research_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`execution_id` text NOT NULL,
	`workspace_id` text,
	`evidence_id` text,
	`url` text NOT NULL,
	`final_url` text,
	`title` text,
	`published_at` text,
	`selection_rank` integer,
	`relevance_score` real,
	`analysis_json` text,
	`citation_ids_json` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `research_reports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`execution_id`) REFERENCES `execution_traces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_id`) REFERENCES `web_extraction_evidence`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `research_sources_report_id_idx` ON `research_sources` (`report_id`);--> statement-breakpoint
CREATE INDEX `research_sources_execution_id_idx` ON `research_sources` (`execution_id`);--> statement-breakpoint
CREATE INDEX `research_sources_workspace_execution_idx` ON `research_sources` (`workspace_id`,`execution_id`);--> statement-breakpoint
CREATE INDEX `research_sources_evidence_id_idx` ON `research_sources` (`evidence_id`);--> statement-breakpoint
CREATE INDEX `research_sources_status_idx` ON `research_sources` (`status`);--> statement-breakpoint
CREATE INDEX `research_sources_selection_rank_idx` ON `research_sources` (`selection_rank`);
