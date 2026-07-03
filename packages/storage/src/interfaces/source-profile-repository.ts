import type {
  SourceProfile,
  SourceProfileDomain,
  SourceProfileId,
  SourceProfileSelector,
} from "@pap/contracts";

export type CreateSourceProfileInput = {
  id?: SourceProfileId;
  domain: SourceProfileDomain;
  name: string;
  articleContainerSelector?: SourceProfileSelector | null;
  titleSelector?: SourceProfileSelector | null;
  bylineSelector?: SourceProfileSelector | null;
  publishedAtSelector?: SourceProfileSelector | null;
  contentSelector?: SourceProfileSelector | null;
  canonicalUrlSelector?: SourceProfileSelector | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ListSourceProfilesInput = {
  includeArchived?: boolean;
  domain?: SourceProfileDomain;
  limit?: number;
  offset?: number;
};

export type UpdateSourceProfileInput = {
  id: SourceProfileId;
  domain?: SourceProfileDomain;
  name?: string;
  articleContainerSelector?: SourceProfileSelector | null;
  titleSelector?: SourceProfileSelector | null;
  bylineSelector?: SourceProfileSelector | null;
  publishedAtSelector?: SourceProfileSelector | null;
  contentSelector?: SourceProfileSelector | null;
  canonicalUrlSelector?: SourceProfileSelector | null;
  notes?: string | null;
  updatedAt?: string;
};

export type ArchiveSourceProfileInput = {
  id: SourceProfileId;
  archivedAt?: string;
};

export interface SourceProfileRepository {
  create(input: CreateSourceProfileInput): Promise<SourceProfile>;
  getById(id: SourceProfileId): Promise<SourceProfile | null>;
  getActiveByDomain(domain: SourceProfileDomain): Promise<SourceProfile | null>;
  list(input?: ListSourceProfilesInput): Promise<SourceProfile[]>;
  update(input: UpdateSourceProfileInput): Promise<SourceProfile>;
  archive(input: ArchiveSourceProfileInput): Promise<SourceProfile>;
}
