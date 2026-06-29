import { capabilityManifestSchema } from "@pap/contracts";

export const echoManifest = capabilityManifestSchema.parse({
  id: "capability.echo",
  version: "0.1.0",
  name: "Echo",
  description: "Returns a whitespace-normalized copy of the input message.",
  skill: {
    id: "skill.echo",
    version: "0.1.0",
    path: "./skills/echo",
  },
  inputSchemaId: "capability.echo.input.v1",
  outputSchemaId: "capability.echo.output.v1",
  allowedTools: [],
  allowedChildCapabilities: [],
  supportedUiBlocks: [],
  permissions: [],
  sideEffects: ["none"],
  approvalPolicyId: "approval.none",
  memoryPolicyId: "memory.none",
  trustLevel: "core",
  tags: ["echo", "core"],
});
