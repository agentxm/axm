import type {
  BlockingClass,
  OperationOutcome,
  OperationPresentation,
  UnitDisposition,
  UnitState,
  UnitStateCounts,
} from "@agentxm/workspace-operations";
import type { ArtifactChange, ConfiguredAgentOutcome } from "@agentxm/workspace-state";

import type { Change, Tone } from "./doc.js";

const unreachable = (value: never): never => {
  throw new Error(`Unrecognized CLI vocabulary: ${String(value)}`);
};

export interface VerbForms {
  readonly imperative: string;
  readonly past: string;
  readonly gerund: string;
}

export const Verbs = {
  install: { imperative: "install", past: "Installed", gerund: "Installing" },
  update: { imperative: "update", past: "Updated", gerund: "Updating" },
  uninstall: { imperative: "uninstall", past: "Uninstalled", gerund: "Uninstalling" },
  create: { imperative: "create", past: "Created", gerund: "Creating" },
  enable: { imperative: "enable", past: "Enabled", gerund: "Enabling" },
  disable: { imperative: "disable", past: "Disabled", gerund: "Disabling" },
  sync: { imperative: "sync", past: "Synced", gerund: "Syncing" },
  publish: { imperative: "publish", past: "Published", gerund: "Publishing" },
  adopt: { imperative: "adopt", past: "Adopted", gerund: "Adopting" },
  fork: { imperative: "fork", past: "Forked", gerund: "Forking" },
  import: { imperative: "import", past: "Imported", gerund: "Importing" },
} satisfies Record<string, VerbForms>;

export const count = (value: number, singular: string, plural = `${singular}s`): string =>
  `${value} ${value === 1 ? singular : plural}`;

export const bytes = (value: number): string => {
  if (value < 1_000) return `${value} B`;
  if (value < 1_000_000) return `${Math.round(value / 100) / 10} KB`;
  return `${Math.round(value / 100_000) / 10} MB`;
};

export const duration = (elapsedMs: number): string =>
  elapsedMs < 1_000
    ? `${Math.max(0, Math.round(elapsedMs))}ms`
    : `${Math.round(elapsedMs / 100) / 10}s`;

export const unitState = (state: UnitState): string => {
  switch (state) {
    case "planned":
      return "planned";
    case "ready":
      return "ready";
    case "committed":
      return "applied";
    case "unchanged":
      return "already current";
    case "failed":
      return "failed";
    case "rolled-back":
      return "rolled back";
    case "blocked":
      return "blocked";
    case "skipped":
      return "not selected";
    case "cancelled":
      return "cancelled";
    case "interrupted":
      return "interrupted";
    default:
      return unreachable(state);
  }
};

export const unitStateChange = (state: UnitState): Change => {
  switch (state) {
    case "planned":
    case "ready":
    case "committed":
      return "create";
    case "unchanged":
    case "skipped":
    case "cancelled":
      return "unchanged";
    case "failed":
      return "failed";
    case "rolled-back":
      return "rolled-back";
    case "blocked":
    case "interrupted":
      return "blocked";
    default:
      return unreachable(state);
  }
};

export const disposition = (value: UnitDisposition): string => {
  switch (value) {
    case "restored":
      return "effects were restored";
    case "retained":
      return "partial work was retained";
    case "untouched":
      return "no changes were applied";
    case "unknown":
      return "settlement was not observed";
    default:
      return unreachable(value);
  }
};

export const blockingClass = (value: BlockingClass): string => {
  switch (value) {
    case "approval-required":
      return "approval is required";
    case "override-required":
      return "an explicit override is required";
    case "precondition-unmet":
      return "a precondition is not met";
    case "dependency-failed":
      return "a dependency failed";
    case "dependency-cycle":
      return "dependencies form a cycle";
    case "stale-candidate":
      return "the operation changed while it was waiting";
    case "policy-excluded":
      return "policy excludes this operation";
    case "resource-conflict":
      return "another operation holds the workspace";
    case "external-blocked":
      return "an external service blocked the operation";
    case "operation-aborted":
      return "the operation was stopped";
    default:
      return unreachable(value);
  }
};

export const artifactChange = (value: ArtifactChange): string => {
  switch (value) {
    case "created":
      return "created";
    case "updated":
      return "updated";
    case "unchanged":
      return "already current";
    case "removed":
      return "removed";
    default:
      return unreachable(value);
  }
};

export const agentOutcome = (value: ConfiguredAgentOutcome["outcome"]): string => {
  switch (value) {
    case "projected":
      return "projected";
    case "current":
      return "already current";
    case "not-applicable":
      return "not applicable";
    case "unsupported":
      return "not supported by this agent";
    case "blocked":
      return "blocked";
    case "failed":
      return "failed";
    default:
      return unreachable(value);
  }
};

export const severityTone = (severity: "info" | "warning" | "error"): Tone => {
  switch (severity) {
    case "info":
      return "info";
    case "warning":
      return "warn";
    case "error":
      return "error";
    default:
      return unreachable(severity);
  }
};

const subjectCount = (presentation: OperationPresentation, value: number): string =>
  count(value, presentation.subject.singular, presentation.subject.plural);

export const outcomeHeadline = (
  presentation: OperationPresentation,
  outcome: OperationOutcome,
  counts: UnitStateCounts,
): string => {
  switch (outcome) {
    case "previewed":
      return `Would ${presentation.verb.imperative} ${subjectCount(presentation, counts.total)}`;
    case "applied":
      return `${presentation.verb.past} ${subjectCount(presentation, counts.committed)}`;
    case "no-op":
      return counts.total === 0
        ? `Nothing to ${presentation.verb.imperative}`
        : `Already up to date — ${subjectCount(presentation, counts.total)}`;
    case "partial":
      return `Partially ${presentation.verb.past.toLowerCase()} — ${counts.committed} changed, ${counts.failed + counts.blocked} unfinished`;
    case "failed":
      return `Failed to ${presentation.verb.imperative} ${subjectCount(presentation, Math.max(1, counts.total))}`;
    case "blocked":
      return `${presentation.verb.imperative[0]?.toUpperCase() ?? ""}${presentation.verb.imperative.slice(1)} is blocked`;
    case "cancelled":
      return "Cancelled — no changes applied";
    case "interrupted":
      return "Interrupted";
    default:
      return unreachable(outcome);
  }
};
