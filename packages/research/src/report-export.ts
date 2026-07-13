import {
  researchReportSchema,
  type ResearchExportPlainTextInput,
  type ResearchReport,
} from "@pap/contracts";

export type ReportExportData = ResearchExportPlainTextInput;

/**
 * Generates a citation-preserving plain-text report export.
 * Output is deterministic from persisted report data.
 */
export function generatePlainTextExport(data: ReportExportData): string {
  const lines: string[] = [];

  lines.push(`Research Report`);
  lines.push(`${"=".repeat(60)}`);
  lines.push("");
  lines.push(`Question: ${data.question}`);
  lines.push(`Report ID: ${data.reportId}`);
  lines.push(`Execution ID: ${data.executionId}`);
  if (data.workspaceId) {
    lines.push(`Workspace: ${data.workspaceId}`);
  }
  lines.push(`Generated: ${formatIsoTimestamp(data.createdAt)}`);
  if (data.completedAt) {
    lines.push(`Completed: ${formatIsoTimestamp(data.completedAt)}`);
  }
  lines.push("");

  lines.push(`Summary`);
  lines.push(`${"-".repeat(60)}`);
  lines.push(data.summaryText);
  lines.push("");

  if (data.findings.length > 0) {
    lines.push(`Findings (${data.findings.length})`);
    lines.push(`${"-".repeat(60)}`);
    for (let i = 0; i < data.findings.length; i++) {
      const finding = data.findings[i];
      if (!finding) continue;
      const idx = i + 1;
      lines.push(`${idx}. ${finding.title}`);
      lines.push(`   ${finding.claimText}`);
      lines.push(`   Confidence: ${Math.round(finding.confidence * 100)}%`);
      if (finding.citationIds.length > 0) {
        const citationRefs = finding.citationIds
          .map((citationId) => {
            const citationIndex = data.citations.findIndex((c) => c.citationId === citationId);
            return citationIndex >= 0 ? `[C${citationIndex + 1}]` : `[${citationId}]`;
          })
          .join(", ");
        lines.push(`   Citations: ${citationRefs}`);
      }
      lines.push("");
    }
  }

  if (data.sources.length > 0) {
    lines.push(`Sources (${data.sources.length})`);
    lines.push(`${"-".repeat(60)}`);
    for (let i = 0; i < data.sources.length; i++) {
      const source = data.sources[i];
      if (!source) continue;
      const idx = i + 1;
      lines.push(`S${idx}. ${source.title ?? source.url}`);
      lines.push(`    URL: ${source.finalUrl ?? source.url}`);
      if (source.relevanceScore !== null) {
        lines.push(`    Relevance: ${Math.round(source.relevanceScore * 100)}%`);
      }
      lines.push(`    Status: ${source.status}`);
      lines.push("");
    }
  }

  if (data.citations.length > 0) {
    lines.push(`Citations (${data.citations.length})`);
    lines.push(`${"-".repeat(60)}`);
    for (let i = 0; i < data.citations.length; i++) {
      const citation = data.citations[i];
      if (!citation) continue;
      const idx = i + 1;
      lines.push(`C${idx}. Source: ${citation.sourceTitle}`);
      lines.push(`    URL: ${citation.sourceUrl}`);
      lines.push(`    Claim: ${citation.claimText}`);
      if (citation.sourceExcerpt) {
        lines.push(`    Excerpt: ${citation.sourceExcerpt}`);
      }
      lines.push("");
    }
  }

  if (data.warnings.length > 0) {
    lines.push(`Warnings (${data.warnings.length})`);
    lines.push(`${"-".repeat(60)}`);
    for (const warning of data.warnings) {
      lines.push(`- [${warning.code}] ${warning.message}`);
    }
    lines.push("");
  }

  if (data.limitations.length > 0) {
    lines.push(`Limitations (${data.limitations.length})`);
    lines.push(`${"-".repeat(60)}`);
    for (const limitation of data.limitations) {
      lines.push(`- [${limitation.code}] ${limitation.message}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

/**
 * Generates a citation-preserving Markdown export.
 * Output is deterministic from persisted report data.
 */
export function generateMarkdownExport(data: ReportExportData): string {
  const lines: string[] = [];

  lines.push(`# Research Report`);
  lines.push("");
  lines.push(`**Question:** ${escapeMarkdownInline(data.question)}`);
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Report ID | \`${data.reportId}\` |`);
  lines.push(`| Execution ID | \`${data.executionId}\` |`);
  if (data.workspaceId) {
    lines.push(`| Workspace | \`${data.workspaceId}\` |`);
  }
  lines.push(`| Created | ${formatIsoTimestamp(data.createdAt)} |`);
  if (data.completedAt) {
    lines.push(`| Completed | ${formatIsoTimestamp(data.completedAt)} |`);
  }
  lines.push("");

  lines.push(`## Summary`);
  lines.push("");
  lines.push(data.summaryText);
  lines.push("");

  if (data.findings.length > 0) {
    lines.push(`## Findings (${data.findings.length})`);
    lines.push("");
    for (let i = 0; i < data.findings.length; i++) {
      const finding = data.findings[i];
      if (!finding) continue;
      const idx = i + 1;
      lines.push(`### ${idx}. ${escapeMarkdownInline(finding.title)}`);
      lines.push("");
      lines.push(finding.claimText);
      lines.push("");
      lines.push(`- **Confidence:** ${Math.round(finding.confidence * 100)}%`);
      if (finding.citationIds.length > 0) {
        const citationRefs = finding.citationIds
          .map((citationId) => {
            const citationIndex = data.citations.findIndex((c) => c.citationId === citationId);
            return citationIndex >= 0 ? `[C${citationIndex + 1}]` : `[${citationId}]`;
          })
          .join(", ");
        lines.push(`- **Citations:** ${citationRefs}`);
      }
      lines.push("");
    }
  }

  if (data.sources.length > 0) {
    lines.push(`## Sources (${data.sources.length})`);
    lines.push("");
    for (let i = 0; i < data.sources.length; i++) {
      const source = data.sources[i];
      if (!source) continue;
      const idx = i + 1;
      const displayUrl = source.finalUrl ?? source.url;
      lines.push(
        `### S${idx}. ${source.title ? escapeMarkdownInline(source.title) : escapeMarkdownInline(displayUrl)}`,
      );
      lines.push("");
      lines.push(`- **URL:** <${displayUrl}>`);
      if (source.relevanceScore !== null) {
        lines.push(`- **Relevance:** ${Math.round(source.relevanceScore * 100)}%`);
      }
      lines.push(`- **Status:** ${source.status}`);
      lines.push("");
    }
  }

  if (data.citations.length > 0) {
    lines.push(`## Citations (${data.citations.length})`);
    lines.push("");
    for (let i = 0; i < data.citations.length; i++) {
      const citation = data.citations[i];
      if (!citation) continue;
      const idx = i + 1;
      lines.push(`### C${idx}. ${escapeMarkdownInline(citation.sourceTitle)}`);
      lines.push("");
      const citationLines: string[] = [];
      citationLines.push(`- **URL:** <${citation.sourceUrl}>`);
      citationLines.push(`- **Claim:** ${escapeMarkdownInline(citation.claimText)}`);
      if (citation.sourceExcerpt) {
        citationLines.push(`- **Excerpt:** ${escapeMarkdownInline(citation.sourceExcerpt)}`);
      }
      lines.push(citationLines.join("  \n"));
      lines.push("");
    }
  }

  if (data.warnings.length > 0) {
    lines.push(`## Warnings (${data.warnings.length})`);
    lines.push("");
    for (const warning of data.warnings) {
      const combined = `[${warning.code}] ${warning.message}`;
      if (combined.length > 500) {
        continue;
      }
      lines.push(`- **${warning.code}:** ${escapeMarkdownInline(warning.message)}`);
    }
    lines.push("");
  }

  if (data.limitations.length > 0) {
    lines.push(`## Limitations (${data.limitations.length})`);
    lines.push("");
    for (const limitation of data.limitations) {
      const combined = `[${limitation.code}] ${limitation.message}`;
      if (combined.length > 500) {
        continue;
      }
      lines.push(`- **${limitation.code}:** ${escapeMarkdownInline(limitation.message)}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

/**
 * Generates a JSON export for personal backup/debugging.
 * Output is deterministic from persisted report data.
 * Does not include hidden reasoning, raw provider output, credentials,
 * cookies, or stack traces.
 */
export function generateJsonExport(report: ResearchReport): string {
  const safePersistedReport = researchReportSchema.parse(report);
  return `${JSON.stringify(safePersistedReport, null, 2)}\n`;
}

function formatIsoTimestamp(isoTimestamp: string): string {
  return isoTimestamp.replace("T", " ").replace(/\.\d{3}Z$/u, " UTC");
}

function escapeMarkdownInline(text: string): string {
  if (!/[\\*_{}[\]()#+\-.!|<>`]|[0-9]\.\s/u.test(text)) {
    return text;
  }

  const lines = text.split("\n");
  if (lines.length > 1 && lines.every((line) => line.length <= 100)) {
    return lines.map((line) => escapeLine(line)).join("  \n");
  }

  return escapeLine(text);
}

function escapeLine(line: string): string {
  const blockSpecial = /[\\*_{}[\]()#+\-.!|]/gu;
  const otherChars = /[<>]/gu;

  let escaped = line.replace(blockSpecial, "\\$&");
  escaped = escaped.replace(otherChars, "\\$&");

  return escaped;
}
