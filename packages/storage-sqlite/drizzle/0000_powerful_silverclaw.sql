CREATE TABLE `execution_trace_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`summary` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`error_code` text,
	`error_message` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`execution_id`) REFERENCES `execution_traces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `execution_trace_steps_execution_id_idx` ON `execution_trace_steps` (`execution_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `execution_trace_steps_execution_id_sequence_idx` ON `execution_trace_steps` (`execution_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `execution_traces` (
	`id` text PRIMARY KEY NOT NULL,
	`capability_id` text NOT NULL,
	`status` text NOT NULL,
	`workspace_id` text,
	`thread_id` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`error_code` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `execution_traces_started_at_idx` ON `execution_traces` (`started_at`);--> statement-breakpoint
CREATE INDEX `execution_traces_status_idx` ON `execution_traces` (`status`);--> statement-breakpoint
CREATE INDEX `execution_traces_capability_id_idx` ON `execution_traces` (`capability_id`);