import type {
  ListSourceProfilesQuery,
  SourceProfile,
  SourceProfileDomain,
  SourceProfileId,
} from "@pap/contracts";
import {
  createSourceProfileRequestSchema,
  listSourceProfilesQuerySchema,
  sourceProfileDomainSchema,
  sourceProfileSchema,
  updateSourceProfileRequestSchema,
} from "@pap/contracts";
import { createId, nowIso } from "@pap/shared";
import type {
  ArchiveSourceProfileInput,
  CreateSourceProfileInput,
  ListSourceProfilesInput,
  SourceProfileRepository,
  UpdateSourceProfileInput,
} from "@pap/storage";
import { and, desc, eq, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as sqliteSchema from "../schema/index.js";
import { type SourceProfileRow, sourceProfiles } from "../schema/index.js";

type SourceProfileInsert = typeof sourceProfiles.$inferInsert;

export class SqliteSourceProfileRepository implements SourceProfileRepository {
  constructor(private readonly db: BetterSQLite3Database<typeof sqliteSchema>) {}

  async create(input: CreateSourceProfileInput): Promise<SourceProfile> {
    const parsed = createSourceProfileRequestSchema.parse({
      domain: input.domain,
      name: input.name,
      articleContainerSelector: input.articleContainerSelector,
      titleSelector: input.titleSelector,
      bylineSelector: input.bylineSelector,
      publishedAtSelector: input.publishedAtSelector,
      contentSelector: input.contentSelector,
      canonicalUrlSelector: input.canonicalUrlSelector,
      notes: input.notes,
    });
    const timestamp = input.createdAt ?? nowIso();
    const id = input.id ?? createId("source_profile");

    await this.db.insert(sourceProfiles).values({
      id,
      domain: parsed.domain,
      name: parsed.name,
      status: "active",
      articleContainerSelector: parsed.articleContainerSelector,
      titleSelector: parsed.titleSelector,
      bylineSelector: parsed.bylineSelector,
      publishedAtSelector: parsed.publishedAtSelector,
      contentSelector: parsed.contentSelector,
      canonicalUrlSelector: parsed.canonicalUrlSelector,
      notes: parsed.notes,
      createdAt: timestamp,
      updatedAt: input.updatedAt ?? timestamp,
      archivedAt: null,
    });

    const profile = await this.getById(id);
    return requireSourceProfile(profile, id);
  }

  async getById(id: SourceProfileId): Promise<SourceProfile | null> {
    const [row] = await this.db
      .select()
      .from(sourceProfiles)
      .where(eq(sourceProfiles.id, id))
      .limit(1);

    return row ? toSourceProfile(row) : null;
  }

  async getActiveByDomain(domain: SourceProfileDomain): Promise<SourceProfile | null> {
    const normalizedDomain = sourceProfileDomainSchema.parse(domain);
    const [row] = await this.db
      .select()
      .from(sourceProfiles)
      .where(and(eq(sourceProfiles.domain, normalizedDomain), eq(sourceProfiles.status, "active")))
      .limit(1);

    return row ? toSourceProfile(row) : null;
  }

  async list(input: ListSourceProfilesInput = {}): Promise<SourceProfile[]> {
    const query = listSourceProfilesQuerySchema.parse(input);
    const filters = buildSourceProfileFilters(query);

    const rows =
      filters.length > 0
        ? await this.db
            .select()
            .from(sourceProfiles)
            .where(and(...filters))
            .orderBy(desc(sourceProfiles.updatedAt))
            .limit(query.limit)
            .offset(query.offset)
        : await this.db
            .select()
            .from(sourceProfiles)
            .orderBy(desc(sourceProfiles.updatedAt))
            .limit(query.limit)
            .offset(query.offset);

    return rows.map(toSourceProfile);
  }

  async update(input: UpdateSourceProfileInput): Promise<SourceProfile> {
    const parsed = updateSourceProfileRequestSchema.parse({
      id: input.id,
      domain: input.domain,
      name: input.name,
      articleContainerSelector: input.articleContainerSelector,
      titleSelector: input.titleSelector,
      bylineSelector: input.bylineSelector,
      publishedAtSelector: input.publishedAtSelector,
      contentSelector: input.contentSelector,
      canonicalUrlSelector: input.canonicalUrlSelector,
      notes: input.notes,
    });
    const updates: Partial<SourceProfileInsert> = {
      updatedAt: input.updatedAt ?? nowIso(),
    };

    if (parsed.domain !== undefined) {
      updates.domain = parsed.domain;
    }

    if (parsed.name !== undefined) {
      updates.name = parsed.name;
    }

    if (parsed.articleContainerSelector !== undefined) {
      updates.articleContainerSelector = parsed.articleContainerSelector;
    }

    if (parsed.titleSelector !== undefined) {
      updates.titleSelector = parsed.titleSelector;
    }

    if (parsed.bylineSelector !== undefined) {
      updates.bylineSelector = parsed.bylineSelector;
    }

    if (parsed.publishedAtSelector !== undefined) {
      updates.publishedAtSelector = parsed.publishedAtSelector;
    }

    if (parsed.contentSelector !== undefined) {
      updates.contentSelector = parsed.contentSelector;
    }

    if (parsed.canonicalUrlSelector !== undefined) {
      updates.canonicalUrlSelector = parsed.canonicalUrlSelector;
    }

    if (parsed.notes !== undefined) {
      updates.notes = parsed.notes;
    }

    await this.db.update(sourceProfiles).set(updates).where(eq(sourceProfiles.id, input.id));

    const profile = await this.getById(input.id);
    return requireSourceProfile(profile, input.id);
  }

  async archive(input: ArchiveSourceProfileInput): Promise<SourceProfile> {
    const archivedAt = input.archivedAt ?? nowIso();

    await this.db
      .update(sourceProfiles)
      .set({
        status: "archived",
        archivedAt,
        updatedAt: archivedAt,
      })
      .where(eq(sourceProfiles.id, input.id));

    const profile = await this.getById(input.id);
    return requireSourceProfile(profile, input.id);
  }
}

function buildSourceProfileFilters(query: ListSourceProfilesQuery): SQL[] {
  const filters: SQL[] = [];

  if (!query.includeArchived) {
    filters.push(eq(sourceProfiles.status, "active"));
  }

  if (query.domain !== undefined) {
    filters.push(eq(sourceProfiles.domain, query.domain));
  }

  return filters;
}

function toSourceProfile(row: SourceProfileRow): SourceProfile {
  return sourceProfileSchema.parse({
    id: row.id,
    domain: row.domain,
    name: row.name,
    status: row.status,
    articleContainerSelector: row.articleContainerSelector,
    titleSelector: row.titleSelector,
    bylineSelector: row.bylineSelector,
    publishedAtSelector: row.publishedAtSelector,
    contentSelector: row.contentSelector,
    canonicalUrlSelector: row.canonicalUrlSelector,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  });
}

function requireSourceProfile(profile: SourceProfile | null, id: SourceProfileId): SourceProfile {
  if (!profile) {
    throw new Error(`Source profile not found: ${id}`);
  }

  return profile;
}
