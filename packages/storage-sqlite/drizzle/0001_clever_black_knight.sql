CREATE TABLE `episodic_memory` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`workspace_id` text,
	`capability_id` text,
	`thread_id` text,
	`execution_id` text,
	`event_type` text NOT NULL,
	`summary` text NOT NULL,
	`outcome` text,
	`related_entities_json` text NOT NULL,
	`evidence_refs_json` text NOT NULL,
	`confidence` real NOT NULL,
	`sensitivity` text NOT NULL,
	`source_type` text NOT NULL,
	`source_ref` text,
	`source_capability_id` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`expires_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`execution_id`) REFERENCES `execution_traces`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `episodic_memory_execution_idx` ON `episodic_memory` (`execution_id`);--> statement-breakpoint
CREATE INDEX `episodic_memory_workspace_status_idx` ON `episodic_memory` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `episodic_memory_capability_status_idx` ON `episodic_memory` (`capability_id`,`status`);--> statement-breakpoint
CREATE INDEX `episodic_memory_thread_status_idx` ON `episodic_memory` (`thread_id`,`status`);--> statement-breakpoint
CREATE INDEX `episodic_memory_event_type_idx` ON `episodic_memory` (`event_type`);--> statement-breakpoint
CREATE INDEX `episodic_memory_created_at_idx` ON `episodic_memory` (`created_at`);--> statement-breakpoint
CREATE INDEX `episodic_memory_expires_at_idx` ON `episodic_memory` (`expires_at`);--> statement-breakpoint
CREATE TABLE `semantic_memory` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`workspace_id` text,
	`capability_id` text,
	`thread_id` text,
	`subject` text NOT NULL,
	`predicate` text NOT NULL,
	`value_json` text NOT NULL,
	`confidence` real NOT NULL,
	`sensitivity` text NOT NULL,
	`source_type` text NOT NULL,
	`source_ref` text,
	`source_execution_id` text,
	`source_capability_id` text,
	`created_by` text NOT NULL,
	`evidence_refs_json` text NOT NULL,
	`status` text NOT NULL,
	`supersedes_memory_id` text,
	`superseded_by_memory_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`expires_at` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_execution_id`) REFERENCES `execution_traces`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`supersedes_memory_id`) REFERENCES `semantic_memory`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`superseded_by_memory_id`) REFERENCES `semantic_memory`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `semantic_memory_scope_status_idx` ON `semantic_memory` (`scope`,`status`);--> statement-breakpoint
CREATE INDEX `semantic_memory_workspace_status_idx` ON `semantic_memory` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `semantic_memory_capability_status_idx` ON `semantic_memory` (`capability_id`,`status`);--> statement-breakpoint
CREATE INDEX `semantic_memory_thread_status_idx` ON `semantic_memory` (`thread_id`,`status`);--> statement-breakpoint
CREATE INDEX `semantic_memory_subject_predicate_idx` ON `semantic_memory` (`subject`,`predicate`);--> statement-breakpoint
CREATE INDEX `semantic_memory_source_execution_idx` ON `semantic_memory` (`source_execution_id`);--> statement-breakpoint
CREATE INDEX `semantic_memory_expires_at_idx` ON `semantic_memory` (`expires_at`);--> statement-breakpoint
CREATE INDEX `semantic_memory_updated_at_idx` ON `semantic_memory` (`updated_at`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
CREATE INDEX `workspaces_status_idx` ON `workspaces` (`status`);--> statement-breakpoint
CREATE INDEX `workspaces_updated_at_idx` ON `workspaces` (`updated_at`);