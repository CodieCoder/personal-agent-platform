import { capabilityManifestSchema } from "@pap/contracts";

export const localModelTestManifest = capabilityManifestSchema.parse({
  id: "capability.local-model-test",
  version: "0.1.0",
  name: "Local Model Test",
  description: "Runs a constrained local model prompt and validates structured output.",
  skill: {
    id: "skill.local-model-test",
    version: "0.1.0",
    path: "./skills/local-model-test",
  },
  inputSchemaId: "capability.local-model-test.input.v1",
  outputSchemaId: "capability.local-model-test.output.v1",
  allowedTools: [],
  allowedChildCapabilities: [],
  supportedUiBlocks: [],
  permissions: ["llm.generate"],
  sideEffects: ["none"],
  approvalPolicyId: "approval.none",
  memoryPolicyId: "memory.none",
  trustLevel: "core",
  tags: ["local-model", "core"],
});
