CREATE TABLE `web_search_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL,
	`workspace_id` text,
	`provider_id` text NOT NULL,
	`query` text NOT NULL,
	`request_json` text NOT NULL,
	`status` text NOT NULL,
	`result_count` integer NOT NULL,
	`results_json` text NOT NULL,
	`warnings_json` text NOT NULL,
	`failure_category` text,
	`failure_message` text,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `execution_traces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `web_search_evidence_execution_id_idx` ON `web_search_evidence` (`execution_id`);--> statement-breakpoint
CREATE INDEX `web_search_evidence_workspace_execution_idx` ON `web_search_evidence` (`workspace_id`,`execution_id`);--> statement-breakpoint
CREATE INDEX `web_search_evidence_created_at_idx` ON `web_search_evidence` (`created_at`);--> statement-breakpoint
CREATE INDEX `web_search_evidence_expires_at_idx` ON `web_search_evidence` (`expires_at`);--> statement-breakpoint
CREATE TABLE `web_fetch_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL,
	`workspace_id` text,
	`search_evidence_id` text,
	`selected_url_source` text NOT NULL,
	`selected_result_index` integer,
	`requested_url` text NOT NULL,
	`final_url` text,
	`status` text NOT NULL,
	`status_code` integer,
	`content_type` text,
	`content_length` integer,
	`content_bytes` integer,
	`body_sha256` text,
	`redirects_json` text NOT NULL,
	`warnings_json` text NOT NULL,
	`failure_category` text,
	`failure_message` text,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `execution_traces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`search_evidence_id`) REFERENCES `web_search_evidence`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `web_fetch_evidence_execution_id_idx` ON `web_fetch_evidence` (`execution_id`);--> statement-breakpoint
CREATE INDEX `web_fetch_evidence_workspace_execution_idx` ON `web_fetch_evidence` (`workspace_id`,`execution_id`);--> statement-breakpoint
CREATE INDEX `web_fetch_evidence_search_evidence_id_idx` ON `web_fetch_evidence` (`search_evidence_id`);--> statement-breakpoint
CREATE INDEX `web_fetch_evidence_created_at_idx` ON `web_fetch_evidence` (`created_at`);--> statement-breakpoint
CREATE INDEX `web_fetch_evidence_expires_at_idx` ON `web_fetch_evidence` (`expires_at`);--> statement-breakpoint
CREATE TABLE `web_extraction_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL,
	`workspace_id` text,
	`fetch_evidence_id` text,
	`final_url` text NOT NULL,
	`status` text NOT NULL,
	`extraction_method` text,
	`source_profile_id` text,
	`title` text,
	`byline` text,
	`site_name` text,
	`published_at` text,
	`canonical_url` text,
	`excerpt` text,
	`word_count` integer,
	`content_text_snapshot` text,
	`content_text_sha256` text,
	`content_chars` integer,
	`original_content_chars` integer,
	`warnings_json` text NOT NULL,
	`failure_category` text,
	`failure_message` text,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `execution_traces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fetch_evidence_id`) REFERENCES `web_fetch_evidence`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `web_extraction_evidence_execution_id_idx` ON `web_extraction_evidence` (`execution_id`);--> statement-breakpoint
CREATE INDEX `web_extraction_evidence_workspace_execution_idx` ON `web_extraction_evidence` (`workspace_id`,`execution_id`);--> statement-breakpoint
CREATE INDEX `web_extraction_evidence_fetch_evidence_id_idx` ON `web_extraction_evidence` (`fetch_evidence_id`);--> statement-breakpoint
CREATE INDEX `web_extraction_evidence_source_profile_id_idx` ON `web_extraction_evidence` (`source_profile_id`);--> statement-breakpoint
CREATE INDEX `web_extraction_evidence_created_at_idx` ON `web_extraction_evidence` (`created_at`);--> statement-breakpoint
CREATE INDEX `web_extraction_evidence_expires_at_idx` ON `web_extraction_evidence` (`expires_at`);
