import { capabilityManifestSchema } from "@pap/contracts";

export const searchExtractTestManifest = capabilityManifestSchema.parse({
  id: "capability.search-extract-test",
  version: "0.1.0",
  name: "Search Extract Test",
  description: "Runs deterministic search and optional guarded web extraction for testing.",
  skill: {
    id: "skill.search-extract-test",
    version: "0.1.0",
    path: "./skills/search-extract-test",
  },
  inputSchemaId: "capability.search-extract-test.input.v1",
  outputSchemaId: "capability.search-extract-test.output.v1",
  allowedTools: [
    "tool.web.search",
    "tool.web.url-policy",
    "tool.web.fetch",
    "tool.web.source-profile.resolve",
    "tool.web.extract",
    "tool.web.evidence.write",
  ],
  allowedChildCapabilities: [],
  supportedUiBlocks: [],
  permissions: ["web.search", "web.fetch", "web.evidence.write"],
  sideEffects: ["none", "write"],
  approvalPolicyId: "approval.none",
  memoryPolicyId: "memory.none",
  trustLevel: "core",
  tags: ["search", "extraction", "test"],
});
