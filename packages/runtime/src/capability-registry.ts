import {
  capabilityDefinitionSchema,
  type CapabilityDefinition,
  type CapabilityId,
  type CapabilityManifest,
} from "@pap/contracts";
import { createRuntimeSafeError, runtimeErrorCodes } from "./errors.js";

export class CapabilityRegistry {
  private readonly capabilities = new Map<CapabilityId, CapabilityDefinition>();

  register(definitionInput: CapabilityDefinition): CapabilityDefinition {
    const definition = capabilityDefinitionSchema.parse(definitionInput);
    const capabilityId = definition.manifest.id;

    if (this.capabilities.has(capabilityId)) {
      throw createRuntimeSafeError({
        code: runtimeErrorCodes.capabilityAlreadyRegistered,
        message: `Capability is already registered: ${capabilityId}`,
        category: "capability",
        details: { capabilityId },
      });
    }

    this.capabilities.set(capabilityId, definition);
    return definition;
  }

  get(capabilityId: CapabilityId): CapabilityDefinition {
    const capability = this.capabilities.get(capabilityId);

    if (!capability) {
      throw createRuntimeSafeError({
        code: runtimeErrorCodes.capabilityNotFound,
        message: `Capability is not registered: ${capabilityId}`,
        category: "capability",
        details: { capabilityId },
      });
    }

    return capability;
  }

  listManifests(): CapabilityManifest[] {
    return Array.from(this.capabilities.values(), (capability) => capability.manifest);
  }
}
