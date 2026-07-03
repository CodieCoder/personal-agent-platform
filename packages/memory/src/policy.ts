import type { MemorySensitivity, MemoryStatus } from "@pap/contracts";

export type SemanticMemoryPolicyInput = {
  confidence: number;
  sensitivity: MemorySensitivity;
  hasProvenance: boolean;
  inferred?: boolean | undefined;
  longLived?: boolean | undefined;
};

export type SemanticMemoryPolicyDecision =
  | {
      action: "reject";
      reason: string;
    }
  | {
      action: "store";
      status: Extract<MemoryStatus, "active" | "proposed">;
      reason: string;
    };

export type EpisodicMemoryPolicyInput = {
  hasExecutionId: boolean;
  hasProvenance: boolean;
  confidence: number;
  sensitivity: MemorySensitivity;
};

export type EpisodicMemoryPolicyDecision =
  | {
      action: "reject";
      reason: string;
    }
  | {
      action: "store";
      reason: string;
    };

export function evaluateAutomaticSemanticWrite(
  input: SemanticMemoryPolicyInput,
): SemanticMemoryPolicyDecision {
  if (!input.hasProvenance) {
    return {
      action: "reject",
      reason: "Automatic semantic memory writes require provenance.",
    };
  }

  if (input.confidence < 0.4) {
    return {
      action: "reject",
      reason: "Automatic semantic memory confidence is too low.",
    };
  }

  if (
    input.confidence < 0.9 ||
    input.sensitivity === "sensitive" ||
    input.inferred === true ||
    input.longLived === true
  ) {
    return {
      action: "store",
      status: "proposed",
      reason: "Semantic memory requires review before becoming active.",
    };
  }

  return {
    action: "store",
    status: "active",
    reason: "Semantic memory passed automatic write policy.",
  };
}

export function evaluateAutomaticEpisodicWrite(
  input: EpisodicMemoryPolicyInput,
): EpisodicMemoryPolicyDecision {
  if (!input.hasExecutionId) {
    return {
      action: "reject",
      reason: "Automatic episodic memory writes require an execution ID.",
    };
  }

  if (!input.hasProvenance) {
    return {
      action: "reject",
      reason: "Automatic episodic memory writes require provenance.",
    };
  }

  if (input.confidence < 0.4) {
    return {
      action: "reject",
      reason: "Automatic episodic memory confidence is too low.",
    };
  }

  if (input.sensitivity === "sensitive") {
    return {
      action: "reject",
      reason: "Automatic episodic memory writes cannot store sensitive records.",
    };
  }

  return {
    action: "store",
    reason: "Episodic memory passed automatic write policy.",
  };
}
