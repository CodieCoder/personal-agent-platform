import type { CapabilityId } from "@pap/contracts";

export type CapabilityRegistrySource = "core" | "trusted_local" | "trusted_git";

export type CapabilityRegistryRecord = {
  capabilityId: CapabilityId;
  version: string;
  displayName: string;
  source: CapabilityRegistrySource;
  enabled: boolean;
  registeredAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

export type UpsertCapabilityRegistryRecordInput = Omit<
  CapabilityRegistryRecord,
  "registeredAt" | "updatedAt"
>;

export interface CapabilityRegistryRepository {
  upsert(input: UpsertCapabilityRegistryRecordInput): Promise<CapabilityRegistryRecord>;
  getById(capabilityId: CapabilityId): Promise<CapabilityRegistryRecord | null>;
  list(): Promise<CapabilityRegistryRecord[]>;
  setEnabled(capabilityId: CapabilityId, enabled: boolean): Promise<CapabilityRegistryRecord>;
}
