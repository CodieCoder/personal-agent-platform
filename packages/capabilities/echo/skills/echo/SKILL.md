# Echo Capability Skill

Use this skill only for the core echo capability.

## Purpose

Return a whitespace-normalized copy of the input message and record one workflow trace step.

## Rules

- Accept only `{ message: string }` input.
- Reject empty or whitespace-only messages through schema validation.
- Normalize internal whitespace to a single space and trim leading/trailing whitespace.
- Return `{ message: string; echoedAt: string }` with an ISO timestamp.
- Do not call tools, memory, LLMs, approvals, UI builders, network services, or child capabilities.
- Produce no side effects beyond the execution trace.
