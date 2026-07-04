import { z } from "zod";
import {
  executionIdSchema,
  isoDateTimeSchema,
  opaqueIdentifierSchema,
  workspaceIdSchema,
} from "./common.js";
import { jsonValueSchema, type JsonValue } from "./memory.js";
import {
  httpOrHttpsSearchUrlSchema,
  searchCategorySchema,
  searchLanguageSchema,
  searchProviderIdSchema,
  searchQuerySchema,
} from "./search.js";
import { webEvidenceIdSchema } from "./web-evidence.js";

export const researchReportIdSchema = opaqueIdentifierSchema;
export const researchSourceIdSchema = opaqueIdentifierSchema;
export const researchCitationIdSchema = opaqueIdentifierSchema;
export const researchFindingIdSchema = opaqueIdentifierSchema;
export const researchQueryPlanIdSchema = opaqueIdentifierSchema;
export const researchQueryIdSchema = opaqueIdentifierSchema;
export const researchAnalysisClaimIdSchema = opaqueIdentifierSchema;

export const researchModeSchema = z.enum(["quick", "standard", "deep"]);

export const researchTimeRangeSchema = z.enum(["day", "week", "month", "year", "all"]);

export const researchMemoryProposalModeSchema = z.enum(["none", "propose"]);

export const researchReportStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "completed_with_warnings",
  "failed",
  "cancelled",
]);

export const researchSourceStatusSchema = z.enum([
  "selected",
  "fetch_failed",
  "extraction_failed",
  "extracted",
  "analysis_failed",
  "analyzed",
  "excluded",
]);

export const researchFindingKindSchema = z.enum(["sourced_fact", "synthesis", "uncertainty"]);

export const researchQueryPlanReasonSchema = z.enum([
  "primary",
  "focus_variant",
  "time_range_variant",
  "focus_time_range_variant",
]);

export const researchCandidateProvenanceRoleSchema = z.enum(["primary", "duplicate"]);

export const researchCandidatePoolExclusionReasonSchema = z.enum([
  "candidate_url_invalid",
  "candidate_title_missing",
  "candidate_pool_truncated",
  "search_evidence_failed",
]);

export const researchSourceSelectionReasonSchema = z.enum(["domain_diversity", "budget_fill"]);

export const researchSourceSelectionExclusionReasonSchema = z.enum([
  "duplicate_canonical_url",
  "budget_exhausted",
  "domain_diversity_deferred",
  "candidate_invalid",
  "extraction_failed",
]);

export const researchConfidenceSchema = z.number().finite().min(0).max(1);

export const researchScoreSchema = z.number().finite().min(0).max(1);

const researchQuestionSchema = z.string().trim().min(1).max(2_000);
const researchFocusSchema = z.string().trim().min(1).max(1_000);
const researchTitleSchema = z.string().trim().min(1).max(500);
const researchSummaryTextSchema = z.string().trim().min(1).max(8_000);
const researchClaimTextSchema = z.string().trim().min(1).max(2_000);
const researchExcerptSchema = z.string().trim().min(1).max(2_000);
const researchMessageSchema = z.string().trim().min(1).max(1_000);
const researchHostnameSchema = z.string().trim().min(1).max(253);
const researchCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z][a-z0-9_]*$/u, {
    message: "Research codes must use lower snake case.",
  });

const nullableWorkspaceIdSchema = workspaceIdSchema.nullable();

const unsafeDetailsKeyPattern =
  /(?:authorization|cookie|headers?|html|prompt|raw[_-]?(?:model|output|text)|reasoning|chain[_-]?of[_-]?thought)/iu;

const safeDetailsKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((key) => !unsafeDetailsKeyPattern.test(key), {
    message:
      "Research details must not include unsafe raw, prompt, reasoning, header, or HTML keys.",
  });

export const researchSafeDetailsSchema = z
  .record(safeDetailsKeySchema, jsonValueSchema)
  .refine((details) => Object.keys(details).length <= 25, {
    message: "Research details may include at most 25 keys.",
  })
  .superRefine(validateSafeDetails);

export const researchWarningSchema = z
  .object({
    code: researchCodeSchema,
    message: researchMessageSchema,
    sourceId: researchSourceIdSchema.optional(),
    evidenceId: webEvidenceIdSchema.optional(),
    details: researchSafeDetailsSchema.optional(),
  })
  .strict();

export const researchErrorSchema = z
  .object({
    kind: researchCodeSchema,
    message: researchMessageSchema,
    retryable: z.boolean().default(false),
    sourceId: researchSourceIdSchema.optional(),
    evidenceId: webEvidenceIdSchema.optional(),
    details: researchSafeDetailsSchema.optional(),
  })
  .strict();

export const researchRequestSchema = z
  .object({
    question: researchQuestionSchema,
    workspaceId: nullableWorkspaceIdSchema.default(null),
    focus: researchFocusSchema.nullable().default(null),
    timeRange: researchTimeRangeSchema.nullable().default(null),
    maxSources: z.number().int().min(1).max(15).nullable().default(null),
    maxSearchResults: z.number().int().min(1).max(50).nullable().default(null),
    language: searchLanguageSchema.nullable().default(null),
    categories: z.array(searchCategorySchema).max(8).nullable().default(null),
    memoryProposalMode: researchMemoryProposalModeSchema.nullable().default(null),
  })
  .strict();

export const researchQueryPlanItemSchema = z
  .object({
    queryId: researchQueryIdSchema,
    query: searchQuerySchema,
    focus: researchFocusSchema.nullable().default(null),
    timeRange: researchTimeRangeSchema.nullable().default(null),
    reason: researchQueryPlanReasonSchema.default("primary"),
    language: searchLanguageSchema.nullable().default(null),
    categories: z.array(searchCategorySchema).max(8).nullable().default(null),
    warnings: z.array(researchWarningSchema).max(25).default([]),
  })
  .strict();

export const researchQueryPlanSchema = z
  .object({
    id: researchQueryPlanIdSchema,
    question: researchQuestionSchema,
    mode: researchModeSchema.default("standard"),
    queries: z.array(researchQueryPlanItemSchema).min(1).max(8),
    warnings: z.array(researchWarningSchema).max(25).default([]),
    createdAt: isoDateTimeSchema,
  })
  .strict();

export const researchCandidateProvenanceSchema = z
  .object({
    queryId: researchQueryIdSchema,
    query: searchQuerySchema,
    searchEvidenceId: webEvidenceIdSchema.nullable().default(null),
    searchResultIndex: z.number().int().nonnegative().max(49),
    providerId: searchProviderIdSchema.nullable().default(null),
    engine: z.string().trim().min(1).max(120).nullable().default(null),
    category: z.string().trim().min(1).max(80).nullable().default(null),
    score: z.number().finite().nonnegative().nullable().default(null),
    role: researchCandidateProvenanceRoleSchema,
  })
  .strict();

export const researchCandidateDeduplicationSchema = z
  .object({
    sourceId: researchSourceIdSchema,
    canonicalUrl: httpOrHttpsSearchUrlSchema,
    duplicateQueryId: researchQueryIdSchema,
    duplicateSearchEvidenceId: webEvidenceIdSchema.nullable().default(null),
    duplicateSearchResultIndex: z.number().int().nonnegative().max(49),
    reason: z.literal("duplicate_canonical_url"),
  })
  .strict();

export const researchCandidatePoolExclusionSchema = z
  .object({
    queryId: researchQueryIdSchema,
    searchEvidenceId: webEvidenceIdSchema.nullable().default(null),
    searchResultIndex: z.number().int().nonnegative().max(49).nullable().default(null),
    urlFingerprint: z.string().trim().min(8).max(80).nullable().default(null),
    canonicalUrl: httpOrHttpsSearchUrlSchema.nullable().default(null),
    reason: researchCandidatePoolExclusionReasonSchema,
    details: researchSafeDetailsSchema.optional(),
  })
  .strict();

export const normalizedResearchCandidateSourceSchema = z
  .object({
    sourceId: researchSourceIdSchema,
    candidateRank: z.number().int().min(1).max(50),
    canonicalUrl: httpOrHttpsSearchUrlSchema,
    normalizedHostname: researchHostnameSchema,
    url: httpOrHttpsSearchUrlSchema,
    title: researchTitleSchema,
    displayUrl: z.string().trim().min(1).max(500).nullable().default(null),
    snippet: z.string().trim().max(5_000).nullable().default(null),
    publishedAt: isoDateTimeSchema.nullable().default(null),
    firstSeenQueryIndex: z.number().int().nonnegative().max(7),
    firstSeenResultIndex: z.number().int().nonnegative().max(49),
    providerId: searchProviderIdSchema.nullable().default(null),
    engine: z.string().trim().min(1).max(120).nullable().default(null),
    category: z.string().trim().min(1).max(80).nullable().default(null),
    providerScore: z.number().finite().nonnegative().nullable().default(null),
    provenance: z.array(researchCandidateProvenanceSchema).min(1).max(50),
    duplicateCount: z.number().int().nonnegative().max(50).default(0),
    warnings: z.array(researchWarningSchema).max(25).default([]),
  })
  .strict()
  .superRefine(validateNormalizedResearchCandidate);

export const researchCandidatePoolSchema = z
  .object({
    queryPlanId: researchQueryPlanIdSchema,
    candidates: z.array(normalizedResearchCandidateSourceSchema).max(50),
    deduplications: z.array(researchCandidateDeduplicationSchema).max(50).default([]),
    exclusions: z.array(researchCandidatePoolExclusionSchema).max(50).default([]),
    warnings: z.array(researchWarningSchema).max(50).default([]),
  })
  .strict();

export const researchCandidateSourceSchema = z
  .object({
    sourceId: researchSourceIdSchema,
    searchEvidenceId: webEvidenceIdSchema,
    searchResultIndex: z.number().int().nonnegative().max(49),
    title: researchTitleSchema,
    url: httpOrHttpsSearchUrlSchema,
    displayUrl: z.string().trim().min(1).max(500).nullable().default(null),
    snippet: z.string().trim().max(5_000).nullable().default(null),
    publishedAt: isoDateTimeSchema.nullable().default(null),
    engine: z.string().trim().min(1).max(120).nullable().default(null),
    category: z.string().trim().min(1).max(80).nullable().default(null),
    providerId: searchProviderIdSchema.nullable().default(null),
    providerScore: z.number().finite().nonnegative().nullable().default(null),
    warnings: z.array(researchWarningSchema).max(25).default([]),
  })
  .strict();

export const researchSelectedCandidateSourceSchema = z
  .object({
    sourceId: researchSourceIdSchema,
    candidateRank: z.number().int().min(1).max(50),
    selectionRank: z.number().int().min(1).max(15),
    canonicalUrl: httpOrHttpsSearchUrlSchema,
    normalizedHostname: researchHostnameSchema,
    url: httpOrHttpsSearchUrlSchema,
    title: researchTitleSchema,
    publishedAt: isoDateTimeSchema.nullable().default(null),
    queryId: researchQueryIdSchema,
    searchEvidenceId: webEvidenceIdSchema.nullable().default(null),
    firstSeenResultIndex: z.number().int().nonnegative().max(49),
    reason: researchSourceSelectionReasonSchema,
    warnings: z.array(researchWarningSchema).max(25).default([]),
  })
  .strict();

export const researchSourceSelectionExclusionSchema = z
  .object({
    sourceId: researchSourceIdSchema.nullable().default(null),
    candidateRank: z.number().int().min(1).max(50).nullable().default(null),
    canonicalUrl: httpOrHttpsSearchUrlSchema.nullable().default(null),
    normalizedHostname: researchHostnameSchema.nullable().default(null),
    reason: researchSourceSelectionExclusionReasonSchema,
    details: researchSafeDetailsSchema.optional(),
  })
  .strict();

export const researchSourceSelectionSchema = z
  .object({
    queryPlanId: researchQueryPlanIdSchema,
    requestedSourceCount: z.number().int().min(1).max(15),
    extractionBudget: z.number().int().min(0).max(15),
    selected: z.array(researchSelectedCandidateSourceSchema).max(15),
    exclusions: z.array(researchSourceSelectionExclusionSchema).max(50).default([]),
    warnings: z.array(researchWarningSchema).max(25).default([]),
  })
  .strict()
  .superRefine(validateResearchSourceSelection);

export const researchAnalysisClaimSchema = z
  .object({
    claimId: researchAnalysisClaimIdSchema,
    claimText: researchClaimTextSchema,
    sourceExcerpt: researchExcerptSchema.nullable().default(null),
    confidence: researchConfidenceSchema,
  })
  .strict();

export const researchSourceAnalysisSchema = z
  .object({
    sourceId: researchSourceIdSchema,
    evidenceId: webEvidenceIdSchema,
    summary: researchSummaryTextSchema,
    claims: z.array(researchAnalysisClaimSchema).max(25).default([]),
    caveats: z.array(researchMessageSchema).max(25).default([]),
    relevanceScore: researchScoreSchema,
    confidence: researchConfidenceSchema,
    warnings: z.array(researchWarningSchema).max(25).default([]),
    analyzedAt: isoDateTimeSchema,
  })
  .strict();

export const researchCitationSchema = z
  .object({
    citationId: researchCitationIdSchema,
    sourceId: researchSourceIdSchema,
    sourceTitle: researchTitleSchema,
    sourceUrl: httpOrHttpsSearchUrlSchema,
    evidenceId: webEvidenceIdSchema,
    claimText: researchClaimTextSchema,
    sourceExcerpt: researchExcerptSchema.nullable().default(null),
  })
  .strict();

export const researchFindingSchema = z
  .object({
    id: researchFindingIdSchema,
    title: researchTitleSchema,
    claimText: researchClaimTextSchema,
    citationIds: z.array(researchCitationIdSchema).max(20).default([]),
    confidence: researchConfidenceSchema,
    kind: researchFindingKindSchema,
  })
  .strict()
  .refine((finding) => finding.kind === "uncertainty" || finding.citationIds.length > 0, {
    message: "Sourced facts and synthesis findings require at least one citation.",
    path: ["citationIds"],
  });

export const researchLimitationSchema = z
  .object({
    code: researchCodeSchema,
    message: researchMessageSchema,
    sourceId: researchSourceIdSchema.optional(),
    evidenceId: webEvidenceIdSchema.optional(),
  })
  .strict();

export const researchReportSummarySchema = z
  .object({
    text: researchSummaryTextSchema,
    keyPoints: z.array(researchClaimTextSchema).max(12).default([]),
  })
  .strict();

export const researchSelectedSourceSchema = z
  .object({
    id: researchSourceIdSchema,
    reportId: researchReportIdSchema,
    executionId: executionIdSchema,
    workspaceId: nullableWorkspaceIdSchema,
    evidenceId: webEvidenceIdSchema.nullable(),
    url: httpOrHttpsSearchUrlSchema,
    finalUrl: httpOrHttpsSearchUrlSchema.nullable(),
    title: researchTitleSchema.nullable(),
    publishedAt: isoDateTimeSchema.nullable(),
    selectionRank: z.number().int().min(1).max(1_000).nullable(),
    relevanceScore: researchScoreSchema.nullable(),
    analysis: researchSourceAnalysisSchema.nullable(),
    citationIds: z.array(researchCitationIdSchema).max(50).default([]),
    status: researchSourceStatusSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((source, context) => {
    if (source.analysis === null) {
      return;
    }

    if (source.analysis.sourceId !== source.id) {
      context.addIssue({
        code: "custom",
        message: "Research source analysis must reference the selected source.",
        path: ["analysis", "sourceId"],
      });
    }

    if (source.evidenceId === null || source.analysis.evidenceId !== source.evidenceId) {
      context.addIssue({
        code: "custom",
        message: "Research source analysis must reference the selected source evidence.",
        path: ["analysis", "evidenceId"],
      });
    }
  });

export const researchReportSchema = z
  .object({
    id: researchReportIdSchema,
    executionId: executionIdSchema,
    workspaceId: nullableWorkspaceIdSchema,
    question: researchQuestionSchema,
    summary: researchReportSummarySchema,
    findings: z.array(researchFindingSchema).max(100).default([]),
    sources: z.array(researchSelectedSourceSchema).max(50).default([]),
    citations: z.array(researchCitationSchema).max(200).default([]),
    limitations: z.array(researchLimitationSchema).max(50).default([]),
    warnings: z.array(researchWarningSchema).max(50).default([]),
    status: researchReportStatusSchema,
    createdAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema.nullable(),
  })
  .strict()
  .superRefine(validateResearchReport);

export const researchReportListPageSchema = z
  .object({
    reports: z.array(researchReportSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(50),
    total: z.number().int().nonnegative(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
  })
  .strict();

export type ResearchReportId = z.infer<typeof researchReportIdSchema>;
export type ResearchSourceId = z.infer<typeof researchSourceIdSchema>;
export type ResearchCitationId = z.infer<typeof researchCitationIdSchema>;
export type ResearchFindingId = z.infer<typeof researchFindingIdSchema>;
export type ResearchQueryPlanId = z.infer<typeof researchQueryPlanIdSchema>;
export type ResearchQueryId = z.infer<typeof researchQueryIdSchema>;
export type ResearchAnalysisClaimId = z.infer<typeof researchAnalysisClaimIdSchema>;
export type ResearchMode = z.infer<typeof researchModeSchema>;
export type ResearchTimeRange = z.infer<typeof researchTimeRangeSchema>;
export type ResearchMemoryProposalMode = z.infer<typeof researchMemoryProposalModeSchema>;
export type ResearchReportStatus = z.infer<typeof researchReportStatusSchema>;
export type ResearchSourceStatus = z.infer<typeof researchSourceStatusSchema>;
export type ResearchFindingKind = z.infer<typeof researchFindingKindSchema>;
export type ResearchQueryPlanReason = z.infer<typeof researchQueryPlanReasonSchema>;
export type ResearchCandidateProvenanceRole = z.infer<typeof researchCandidateProvenanceRoleSchema>;
export type ResearchCandidatePoolExclusionReason = z.infer<
  typeof researchCandidatePoolExclusionReasonSchema
>;
export type ResearchSourceSelectionReason = z.infer<typeof researchSourceSelectionReasonSchema>;
export type ResearchSourceSelectionExclusionReason = z.infer<
  typeof researchSourceSelectionExclusionReasonSchema
>;
export type ResearchSafeDetails = Record<string, JsonValue>;
export type ResearchWarning = z.infer<typeof researchWarningSchema>;
export type ResearchError = z.infer<typeof researchErrorSchema>;
export type ResearchRequestInput = z.input<typeof researchRequestSchema>;
export type ResearchRequest = z.infer<typeof researchRequestSchema>;
export type ResearchQueryPlanItem = z.infer<typeof researchQueryPlanItemSchema>;
export type ResearchQueryPlan = z.infer<typeof researchQueryPlanSchema>;
export type ResearchCandidateProvenance = z.infer<typeof researchCandidateProvenanceSchema>;
export type ResearchCandidateDeduplication = z.infer<typeof researchCandidateDeduplicationSchema>;
export type ResearchCandidatePoolExclusion = z.infer<typeof researchCandidatePoolExclusionSchema>;
export type NormalizedResearchCandidateSource = z.infer<
  typeof normalizedResearchCandidateSourceSchema
>;
export type ResearchCandidatePool = z.infer<typeof researchCandidatePoolSchema>;
export type ResearchCandidateSource = z.infer<typeof researchCandidateSourceSchema>;
export type ResearchSelectedCandidateSource = z.infer<typeof researchSelectedCandidateSourceSchema>;
export type ResearchSourceSelectionExclusion = z.infer<
  typeof researchSourceSelectionExclusionSchema
>;
export type ResearchSourceSelection = z.infer<typeof researchSourceSelectionSchema>;
export type ResearchAnalysisClaim = z.infer<typeof researchAnalysisClaimSchema>;
export type ResearchSourceAnalysis = z.infer<typeof researchSourceAnalysisSchema>;
export type ResearchCitation = z.infer<typeof researchCitationSchema>;
export type ResearchFinding = z.infer<typeof researchFindingSchema>;
export type ResearchLimitation = z.infer<typeof researchLimitationSchema>;
export type ResearchReportSummary = z.infer<typeof researchReportSummarySchema>;
export type ResearchSelectedSource = z.infer<typeof researchSelectedSourceSchema>;
export type ResearchReport = z.infer<typeof researchReportSchema>;
export type ResearchReportListPage = z.infer<typeof researchReportListPageSchema>;

function validateNormalizedResearchCandidate(
  candidate: NormalizedResearchCandidateSource,
  context: z.RefinementCtx,
): void {
  if (candidate.provenance[0]?.role !== "primary") {
    context.addIssue({
      code: "custom",
      message: "Normalized research candidates require primary provenance first.",
      path: ["provenance", 0, "role"],
    });
  }

  const duplicateProvenanceCount = candidate.provenance.filter(
    (provenance) => provenance.role === "duplicate",
  ).length;

  if (candidate.duplicateCount !== duplicateProvenanceCount) {
    context.addIssue({
      code: "custom",
      message: "Normalized research candidate duplicate count must match duplicate provenance.",
      path: ["duplicateCount"],
    });
  }
}

function validateResearchSourceSelection(
  selection: ResearchSourceSelection,
  context: z.RefinementCtx,
): void {
  if (selection.selected.length > selection.extractionBudget) {
    context.addIssue({
      code: "custom",
      message: "Research source selection cannot exceed the extraction budget.",
      path: ["selected"],
    });
  }

  const selectedCanonicalUrls = new Set<string>();
  const selectionRanks = new Set<number>();

  selection.selected.forEach((source, index) => {
    if (selectedCanonicalUrls.has(source.canonicalUrl)) {
      context.addIssue({
        code: "custom",
        message: "Research source selection must use unique canonical URLs.",
        path: ["selected", index, "canonicalUrl"],
      });
    }

    selectedCanonicalUrls.add(source.canonicalUrl);

    if (selectionRanks.has(source.selectionRank)) {
      context.addIssue({
        code: "custom",
        message: "Research source selection ranks must be unique.",
        path: ["selected", index, "selectionRank"],
      });
    }

    selectionRanks.add(source.selectionRank);
  });
}

function validateSafeDetails(details: Record<string, JsonValue>, context: z.RefinementCtx): void {
  for (const [key, value] of Object.entries(details)) {
    validateSafeDetailsValue(value, context, [key]);
  }
}

function validateSafeDetailsValue(
  value: JsonValue,
  context: z.RefinementCtx,
  path: (string | number)[],
): void {
  if (typeof value === "string" && /<html\b/iu.test(value)) {
    context.addIssue({
      code: "custom",
      message: "Research details must not include raw HTML documents.",
      path,
    });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      validateSafeDetailsValue(item, context, [...path, index]);
    });
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (unsafeDetailsKeyPattern.test(key)) {
        context.addIssue({
          code: "custom",
          message:
            "Research details must not include unsafe raw, prompt, reasoning, header, or HTML keys.",
          path: [...path, key],
        });
      }

      validateSafeDetailsValue(nested, context, [...path, key]);
    }
  }
}

function validateResearchReport(report: ResearchReport, context: z.RefinementCtx): void {
  const completedStatuses = new Set<ResearchReportStatus>([
    "completed",
    "completed_with_warnings",
    "failed",
    "cancelled",
  ]);

  if (completedStatuses.has(report.status) && report.completedAt === null) {
    context.addIssue({
      code: "custom",
      message: "Terminal research reports require completedAt.",
      path: ["completedAt"],
    });
  }

  if (!completedStatuses.has(report.status) && report.completedAt !== null) {
    context.addIssue({
      code: "custom",
      message: "Pending and running research reports must not include completedAt.",
      path: ["completedAt"],
    });
  }

  const sourceById = new Map<ResearchSourceId, ResearchSelectedSource>();

  report.sources.forEach((source, index) => {
    if (sourceById.has(source.id)) {
      context.addIssue({
        code: "custom",
        message: "Research report source IDs must be unique.",
        path: ["sources", index, "id"],
      });
    }

    sourceById.set(source.id, source);

    if (source.reportId !== report.id) {
      context.addIssue({
        code: "custom",
        message: "Research report sources must reference the report.",
        path: ["sources", index, "reportId"],
      });
    }

    if (
      source.executionId !== report.executionId ||
      (source.workspaceId ?? null) !== report.workspaceId
    ) {
      context.addIssue({
        code: "custom",
        message: "Research report sources must share report execution and workspace.",
        path: ["sources", index, "executionId"],
      });
    }
  });

  const citationById = new Map<ResearchCitationId, ResearchCitation>();

  report.citations.forEach((citation, index) => {
    if (citationById.has(citation.citationId)) {
      context.addIssue({
        code: "custom",
        message: "Research citation IDs must be unique within one report.",
        path: ["citations", index, "citationId"],
      });
    }

    citationById.set(citation.citationId, citation);

    const source = sourceById.get(citation.sourceId);

    if (!source) {
      context.addIssue({
        code: "custom",
        message: "Research citations must reference a known source ID.",
        path: ["citations", index, "sourceId"],
      });
      return;
    }

    if (source.evidenceId === null) {
      context.addIssue({
        code: "custom",
        message: "Research citations require sources with extraction evidence.",
        path: ["citations", index, "evidenceId"],
      });
    } else if (citation.evidenceId !== source.evidenceId) {
      context.addIssue({
        code: "custom",
        message: "Research citation evidence IDs must match cited source evidence.",
        path: ["citations", index, "evidenceId"],
      });
    }

    if (source.title === null || citation.sourceTitle !== source.title) {
      context.addIssue({
        code: "custom",
        message: "Research citation source titles must match cited source metadata.",
        path: ["citations", index, "sourceTitle"],
      });
    }

    const sourceUrl = source.finalUrl ?? source.url;

    if (citation.sourceUrl !== sourceUrl) {
      context.addIssue({
        code: "custom",
        message: "Research citation source URLs must match cited source metadata.",
        path: ["citations", index, "sourceUrl"],
      });
    }
  });

  report.findings.forEach((finding, index) => {
    for (const citationId of finding.citationIds) {
      if (!citationById.has(citationId)) {
        context.addIssue({
          code: "custom",
          message: "Research findings must reference known citation IDs.",
          path: ["findings", index, "citationIds"],
        });
      }
    }
  });

  report.sources.forEach((source, sourceIndex) => {
    for (const citationId of source.citationIds) {
      const citation = citationById.get(citationId);

      if (!citation) {
        context.addIssue({
          code: "custom",
          message: "Research source citation IDs must exist in report citations.",
          path: ["sources", sourceIndex, "citationIds"],
        });
        continue;
      }

      if (citation.sourceId !== source.id) {
        context.addIssue({
          code: "custom",
          message: "Research source citation IDs must cite the same source.",
          path: ["sources", sourceIndex, "citationIds"],
        });
      }
    }
  });
}
