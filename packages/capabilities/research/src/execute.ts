import {
  structuredGenerationResultSchema,
  type CapabilityDefinition,
  type CapabilityExecutionContext,
  type ExtractedDocument,
  type JsonValue,
  type PersistWebEvidenceResult,
  type ProviderHealth,
  type ResearchReport,
  type ResearchRequest,
  type ResearchSelectedCandidateSource,
  type ResearchSelectedSource,
  type ResearchWarning,
  type SearchProviderHealth,
  type SearchRequest,
  type SearchResponse,
  type WorkspaceId,
  researchRequestSchema,
  researchWarningSchema,
} from "@pap/contracts";
import type { MemoryService, ProposeSemanticMemoryInput } from "@pap/memory";
import {
  buildCandidatePoolTraceMetadata,
  buildResearchSemanticMemoryProposals,
  buildSearchRequests,
  buildSourceSelectionTraceMetadata,
  buildQueryPlanTraceMetadata,
  buildResearchSourceAnalysis,
  buildFailedResearchReport,
  evaluateResearchMemoryProposalEligibility,
  normalizeResearchCandidates,
  planResearchQueries,
  researchArticleAnalysisOutputSchema,
  researchSourceRankingOutputSchema,
  selectResearchSources,
  synthesizeResearchReport,
  validateResearchReportCitations,
  validateResearchSourceRankingOutput,
  type ResearchCandidateSearchInput,
  type ResearchSourceRankingOutput,
} from "@pap/research";
import { nowIso } from "@pap/shared";
import type { ResearchReportRepository, ResearchSourceRepository } from "@pap/storage";
import { researchCapabilityManifest } from "./manifest.js";
import {
  researchCapabilityInputSchema,
  researchCapabilityOutputSchema,
  type ResearchCapabilityOutput,
  type ResearchMemoryProposalStatus,
} from "./schemas.js";

export type ResearchCapabilityDependencies = {
  reportRepository: ResearchReportRepository;
  sourceRepository: ResearchSourceRepository;
  memoryService?: MemoryService;
  clock?: () => Date;
  providerId?: string;
  model?: string;
};

type SearchRecord = {
  queryId: string;
  request: SearchRequest;
  response?: SearchResponse;
  searchEvidenceId: string | null;
  status?: "completed" | "failed";
  failureCategory?: string | null;
  failureMessage?: string | null;
};

type ExtractedResearchSource = {
  selected: ResearchSelectedCandidateSource;
  source: ResearchSelectedSource;
  document: ExtractedDocument;
};

type ReportCompletion = {
  report: ResearchReport;
  memoryProposalStatus: ResearchMemoryProposalStatus;
  memoryProposalIds: string[];
};

const defaultProviderId = "provider.ollama";
const rankingPromptTemplateId = "prompt.research-rank-sources.v1";
const analysisPromptTemplateId = "prompt.research-analyze-source.v1";
const rankingResponseSchemaId = "research.source-ranking.v1";
const analysisResponseSchemaId = "research.article-analysis.v1";

export function createResearchCapability(
  dependencies: ResearchCapabilityDependencies,
): CapabilityDefinition {
  return {
    manifest: researchCapabilityManifest,
    inputSchema: researchCapabilityInputSchema,
    outputSchema: researchCapabilityOutputSchema,
    execute: createResearchExecute(dependencies),
  };
}

export function createResearchExecute(dependencies: ResearchCapabilityDependencies) {
  return async (
    input: unknown,
    context: CapabilityExecutionContext,
  ): Promise<ResearchCapabilityOutput> => {
    const parsedInput = researchRequestSchema.parse(input);
    const workspaceId = resolveWorkspaceId(parsedInput, context);
    const request = researchRequestSchema.parse({
      ...parsedInput,
      workspaceId,
    });
    const startedAt = isoNow(dependencies);
    const report = await dependencies.reportRepository.create({
      executionId: context.executionId,
      workspaceId,
      question: request.question,
      summary: {
        text: "Research request accepted and is being processed.",
        keyPoints: [],
      },
      status: "running",
      createdAt: startedAt,
    });

    await context.trace.addStep({
      kind: "workflow",
      name: "resolve workspace context",
      status: "completed",
      summary: workspaceId
        ? "Research request is scoped to one workspace."
        : "Research request is unscoped.",
      metadata: workspaceId ? { workspaceId } : { workspaceId: null },
    });

    const completion = await runResearchWorkflow({
      dependencies,
      context,
      request,
      report,
      workspaceId,
    });

    return researchCapabilityOutputSchema.parse({
      reportId: completion.report.id,
      workspaceId,
      status: completion.report.status,
      sourceCount: completion.report.sources.length,
      citationCount: completion.report.citations.length,
      warningCount: completion.report.warnings.length,
      memoryProposalMode: request.memoryProposalMode,
      memoryProposalStatus: completion.memoryProposalStatus,
      memoryProposalIds: completion.memoryProposalIds,
    });
  };
}

async function runResearchWorkflow(input: {
  dependencies: ResearchCapabilityDependencies;
  context: CapabilityExecutionContext;
  request: ResearchRequest;
  report: ResearchReport;
  workspaceId: WorkspaceId | null;
}): Promise<ReportCompletion> {
  const warnings: ResearchWarning[] = [];
  const { dependencies, context, request, report, workspaceId } = input;
  const providerId = await resolveSearchProvider(context, report, request, warnings);

  if (!providerId) {
    return failReport({
      dependencies,
      context,
      report,
      request,
      workspaceId,
      warnings,
      message: "Search is unavailable because the configured provider could not be reached.",
    });
  }

  const plan = planResearchQueries(request, { createdAt: isoNow(dependencies) });
  await context.trace.addStep({
    kind: "workflow",
    name: "plan queries",
    status: "completed",
    summary: "Built deterministic bounded research queries.",
    metadata: buildQueryPlanTraceMetadata(plan),
  });

  const searchRecords = await runSearches({
    context,
    request,
    plan,
    providerId,
    warnings,
  });

  if (!searchRecords.some((search) => search.status !== "failed")) {
    return failReport({
      dependencies,
      context,
      report,
      request,
      workspaceId,
      warnings,
      message: "Search did not return usable provider evidence.",
    });
  }

  const candidatePool = normalizeResearchCandidates({
    queryPlan: plan,
    searches: searchRecords.map((search) => toCandidateSearchInput(search, providerId)),
    maxCandidates: request.maxSearchResults ?? null,
  });
  await context.trace.addStep({
    kind: "workflow",
    name: "normalize candidates",
    status: "completed",
    summary: "Canonicalized, deduplicated, and bounded search candidates.",
    metadata: buildCandidatePoolTraceMetadata(candidatePool),
  });

  if (candidatePool.candidates.length === 0) {
    return failReport({
      dependencies,
      context,
      report,
      request,
      workspaceId,
      warnings: [...warnings, ...candidatePool.warnings],
      message: "Search returned no usable candidate sources.",
    });
  }

  const selection = selectResearchSources({
    request,
    candidatePool,
  });
  await context.trace.addStep({
    kind: "workflow",
    name: "select extraction budget",
    status: "completed",
    summary: "Selected a bounded source set for extraction.",
    metadata: buildSourceSelectionTraceMetadata(selection),
  });

  if (selection.selected.length === 0) {
    return failReport({
      dependencies,
      context,
      report,
      request,
      workspaceId,
      warnings: [...warnings, ...selection.warnings],
      message: "No sources were selected for extraction.",
    });
  }

  const extractedSources = await fetchAndExtractSources({
    dependencies,
    context,
    report,
    selectedSources: selection.selected,
    warnings,
  });

  await context.trace.addStep({
    kind: "workflow",
    name: "fetch and extract sources",
    status: extractedSources.length > 0 ? "completed" : "failed",
    summary:
      extractedSources.length > 0
        ? "Fetched and extracted at least one selected source."
        : "No selected source could be extracted into usable content.",
    metadata: {
      selectedSourceCount: selection.selected.length,
      extractedSourceCount: extractedSources.length,
      failedSourceCount: selection.selected.length - extractedSources.length,
    },
  });

  if (extractedSources.length === 0) {
    const sources = await dependencies.sourceRepository.listByReport({
      reportId: report.id,
      workspaceId: report.workspaceId,
    });

    return failReport({
      dependencies,
      context,
      report,
      request,
      workspaceId,
      sources,
      warnings,
      message: "Search found sources, but none could be extracted into usable content.",
    });
  }

  const ranking = await rankSources({
    dependencies,
    context,
    report,
    request,
    extractedSources,
    warnings,
  });

  if (!ranking) {
    const sources = await dependencies.sourceRepository.listByReport({
      reportId: report.id,
      workspaceId: report.workspaceId,
    });

    return failReport({
      dependencies,
      context,
      report,
      request,
      workspaceId,
      sources,
      warnings,
      message: "Local model ranking could not produce valid source scores.",
    });
  }

  const analyzedSources = await analyzeSources({
    dependencies,
    context,
    request,
    extractedSources: selectSourcesForAnalysis(extractedSources, ranking),
    warnings,
  });

  await context.trace.addStep({
    kind: "workflow",
    name: "analyze selected sources",
    status: analyzedSources.length > 0 ? "completed" : "failed",
    summary:
      analyzedSources.length > 0
        ? "Validated source analyses for report synthesis."
        : "No source analysis passed validation.",
    metadata: {
      analyzedSourceCount: analyzedSources.length,
      failedSourceCount: extractedSources.length - analyzedSources.length,
    },
  });

  if (analyzedSources.length === 0) {
    const sources = await dependencies.sourceRepository.listByReport({
      reportId: report.id,
      workspaceId: report.workspaceId,
    });

    return failReport({
      dependencies,
      context,
      report,
      request,
      workspaceId,
      sources,
      warnings,
      message: "No selected source could be analyzed into citation-ready findings.",
    });
  }

  const persistedSources = await dependencies.sourceRepository.listByReport({
    reportId: report.id,
    workspaceId: report.workspaceId,
  });
  const synthesized = synthesizeResearchReport({
    reportId: report.id,
    executionId: report.executionId,
    workspaceId: report.workspaceId,
    question: request.question,
    sources: persistedSources,
    warnings,
    completedAt: isoNow(dependencies),
  });

  try {
    validateResearchReportCitations(synthesized);
    await context.trace.addStep({
      kind: "validation",
      name: "validate citations",
      status: synthesized.status === "failed" ? "failed" : "completed",
      summary: "Validated report citations against analyzed source claims.",
      metadata: {
        citationCount: synthesized.citations.length,
        findingCount: synthesized.findings.length,
      },
    });
  } catch (error) {
    warnings.push(
      warning(
        "citation_validation_failed",
        "Citation validation failed for the synthesized report.",
      ),
    );
    await context.trace.addStep({
      kind: "validation",
      name: "validate citations",
      status: "failed",
      summary: "Citation validation rejected the synthesized report.",
      metadata: {
        failureCategory: "citation_validation_failed",
        errorName: errorName(error),
      },
    });

    return failReport({
      dependencies,
      context,
      report,
      request,
      workspaceId,
      sources: persistedSources,
      warnings,
      message: "Citation validation failed, so the report was not completed as successful.",
    });
  }

  const persistedReport = await persistReportContent({
    dependencies,
    context,
    report: synthesized,
  });

  const proposalResult = await proposeMemoryIfEligible({
    dependencies,
    context,
    request,
    report: persistedReport,
  });

  return {
    report:
      proposalResult.warning === null
        ? persistedReport
        : await persistReportContent({
            dependencies,
            context,
            report: {
              ...persistedReport,
              status: "completed_with_warnings",
              warnings: [...persistedReport.warnings, proposalResult.warning],
            },
          }),
    memoryProposalStatus: proposalResult.status,
    memoryProposalIds: proposalResult.memoryIds,
  };
}

async function resolveSearchProvider(
  context: CapabilityExecutionContext,
  report: ResearchReport,
  request: ResearchRequest,
  warnings: ResearchWarning[],
): Promise<string | null> {
  try {
    const providerId = await context.web.resolveSearchProvider();
    const health = await context.web.getSearchProviderHealth(providerId);

    if (!isSearchProviderUsable(health)) {
      warnings.push(
        warning("search_provider_unavailable", "Configured search provider is unavailable.", {
          providerId,
          healthStatus: health.status,
        }),
      );
      await context.trace.addStep({
        kind: "workflow",
        name: "search web",
        status: "failed",
        summary: "Search provider health is not usable for research.",
        metadata: {
          providerId,
          healthStatus: health.status,
          reportId: report.id,
          requestedSourceCount: request.maxSources ?? 5,
        },
      });
      return null;
    }

    return providerId;
  } catch (error) {
    warnings.push(warning("search_provider_unavailable", safeErrorMessage(error)));
    return null;
  }
}

async function runSearches(input: {
  context: CapabilityExecutionContext;
  request: ResearchRequest;
  plan: ReturnType<typeof planResearchQueries>;
  providerId: string;
  warnings: ResearchWarning[];
}): Promise<SearchRecord[]> {
  const searchRequests = buildSearchRequests(input.plan, input.request, {
    providerId: input.providerId,
    safesearch: 1,
  });
  const records: SearchRecord[] = [];

  for (const plannedSearch of searchRequests) {
    try {
      const response = await input.context.web.search(plannedSearch.request);
      const evidence = await input.context.web.persistEvidence({
        search: {
          request: plannedSearch.request,
          response,
        },
      });
      records.push({
        queryId: plannedSearch.queryId,
        request: plannedSearch.request,
        response,
        searchEvidenceId: evidence.searchEvidenceId ?? null,
        status: "completed",
      });
    } catch (error) {
      const evidence = await persistSearchFailure({
        context: input.context,
        request: plannedSearch.request,
        providerId: input.providerId,
        error,
      });
      const category = safeFailureCategory(error, "search_failed");
      const message = safeErrorMessage(error);
      input.warnings.push(warning("search_provider_query_failed", message, { category }));
      records.push({
        queryId: plannedSearch.queryId,
        request: plannedSearch.request,
        searchEvidenceId: evidence.searchEvidenceId ?? null,
        status: "failed",
        failureCategory: category,
        failureMessage: message,
      });
    }
  }

  return records;
}

async function fetchAndExtractSources(input: {
  dependencies: ResearchCapabilityDependencies;
  context: CapabilityExecutionContext;
  report: ResearchReport;
  selectedSources: readonly ResearchSelectedCandidateSource[];
  warnings: ResearchWarning[];
}): Promise<ExtractedResearchSource[]> {
  const extracted: ExtractedResearchSource[] = [];

  for (const selected of input.selectedSources) {
    try {
      const validatedUrl = await input.context.web.validateUrlPolicy(selected.url);
      const fetchResult = await input.context.web.fetch({
        url: validatedUrl,
        acceptedContentTypes: ["text/html", "application/xhtml+xml", "text/plain"],
        timeoutMs: 15_000,
        maxBytes: 2_000_000,
        allowRedirects: true,
        maxRedirects: 5,
      });
      const profile = await input.context.web.resolveSourceProfile(fetchResult.finalUrl);
      const document = await input.context.web.extract({
        requestedUrl: fetchResult.requestedUrl,
        finalUrl: fetchResult.finalUrl,
        html: fetchResult.html,
        text: fetchResult.text,
        contentType: fetchResult.contentType,
        sourceProfileId: profile?.id ?? null,
        maxContentChars: 20_000,
        minWordCount: 20,
      });
      const evidence = await input.context.web.persistEvidence({
        fetch: {
          result: fetchResult,
          selectedUrlSource: "search_result",
          selectedResultIndex: selected.firstSeenResultIndex,
          requestedUrl: validatedUrl,
          searchEvidenceId: selected.searchEvidenceId,
        },
        extraction: {
          document,
          finalUrl: document.metadata.finalUrl,
        },
      });
      const evidenceId = evidence.extractionEvidenceId;

      if (!evidenceId) {
        throw new Error("Extraction evidence was not persisted.");
      }

      const source = await input.dependencies.sourceRepository.create({
        reportId: input.report.id,
        executionId: input.report.executionId,
        workspaceId: input.report.workspaceId,
        evidenceId,
        url: selected.url,
        finalUrl: document.metadata.finalUrl,
        title: document.title ?? selected.title,
        publishedAt: document.publishedAt ?? selected.publishedAt,
        selectionRank: selected.selectionRank,
        status: "extracted",
      });
      extracted.push({ selected, source, document });
    } catch (error) {
      input.warnings.push(
        warning(
          "source_extraction_failed",
          "A selected source could not be fetched or extracted.",
          {
            sourceTitle: selected.title,
            failureCategory: safeFailureCategory(error, "source_extraction_failed"),
          },
        ),
      );
      await persistFailedSource(input, selected, error);
    }
  }

  return extracted;
}

async function rankSources(input: {
  dependencies: ResearchCapabilityDependencies;
  context: CapabilityExecutionContext;
  report: ResearchReport;
  request: ResearchRequest;
  extractedSources: readonly ExtractedResearchSource[];
  warnings: ResearchWarning[];
}): Promise<ResearchSourceRankingOutput | null> {
  const providerId = input.dependencies.providerId ?? defaultProviderId;
  const health = await getUsableModelHealth(input.context, providerId, input.dependencies.model);

  if (!health.model) {
    input.warnings.push(
      warning("model_provider_unavailable", "Local model service is unavailable for ranking.", {
        providerId,
        healthStatus: health.status,
      }),
    );
    await input.context.trace.addStep({
      kind: "workflow",
      name: "rank relevance",
      status: "failed",
      summary: "Model provider was unavailable for relevance ranking.",
      metadata: {
        providerId,
        healthStatus: health.status,
        sourceCount: input.extractedSources.length,
      },
    });
    return null;
  }

  await input.context.trace.addStep({
    kind: "workflow",
    name: "rank relevance",
    status: "started",
    summary: "Ranking extracted sources with structured local model output.",
    metadata: {
      providerId,
      responseSchemaId: rankingResponseSchemaId,
      sourceCount: input.extractedSources.length,
    },
  });

  const generation = structuredGenerationResultSchema.parse(
    await input.context.llm.generateStructured({
      providerId,
      model: health.model,
      systemPrompt: "Rank only the supplied extracted research sources. Return JSON only.",
      prompt: buildRankingPrompt(input.request, input.extractedSources),
      responseSchema: {
        id: rankingResponseSchemaId,
        description: "Research source relevance ranking.",
        schema: researchSourceRankingOutputSchema,
      },
      temperature: 0,
      maxTokens: 1_024,
      timeoutMs: 60_000,
      keepAlive: null,
      metadata: {
        capabilityId: input.context.capability.id,
        promptTemplateId: rankingPromptTemplateId,
        reportId: input.report.id,
      },
    }),
  );

  const ranking = validateResearchSourceRankingOutput({
    output: generation.output,
    sourceIds: input.extractedSources.map((source) => source.source.id),
  });

  await input.context.trace.addStep({
    kind: "workflow",
    name: "rank relevance",
    status: "completed",
    summary: "Validated structured source relevance ranking.",
    metadata: {
      providerId,
      sourceCount: input.extractedSources.length,
      rankedSourceCount: ranking.rankings.length,
    },
  });

  return ranking;
}

async function analyzeSources(input: {
  dependencies: ResearchCapabilityDependencies;
  context: CapabilityExecutionContext;
  request: ResearchRequest;
  extractedSources: readonly ExtractedResearchSource[];
  warnings: ResearchWarning[];
}): Promise<ResearchSelectedSource[]> {
  const providerId = input.dependencies.providerId ?? defaultProviderId;
  const health = await getUsableModelHealth(input.context, providerId, input.dependencies.model);
  const analyzed: ResearchSelectedSource[] = [];

  if (!health.model) {
    input.warnings.push(
      warning("model_provider_unavailable", "Local model service is unavailable for analysis.", {
        providerId,
        healthStatus: health.status,
      }),
    );
    return analyzed;
  }

  for (const extractedSource of input.extractedSources) {
    try {
      const generation = structuredGenerationResultSchema.parse(
        await input.context.llm.generateStructured({
          providerId,
          model: health.model,
          systemPrompt:
            "Analyze only the supplied extracted source content. Return schema-valid JSON only.",
          prompt: buildAnalysisPrompt(input.request, extractedSource),
          responseSchema: {
            id: analysisResponseSchemaId,
            description: "Research article analysis.",
            schema: researchArticleAnalysisOutputSchema,
          },
          temperature: 0,
          maxTokens: 1_500,
          timeoutMs: 90_000,
          keepAlive: null,
          metadata: {
            capabilityId: input.context.capability.id,
            promptTemplateId: analysisPromptTemplateId,
            sourceId: extractedSource.source.id,
          },
        }),
      );
      const analysis = buildResearchSourceAnalysis({
        sourceId: extractedSource.source.id,
        evidenceId: requireEvidenceId(extractedSource.source),
        output: generation.output,
        analyzedAt: isoNow(input.dependencies),
      });
      const updated = await input.dependencies.sourceRepository.updateAnalysis({
        id: extractedSource.source.id,
        workspaceId: extractedSource.source.workspaceId,
        analysis,
        status: "analyzed",
      });
      analyzed.push(updated);
    } catch (error) {
      input.warnings.push(
        warning("source_analysis_failed", "A selected source could not be analyzed.", {
          sourceId: extractedSource.source.id,
          failureCategory: safeFailureCategory(error, "source_analysis_failed"),
        }),
      );
      await input.dependencies.sourceRepository.updateStatus({
        id: extractedSource.source.id,
        workspaceId: extractedSource.source.workspaceId,
        status: "analysis_failed",
      });
    }
  }

  return analyzed;
}

async function proposeMemoryIfEligible(input: {
  dependencies: ResearchCapabilityDependencies;
  context: CapabilityExecutionContext;
  request: ResearchRequest;
  report: ResearchReport;
}): Promise<{
  status: ResearchMemoryProposalStatus;
  memoryIds: string[];
  warning: ResearchWarning | null;
}> {
  if (input.request.memoryProposalMode !== "propose") {
    await input.context.trace.addStep({
      kind: "memory",
      name: "propose memory if eligible",
      status: "skipped",
      summary: "Memory proposals were not requested.",
      metadata: { memoryProposalCount: 0 },
    });
    return { status: "not_requested", memoryIds: [], warning: null };
  }

  if (!input.dependencies.memoryService) {
    await input.context.trace.addStep({
      kind: "memory",
      name: "propose memory if eligible",
      status: "skipped",
      summary: "Memory service is unavailable for research proposals.",
      metadata: { memoryProposalCount: 0 },
    });
    return { status: "not_eligible", memoryIds: [], warning: null };
  }

  const activeSemanticMemory = await input.dependencies.memoryService.listSemanticMemory({
    sourceExecutionId: input.report.executionId,
    status: "active",
    limit: 10,
  });
  const eligibility = evaluateResearchMemoryProposalEligibility({
    request: input.request,
    report: input.report,
    activeSemanticMemory,
  });

  if (!eligibility.eligible) {
    await input.context.trace.addStep({
      kind: "memory",
      name: "propose memory if eligible",
      status: "skipped",
      summary: "Research report was not eligible for semantic memory proposal.",
      metadata: {
        memoryProposalCount: 0,
        eligibilityReason: eligibility.reason,
      },
    });
    return { status: "not_eligible", memoryIds: [], warning: null };
  }

  try {
    const proposals = buildResearchSemanticMemoryProposals({
      request: input.request,
      report: input.report,
      activeSemanticMemory,
    });
    const created = [];

    for (const proposal of proposals) {
      created.push(
        await input.dependencies.memoryService.proposeSemanticMemory(
          compactObject(proposal) as ProposeSemanticMemoryInput,
        ),
      );
    }

    await input.context.trace.addStep({
      kind: "memory",
      name: "propose memory if eligible",
      status: "completed",
      summary: "Created proposed semantic memory for user review.",
      metadata: { memoryProposalCount: created.length },
    });

    return {
      status: created.length > 0 ? "pending_review" : "not_eligible",
      memoryIds: created.map((memory) => memory.id),
      warning: null,
    };
  } catch (error) {
    await input.context.trace.addStep({
      kind: "memory",
      name: "propose memory if eligible",
      status: "failed",
      summary: "Research memory proposal failed without activating memory.",
      metadata: {
        memoryProposalCount: 0,
        failureCategory: "memory_proposal_failed",
        errorName: errorName(error),
      },
    });

    return {
      status: "failed",
      memoryIds: [],
      warning: warning(
        "memory_proposal_failed",
        "Research completed, but semantic memory proposal failed safely.",
      ),
    };
  }
}

async function persistReportContent(input: {
  dependencies: ResearchCapabilityDependencies;
  context: CapabilityExecutionContext;
  report: ResearchReport;
}): Promise<ResearchReport> {
  const updated = await input.dependencies.reportRepository.replaceContent({
    id: input.report.id,
    workspaceId: input.report.workspaceId,
    summary: input.report.summary,
    findings: input.report.findings,
    citations: input.report.citations,
    limitations: input.report.limitations,
    warnings: input.report.warnings,
    status: input.report.status,
    completedAt: input.report.completedAt,
  });

  await input.context.trace.addStep({
    kind: "workflow",
    name: "persist report",
    status: "completed",
    summary: "Persisted research report content and diagnostics.",
    metadata: {
      reportId: updated.id,
      status: updated.status,
      findingCount: updated.findings.length,
      citationCount: updated.citations.length,
      warningCount: updated.warnings.length,
      limitationCount: updated.limitations.length,
    },
  });

  return updated;
}

async function failReport(input: {
  dependencies: ResearchCapabilityDependencies;
  context: CapabilityExecutionContext;
  report: ResearchReport;
  request: ResearchRequest;
  workspaceId: WorkspaceId | null;
  warnings: readonly ResearchWarning[];
  message: string;
  sources?: readonly ResearchSelectedSource[];
}): Promise<ReportCompletion> {
  const sources =
    input.sources ??
    (await input.dependencies.sourceRepository.listByReport({
      reportId: input.report.id,
      workspaceId: input.report.workspaceId,
    }));
  const failed = buildFailedResearchReport({
    reportId: input.report.id,
    executionId: input.report.executionId,
    workspaceId: input.workspaceId,
    question: input.request.question,
    sources,
    warnings: input.warnings,
    completedAt: isoNow(input.dependencies),
    message: input.message,
  });
  const persisted = await persistReportContent({
    dependencies: input.dependencies,
    context: input.context,
    report: failed,
  });

  await input.context.trace.addStep({
    kind: "workflow",
    name: "synthesize report",
    status: "failed",
    summary: "Research report could not be completed successfully.",
    metadata: {
      reportId: persisted.id,
      status: persisted.status,
      warningCount: persisted.warnings.length,
      sourceCount: persisted.sources.length,
    },
  });

  return {
    report: persisted,
    memoryProposalStatus: "not_eligible",
    memoryProposalIds: [],
  };
}

async function persistSearchFailure(input: {
  context: CapabilityExecutionContext;
  request: SearchRequest;
  providerId: string;
  error: unknown;
}): Promise<PersistWebEvidenceResult> {
  return input.context.web.persistEvidence({
    search: {
      request: input.request,
      providerId: input.providerId,
      query: input.request.query,
      failure: {
        category: safeFailureCategory(input.error, "search_failed"),
        message: safeErrorMessage(input.error),
      },
    },
  });
}

async function persistFailedSource(
  input: {
    dependencies: ResearchCapabilityDependencies;
    context: CapabilityExecutionContext;
    report: ResearchReport;
  },
  selected: ResearchSelectedCandidateSource,
  error: unknown,
): Promise<void> {
  await input.dependencies.sourceRepository.create({
    reportId: input.report.id,
    executionId: input.report.executionId,
    workspaceId: input.report.workspaceId,
    url: selected.url,
    finalUrl: null,
    title: selected.title,
    publishedAt: selected.publishedAt,
    selectionRank: selected.selectionRank,
    status: safeFailureCategory(error, "source_extraction_failed").startsWith("fetch_")
      ? "fetch_failed"
      : "extraction_failed",
  });
}

async function getUsableModelHealth(
  context: CapabilityExecutionContext,
  providerId: string,
  fallbackModel: string | undefined,
): Promise<ProviderHealth> {
  try {
    const health = await context.llm.getProviderHealth(providerId);

    if (health.status === "healthy" && health.model) {
      return health;
    }

    if (fallbackModel && health.status !== "disabled" && health.status !== "unavailable") {
      return { ...health, model: fallbackModel };
    }

    return health;
  } catch {
    return {
      providerId,
      kind: "ollama",
      status: "unavailable",
      checkedAt: nowIso(),
      message: "Model provider is unavailable.",
      ...(fallbackModel ? { model: fallbackModel } : {}),
    };
  }
}

function resolveWorkspaceId(
  request: ResearchRequest,
  context: CapabilityExecutionContext,
): WorkspaceId | null {
  const contextWorkspaceId = context.workspaceId ?? null;

  if (request.workspaceId !== null && contextWorkspaceId !== null) {
    if (request.workspaceId !== contextWorkspaceId) {
      throw new Error("Research request workspace does not match execution workspace.");
    }
    return request.workspaceId;
  }

  return request.workspaceId ?? contextWorkspaceId;
}

function selectSourcesForAnalysis(
  extractedSources: readonly ExtractedResearchSource[],
  ranking: ResearchSourceRankingOutput,
): ExtractedResearchSource[] {
  const recommended = new Set(
    ranking.rankings
      .filter((item) => item.recommendedForSynthesis && item.relevanceScore >= 0.2)
      .map((item) => item.sourceId),
  );
  const selected = extractedSources.filter((source) => recommended.has(source.source.id));

  return selected.length > 0 ? selected : [...extractedSources];
}

function toCandidateSearchInput(
  search: SearchRecord,
  providerId: string,
): ResearchCandidateSearchInput {
  const base = {
    queryId: search.queryId,
    searchEvidenceId: search.searchEvidenceId,
    providerId,
  };

  if (search.response) {
    return {
      ...base,
      response: search.response,
      status: "completed",
    };
  }

  return {
    ...base,
    results: [],
    status: "failed",
    failureCategory: search.failureCategory ?? "search_failed",
    failureMessage: search.failureMessage ?? "Search failed safely.",
  };
}

function buildRankingPrompt(
  request: ResearchRequest,
  sources: readonly ExtractedResearchSource[],
): string {
  return JSON.stringify({
    task: "Rank these extracted sources for the research question.",
    question: request.question,
    focus: request.focus,
    sources: sources.map((source) => ({
      sourceId: source.source.id,
      title: source.source.title,
      url: source.source.finalUrl ?? source.source.url,
      content: source.document.contentText.slice(0, 3_000),
    })),
  });
}

function buildAnalysisPrompt(
  request: ResearchRequest,
  extractedSource: ExtractedResearchSource,
): string {
  return JSON.stringify({
    task: "Analyze this extracted source for citation-backed research findings.",
    question: request.question,
    focus: request.focus,
    source: {
      sourceId: extractedSource.source.id,
      title: extractedSource.source.title,
      url: extractedSource.source.finalUrl ?? extractedSource.source.url,
      content: extractedSource.document.contentText.slice(0, 8_000),
    },
  });
}

function requireEvidenceId(source: ResearchSelectedSource): string {
  if (!source.evidenceId) {
    throw new Error(`Research source is missing extraction evidence: ${source.id}`);
  }

  return source.evidenceId;
}

function isSearchProviderUsable(health: SearchProviderHealth): boolean {
  return health.status === "healthy" || health.status === "degraded";
}

function warning(
  code: string,
  message: string,
  details?: Record<string, JsonValue>,
): ResearchWarning {
  return researchWarningSchema.parse({
    code,
    message,
    ...(details ? { details } : {}),
  });
}

function safeFailureCategory(error: unknown, fallback: string): string {
  const candidate =
    getNestedString(error, ["platformError", "details", "failureCategory"]) ??
    getNestedString(error, ["code"]) ??
    getNestedString(error, ["kind"]) ??
    fallback;

  return candidate
    .replace(/[^a-z0-9_]+/giu, "_")
    .replace(/^_+/u, "")
    .toLowerCase()
    .slice(0, 120);
}

function safeErrorMessage(error: unknown): string {
  return getNestedString(error, ["platformError", "message"]) ?? errorMessage(error);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.slice(0, 1_000);
  }

  return "Research operation failed safely.";
}

function getNestedString(error: unknown, path: readonly string[]): string | null {
  let current: unknown = error;

  for (const key of path) {
    if (typeof current !== "object" || current === null || !(key in current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" && current.trim() ? current.slice(0, 1_000) : null;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function isoNow(dependencies: Pick<ResearchCapabilityDependencies, "clock">): string {
  return dependencies.clock ? dependencies.clock().toISOString() : nowIso();
}

function compactObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as Partial<T>;
}
