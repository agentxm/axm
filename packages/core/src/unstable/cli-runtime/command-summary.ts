import type { TelemetryProperties } from "../telemetry/client.js";

// ---------------------------------------------------------------------------
// Bounded vocabularies
// ---------------------------------------------------------------------------

export type CommandOutcome = "applied" | "previewed" | "no-op" | "cancelled";

export type SubjectType =
  | "skill"
  | "command"
  | "files"
  | "rule"
  | "hook"
  | "subagent"
  | "pack"
  | "library"
  | "mcp-server"
  | "mixed"
  | "unknown";

export type SourceKind = "registry" | "git" | "local" | "workspace" | "mixed" | "unknown";

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

export interface CommandOutcomeSummary {
  readonly outcome?: CommandOutcome;
  readonly subjectType?: SubjectType;
  readonly sourceKind?: SourceKind;
  readonly appliedCount?: number;
  readonly failedCount?: number;
  readonly blockedCount?: number;
}

// ---------------------------------------------------------------------------
// summarizeCommandOutcome
// ---------------------------------------------------------------------------

/**
 * Maps a structured plan resolution outcome to standardized `cli.*` telemetry
 * properties. Only defined fields are included in the output record; undefined
 * fields are omitted entirely.
 */
export const summarizeCommandOutcome = (summary: CommandOutcomeSummary): TelemetryProperties => {
  const properties: Record<string, string | number | boolean | null> = {};

  if (summary.outcome !== undefined) {
    properties["cli.outcome"] = summary.outcome;
  }

  if (summary.subjectType !== undefined) {
    properties["cli.subject_type"] = summary.subjectType;
  }

  if (summary.sourceKind !== undefined) {
    properties["cli.source_kind"] = summary.sourceKind;
  }

  if (summary.appliedCount !== undefined) {
    properties["cli.applied_count"] = summary.appliedCount;
  }

  if (summary.failedCount !== undefined) {
    properties["cli.failed_count"] = summary.failedCount;
  }

  if (summary.blockedCount !== undefined) {
    properties["cli.blocked_count"] = summary.blockedCount;
  }

  return properties;
};
