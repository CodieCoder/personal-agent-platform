import {
  createSemanticMemoryRequestSchema,
  jsonArraySchema,
  semanticMemoryQuerySchema,
  semanticMemoryRecordSchema,
  updateSemanticMemoryRequestSchema,
  type JsonValue,
  type MemoryId,
  type SemanticMemoryQuery,
  type SemanticMemoryRecord,
} from "@pap/contracts";
import { createId, nowIso } from "@pap/shared";
import type {
  ApproveSemanticMemoryProposalInput,
  CreateSemanticMemoryInput,
  MarkSemanticMemoryExpiredInput,
  RejectSemanticMemoryProposalInput,
  SemanticMemoryRepository,
  SoftDeleteSemanticMemoryInput,
  SupersedeSemanticMemoryInput,
  SupersedeSemanticMemoryResult,
  UpdateSemanticMemoryInput,
} from "@pap/storage";
import { and, desc, eq, gt, gte, isNull, lte, or, type SQL } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { semanticMemory, type SemanticMemoryRow } from "../schema/index.js";
import type * as sqliteSchema from "../schema/index.js";

type SemanticMemoryInsert = typeof semanticMemory.$inferInsert;

export class SqliteSemanticMemoryRepository implements SemanticMemoryRepository {
  constructor(private readonly db: BetterSQLite3Database<typeof sqliteSchema>) {}

  async create(input: CreateSemanticMemoryInput): Promise<SemanticMemoryRecord> {
    const insert = toSemanticMemoryInsert(input);

    await this.db.insert(semanticMemory).values(insert);

    const memory = await this.getById(insert.id);
    return requireSemanticMemory(memory, insert.id);
  }

  async getById(id: MemoryId): Promise<SemanticMemoryRecord | null> {
    const [row] = await this.db
      .select()
      .from(semanticMemory)
      .where(eq(semanticMemory.id, id))
      .limit(1);

    return row ? toSemanticMemoryRecord(row) : null;
  }

  async list(
    queryInput: SemanticMemoryQuery | undefined = undefined,
  ): Promise<SemanticMemoryRecord[]> {
    const query = semanticMemoryQuerySchema.parse(queryInput ?? {});
    const filters = buildSemanticMemoryFilters(query);

    const rows =
      filters.length > 0
        ? await this.db
            .select()
            .from(semanticMemory)
            .where(and(...filters))
            .orderBy(desc(semanticMemory.updatedAt))
            .limit(query.limit)
            .offset(query.offset)
        : await this.db
            .select()
            .from(semanticMemory)
            .orderBy(desc(semanticMemory.updatedAt))
            .limit(query.limit)
            .offset(query.offset);

    return rows.map(toSemanticMemoryRecord);
  }

  async update(input: UpdateSemanticMemoryInput): Promise<SemanticMemoryRecord> {
    const parsed = updateSemanticMemoryRequestSchema.parse({
      id: input.id,
      subject: input.subject,
      predicate: input.predicate,
      value: input.value,
      confidence: input.confidence,
      sensitivity: input.sensitivity,
      sourceRef: input.sourceRef,
      evidenceRefs: input.evidenceRefs,
      expiresAt: input.expiresAt,
    });
    const updates: Partial<SemanticMemoryInsert> = {
      updatedAt: input.updatedAt ?? nowIso(),
    };

    if (parsed.subject !== undefined) {
      updates.subject = parsed.subject;
    }

    if (parsed.predicate !== undefined) {
      updates.predicate = parsed.predicate;
    }

    if (parsed.value !== undefined) {
      updates.valueJson = JSON.stringify(parsed.value);
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

    if (parsed.evidenceRefs !== undefined) {
      updates.evidenceRefsJson = JSON.stringify(parsed.evidenceRefs);
    }

    if (parsed.expiresAt !== undefined) {
      updates.expiresAt = parsed.expiresAt;
    }

    await this.db.update(semanticMemory).set(updates).where(eq(semanticMemory.id, input.id));

    const memory = await this.getById(input.id);
    return requireSemanticMemory(memory, input.id);
  }

  async supersede(input: SupersedeSemanticMemoryInput): Promise<SupersedeSemanticMemoryResult> {
    return this.db.transaction((tx) => {
      const [existing] = tx
        .select()
        .from(semanticMemory)
        .where(eq(semanticMemory.id, input.id))
        .limit(1)
        .all();

      if (!existing) {
        throw new Error(`Semantic memory not found: ${input.id}`);
      }

      const timestamp = input.supersededAt ?? nowIso();
      const replacementInsert = toSemanticMemoryInsert({
        ...input.replacement,
        status: "active",
        supersedesMemoryId: input.id,
        createdAt: input.replacement.createdAt ?? timestamp,
        updatedAt: input.replacement.updatedAt ?? timestamp,
      });

      tx.insert(semanticMemory).values(replacementInsert).run();
      tx.update(semanticMemory)
        .set({
          status: "superseded",
          supersededByMemoryId: replacementInsert.id,
          updatedAt: timestamp,
        })
        .where(eq(semanticMemory.id, input.id))
        .run();

      const [previousRow] = tx
        .select()
        .from(semanticMemory)
        .where(eq(semanticMemory.id, input.id))
        .limit(1)
        .all();
      const [replacementRow] = tx
        .select()
        .from(semanticMemory)
        .where(eq(semanticMemory.id, replacementInsert.id))
        .limit(1)
        .all();

      if (!previousRow || !replacementRow) {
        throw new Error(`Semantic memory supersede failed for: ${input.id}`);
      }

      return {
        previous: toSemanticMemoryRecord(previousRow),
        replacement: toSemanticMemoryRecord(replacementRow),
      };
    });
  }

  async approveProposal(input: ApproveSemanticMemoryProposalInput): Promise<SemanticMemoryRecord> {
    return this.db.transaction((tx) => {
      const [proposal] = tx
        .select()
        .from(semanticMemory)
        .where(eq(semanticMemory.id, input.id))
        .limit(1)
        .all();

      if (!proposal) {
        throw new Error(`Semantic memory not found: ${input.id}`);
      }

      if (proposal.status !== "proposed") {
        throw new Error(`Semantic memory is not proposed: ${input.id}`);
      }

      const timestamp = input.approvedAt ?? nowIso();

      if (proposal.supersedesMemoryId) {
        const [previous] = tx
          .select()
          .from(semanticMemory)
          .where(eq(semanticMemory.id, proposal.supersedesMemoryId))
          .limit(1)
          .all();

        if (!previous) {
          throw new Error(`Semantic memory superseded target not found: ${proposal.id}`);
        }

        if (previous.status !== "active") {
          throw new Error(`Semantic memory superseded target is not active: ${previous.id}`);
        }

        tx.update(semanticMemory)
          .set({
            status: "superseded",
            supersededByMemoryId: proposal.id,
            updatedAt: timestamp,
          })
          .where(eq(semanticMemory.id, previous.id))
          .run();
      }

      tx.update(semanticMemory)
        .set({
          status: "active",
          updatedAt: timestamp,
        })
        .where(eq(semanticMemory.id, proposal.id))
        .run();

      const [approved] = tx
        .select()
        .from(semanticMemory)
        .where(eq(semanticMemory.id, proposal.id))
        .limit(1)
        .all();

      if (!approved) {
        throw new Error(`Semantic memory approval failed for: ${input.id}`);
      }

      return toSemanticMemoryRecord(approved);
    });
  }

  async rejectProposal(input: RejectSemanticMemoryProposalInput): Promise<SemanticMemoryRecord> {
    return this.db.transaction((tx) => {
      const [proposal] = tx
        .select()
        .from(semanticMemory)
        .where(eq(semanticMemory.id, input.id))
        .limit(1)
        .all();

      if (!proposal) {
        throw new Error(`Semantic memory not found: ${input.id}`);
      }

      if (proposal.status !== "proposed") {
        throw new Error(`Semantic memory is not proposed: ${input.id}`);
      }

      const timestamp = input.rejectedAt ?? nowIso();

      tx.update(semanticMemory)
        .set({
          status: "rejected",
          updatedAt: timestamp,
        })
        .where(eq(semanticMemory.id, proposal.id))
        .run();

      const [rejected] = tx
        .select()
        .from(semanticMemory)
        .where(eq(semanticMemory.id, proposal.id))
        .limit(1)
        .all();

      if (!rejected) {
        throw new Error(`Semantic memory rejection failed for: ${input.id}`);
      }

      return toSemanticMemoryRecord(rejected);
    });
  }

  async markExpired(input: MarkSemanticMemoryExpiredInput): Promise<SemanticMemoryRecord> {
    const expiredAt = input.expiredAt ?? nowIso();

    await this.db
      .update(semanticMemory)
      .set({
        status: "expired",
        expiresAt: expiredAt,
        updatedAt: expiredAt,
      })
      .where(eq(semanticMemory.id, input.id));

    const memory = await this.getById(input.id);
    return requireSemanticMemory(memory, input.id);
  }

  async softDelete(input: SoftDeleteSemanticMemoryInput): Promise<SemanticMemoryRecord> {
    const deletedAt = input.deletedAt ?? nowIso();

    await this.db
      .update(semanticMemory)
      .set({
        status: "deleted",
        updatedAt: deletedAt,
      })
      .where(eq(semanticMemory.id, input.id));

    const memory = await this.getById(input.id);
    return requireSemanticMemory(memory, input.id);
  }
}

function toSemanticMemoryInsert(input: CreateSemanticMemoryInput): SemanticMemoryInsert {
  const parsed = createSemanticMemoryRequestSchema.parse({
    scope: input.scope,
    workspaceId: input.workspaceId,
    capabilityId: input.capabilityId,
    threadId: input.threadId,
    subject: input.subject,
    predicate: input.predicate,
    value: input.value,
    confidence: input.confidence,
    sensitivity: input.sensitivity,
    sourceType: input.sourceType,
    sourceRef: input.sourceRef,
    sourceExecutionId: input.sourceExecutionId,
    sourceCapabilityId: input.sourceCapabilityId,
    createdBy: input.createdBy,
    evidenceRefs: input.evidenceRefs,
    expiresAt: input.expiresAt,
  });
  const timestamp = input.createdAt ?? nowIso();

  return {
    id: input.id ?? createId("memory"),
    scope: parsed.scope,
    workspaceId: parsed.workspaceId ?? null,
    capabilityId: parsed.capabilityId ?? null,
    threadId: parsed.threadId ?? null,
    subject: parsed.subject,
    predicate: parsed.predicate,
    valueJson: JSON.stringify(parsed.value),
    confidence: parsed.confidence,
    sensitivity: parsed.sensitivity,
    sourceType: parsed.sourceType,
    sourceRef: parsed.sourceRef ?? null,
    sourceExecutionId: parsed.sourceExecutionId ?? null,
    sourceCapabilityId: parsed.sourceCapabilityId ?? null,
    createdBy: parsed.createdBy,
    evidenceRefsJson: JSON.stringify(parsed.evidenceRefs),
    status: input.status ?? "active",
    supersedesMemoryId: input.supersedesMemoryId ?? null,
    supersededByMemoryId: input.supersededByMemoryId ?? null,
    createdAt: timestamp,
    updatedAt: input.updatedAt ?? timestamp,
    expiresAt: parsed.expiresAt ?? null,
  };
}

function buildSemanticMemoryFilters(query: SemanticMemoryQuery): SQL[] {
  const filters: SQL[] = [eq(semanticMemory.status, query.status)];

  if (!query.includeExpired) {
    const expiryFilter = or(
      isNull(semanticMemory.expiresAt),
      gt(semanticMemory.expiresAt, nowIso()),
    );

    if (expiryFilter) {
      filters.push(expiryFilter);
    }
  }

  if (query.scope) {
    filters.push(eq(semanticMemory.scope, query.scope));
  }

  if (query.workspaceId) {
    filters.push(eq(semanticMemory.workspaceId, query.workspaceId));
  }

  if (query.capabilityId) {
    filters.push(eq(semanticMemory.capabilityId, query.capabilityId));
  }

  if (query.threadId) {
    filters.push(eq(semanticMemory.threadId, query.threadId));
  }

  if (query.subject) {
    filters.push(eq(semanticMemory.subject, query.subject));
  }

  if (query.predicate) {
    filters.push(eq(semanticMemory.predicate, query.predicate));
  }

  if (query.sourceExecutionId) {
    filters.push(eq(semanticMemory.sourceExecutionId, query.sourceExecutionId));
  }

  if (query.sourceCapabilityId) {
    filters.push(eq(semanticMemory.sourceCapabilityId, query.sourceCapabilityId));
  }

  if (query.sensitivity) {
    filters.push(eq(semanticMemory.sensitivity, query.sensitivity));
  }

  if (query.confidenceMin !== undefined) {
    filters.push(gte(semanticMemory.confidence, query.confidenceMin));
  }

  if (query.confidenceMax !== undefined) {
    filters.push(lte(semanticMemory.confidence, query.confidenceMax));
  }

  if (query.createdFrom) {
    filters.push(gte(semanticMemory.createdAt, query.createdFrom));
  }

  if (query.createdTo) {
    filters.push(lte(semanticMemory.createdAt, query.createdTo));
  }

  return filters;
}

function toSemanticMemoryRecord(row: SemanticMemoryRow): SemanticMemoryRecord {
  return semanticMemoryRecordSchema.parse({
    id: row.id,
    scope: row.scope,
    workspaceId: row.workspaceId ?? undefined,
    capabilityId: row.capabilityId ?? undefined,
    threadId: row.threadId ?? undefined,
    subject: row.subject,
    predicate: row.predicate,
    value: parseJsonValue(row.valueJson),
    confidence: row.confidence,
    sensitivity: row.sensitivity,
    sourceType: row.sourceType,
    sourceRef: row.sourceRef ?? undefined,
    sourceExecutionId: row.sourceExecutionId ?? undefined,
    sourceCapabilityId: row.sourceCapabilityId ?? undefined,
    createdBy: row.createdBy,
    evidenceRefs: parseJsonArray(row.evidenceRefsJson),
    status: row.status,
    supersedesMemoryId: row.supersedesMemoryId ?? undefined,
    supersededByMemoryId: row.supersededByMemoryId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt ?? undefined,
  });
}

function parseJsonValue(value: string): JsonValue {
  return JSON.parse(value) as JsonValue;
}

function parseJsonArray(value: string): JsonValue[] {
  return jsonArraySchema.parse(JSON.parse(value));
}

function requireSemanticMemory(
  memory: SemanticMemoryRecord | null,
  id: MemoryId,
): SemanticMemoryRecord {
  if (!memory) {
    throw new Error(`Semantic memory not found: ${id}`);
  }

  return memory;
}
