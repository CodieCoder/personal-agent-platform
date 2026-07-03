import type { EpisodicMemoryRecord, MemoryStatus, SemanticMemoryRecord } from "@pap/contracts";
import type { MemoryRecord } from "@pap/memory";
import type { SafeWebError } from "../executions/types";

export type MemoryListResult<TRecord> =
  | {
      ok: true;
      records: TRecord[];
    }
  | {
      ok: false;
      error: SafeWebError;
    };

export type MemoryRecordResult =
  | {
      ok: true;
      found: true;
      memory: MemoryRecord;
    }
  | {
      ok: true;
      found: false;
    }
  | {
      ok: false;
      error: SafeWebError;
    };

export type SemanticMemoryMutationResult =
  | {
      ok: true;
      memory: SemanticMemoryRecord;
    }
  | {
      ok: false;
      error: SafeWebError;
    };

export type SupersedeSemanticMemoryResult =
  | {
      ok: true;
      previous: SemanticMemoryRecord;
      replacement: SemanticMemoryRecord;
    }
  | {
      ok: false;
      error: SafeWebError;
    };

export type MemoryMutationResult =
  | {
      ok: true;
      memory: MemoryRecord;
    }
  | {
      ok: false;
      error: SafeWebError;
    };

export type SemanticMemoryListResult = MemoryListResult<SemanticMemoryRecord>;

export type EpisodicMemoryListResult = MemoryListResult<EpisodicMemoryRecord>;

export type MemoryMutationStatus = Extract<MemoryStatus, "expired" | "deleted">;
