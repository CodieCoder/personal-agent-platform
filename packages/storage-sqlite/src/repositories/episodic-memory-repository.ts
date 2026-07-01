import {
  createEpisodicMemoryRequestSchema,
  episodicMemoryQuerySchema,
  episodicMemoryRecordSchema,
  jsonArraySchema,
  updateEpisodicMemoryRequestSchema,
  type EpisodicMemoryQuery,
  type EpisodicMemoryRecord,
  type JsonValue,
  type MemoryId,
} from "@pap/contracts";
import { createId, nowIso } from "@pap/shared";
import type {
  CreateEpisodicMemoryInput,
  EpisodicMemoryRepository,
  MarkEpisodicMemoryExpiredInput,
  SoftDeleteEpisodicMemoryInput,
  UpdateEpisodicMemoryInput,
} from "@pap/storage";
import { and, desc, eq, gt, gte, isNull, lte, or, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { episodicMemory, type EpisodicMemoryRow } from "../schema/index.js";
import type * as sqliteSchema from "../schema/index.js";

type EpisodicMemoryInsert = typeof episodicMemory.$inferInsert;

export class SqliteEpisodicMemoryRepository implements EpisodicMemoryRepository {
  constructor(private readonly db: BetterSQLite3Database<typeof sqliteSchema>) {}

  async create(input: CreateEpisodicMemoryInput): Promise<EpisodicMemoryRecord> {
    const insert = toEpisodicMemoryInsert(input);

    await this.db.insert(episodicMemory).values(insert);

    const episode = await this.getById(insert.id);
    return requireEpisodicMemory(episode, insert.id);
  }

  async getById(id: MemoryId): Promise<EpisodicMemoryRecord | null> {
    const [row] = await this.db
      .select()
      .from(episodicMemory)
      .where(eq(episodicMemory.id, id))
      .limit(1);

    return row ? toEpisodicMemoryRecord(row) : null;
  }

  async list(
    queryInput: EpisodicMemoryQuery | undefined = undefined,
  ): Promise<EpisodicMemoryRecord[]> {
    const query = episodicMemoryQuerySchema.parse(queryInput ?? {});
    const filters = buildEpisodicMemoryFilters(query);

    const rows =
      filters.length > 0
        ? await this.db
            .select()
            .from(episodicMemory)
            .where(and(...filters))
            .orderBy(desc(episodicMemory.createdAt))
            .limit(query.limit)
            .offset(query.offset)
        : await this.db
            .select()
            .from(episodicMemory)
            .orderBy(desc(episodicMemory.createdAt))
            .limit(query.limit)
            .offset(query.offset);

    return rows.map(toEpisodicMemoryRecord);
  }

  async update(input: UpdateEpisodicMemoryInput): Promise<EpisodicMemoryRecord> {
    const parsed = updateEpisodicMemoryRequestSchema.parse({
      id: input.id,
      eventType: input.eventType,
      summary: input.summary,
      outcome: input.outcome,
      relatedEntities: input.relatedEntities,
      evidenceRefs: input.evidenceRefs,
      confidence: input.confidence,
      sensitivity: input.sensitivity,
      sourceRef: input.sourceRef,
      expiresAt: input.expiresAt,
    });
    const updates: Partial<EpisodicMemoryInsert> = {
      updatedAt: input.updatedAt ?? nowIso(),
    };

    if (parsed.eventType !== undefined) {
      updates.eventType = parsed.eventType;
    }

    if (parsed.summary !== undefined) {
      updates.summary = parsed.summary;
    }

    if (parsed.outcome !== undefined) {
      updates.outcome = parsed.outcome;
    }

    if (parsed.relatedEntities !== undefined) {
      updates.relatedEntitiesJson = JSON.stringify(parsed.relatedEntities);
    }

    if (parsed.evidenceRefs !== undefined) {
      updates.evidenceRefsJson = JSON.stringify(parsed.evidenceRefs);
    }

    if (parsed.confidence !== undefined) {
      updates.confidence = parsed.confidence;
    }

    if (parsed.sensitivity !== undefined) {
      updates.sensitivity = parsed.sensitivity;
    }

    if (parsed.sourceRef !== undefined) {
      updates.sourceRef = parsed.sourceRef;
    }

    if (parsed.expiresAt !== undefined) {
      updates.expiresAt = parsed.expiresAt;
    }

    await this.db.update(episodicMemory).set(updates).where(eq(episodicMemory.id, input.id));

    const episode = await this.getById(input.id);
    return requireEpisodicMemory(episode, input.id);
  }

  async markExpired(input: MarkEpisodicMemoryExpiredInput): Promise<EpisodicMemoryRecord> {
    const expiredAt = input.expiredAt ?? nowIso();

    await this.db
      .update(episodicMemory)
      .set({
        status: "expired",
        expiresAt: expiredAt,
        updatedAt: expiredAt,
      })
      .where(eq(episodicMemory.id, input.id));

    const episode = await this.getById(input.id);
    return requireEpisodicMemory(episode, input.id);
  }

  async softDelete(input: SoftDeleteEpisodicMemoryInput): Promise<EpisodicMemoryRecord> {
    const deletedAt = input.deletedAt ?? nowIso();

    await this.db
      .update(episodicMemory)
      .set({
        status: "deleted",
        updatedAt: deletedAt,
      })
      .where(eq(episodicMemory.id, input.id));

    const episode = await this.getById(input.id);
    return requireEpisodicMemory(episode, input.id);
  }
}

function toEpisodicMemoryInsert(input: CreateEpisodicMemoryInput): EpisodicMemoryInsert {
  const parsed = createEpisodicMemoryRequestSchema.parse({
    scope: input.scope,
    workspaceId: input.workspaceId,
    capabilityId: input.capabilityId,
    threadId: input.threadId,
    executionId: input.executionId,
    eventType: input.eventType,
    summary: input.summary,
    outcome: input.outcome,
    relatedEntities: input.relatedEntities,
    evidenceRefs: input.evidenceRefs,
    confidence: input.confidence,
    sensitivity: input.sensitivity,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    sourceCapabilityId: input.sourceCapabilityId,
    expiresAt: input.expiresAt,
  });
  const timestamp = input.createdAt ?? nowIso();

  return {
    id: input.id ?? createId("memory"),
    scope: parsed.scope,
    workspaceId: parsed.workspaceId ?? null,
    capabilityId: parsed.capabilityId ?? null,
    threadId: parsed.threadId ?? null,
    executionId: parsed.executionId ?? null,
    eventType: parsed.eventType,
    summary: parsed.summary,
    outcome: parsed.outcome ?? null,
    relatedEntitiesJson: JSON.stringify(parsed.relatedEntities),
    evidenceRefsJson: JSON.stringify(parsed.evidenceRefs),
    confidence: parsed.confidence,
    sensitivity: parsed.sensitivity,
    sourceType: parsed.sourceType,
    sourceRef: parsed.sourceRef ?? null,
    sourceCapabilityId: parsed.sourceCapabilityId ?? null,
    status: input.status ?? "active",
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
    expiresAt: parsed.expiresAt ?? null,
  };
}

function buildEpisodicMemoryFilters(query: EpisodicMemoryQuery): SQL[] {
  const filters: SQL[] = [eq(episodicMemory.status, query.status)];

  if (!query.includeExpired) {
    const expiryFilter = or(
      isNull(episodicMemory.expiresAt),
      gt(episodicMemory.expiresAt, nowIso()),
    );

    if (expiryFilter) {
      filters.push(expiryFilter);
    }
  }

  if (query.scope) {
    filters.push(eq(episodicMemory.scope, query.scope));
  }

  if (query.workspaceId) {
    filters.push(eq(episodicMemory.workspaceId, query.workspaceId));
  }

  if (query.capabilityId) {
    filters.push(eq(episodicMemory.capabilityId, query.capabilityId));
  }

  if (query.threadId) {
    filters.push(eq(episodicMemory.threadId, query.threadId));
  }

  if (query.executionId) {
    filters.push(eq(episodicMemory.executionId, query.executionId));
  }

  if (query.eventType) {
    filters.push(eq(episodicMemory.eventType, query.eventType));
  }

  if (query.sourceCapabilityId) {
    filters.push(eq(episodicMemory.sourceCapabilityId, query.sourceCapabilityId));
  }

  if (query.sensitivity) {
    filters.push(eq(episodicMemory.sensitivity, query.sensitivity));
  }

  if (query.confidenceMin !== undefined) {
    filters.push(gte(episodicMemory.confidence, query.confidenceMin));
  }

  if (query.confidenceMax !== undefined) {
    filters.push(lte(episodicMemory.confidence, query.confidenceMax));
  }

  if (query.createdFrom) {
    filters.push(gte(episodicMemory.createdAt, query.createdFrom));
  }

  if (query.createdTo) {
    filters.push(lte(episodicMemory.createdAt, query.createdTo));
  }

  return filters;
}

function toEpisodicMemoryRecord(row: EpisodicMemoryRow): EpisodicMemoryRecord {
  return episodicMemoryRecordSchema.parse({
    id: row.id,
    scope: row.scope,
    workspaceId: row.workspaceId ?? undefined,
    capabilityId: row.capabilityId ?? undefined,
    threadId: row.threadId ?? undefined,
    executionId: row.executionId ?? undefined,
    eventType: row.eventType,
    summary: row.summary,
    outcome: row.outcome ?? undefined,
    relatedEntities: parseJsonArray(row.relatedEntitiesJson),
    evidenceRefs: parseJsonArray(row.evidenceRefsJson),
    confidence: row.confidence,
    sensitivity: row.sensitivity,
    sourceType: row.sourceType,
    sourceRef: row.sourceRef ?? undefined,
    sourceCapabilityId: row.sourceCapabilityId ?? undefined,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt ?? undefined,
  });
}

function parseJsonArray(value: string): JsonValue[] {
  return jsonArraySchema.parse(JSON.parse(value));
}

function requireEpisodicMemory(
  memory: EpisodicMemoryRecord | null,
  id: MemoryId,
): EpisodicMemoryRecord {
  if (!memory) {
    throw new Error(`Episodic memory not found: ${id}`);
  }

  return memory;
}
