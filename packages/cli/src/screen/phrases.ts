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

export const blockingHeadline = (value: BlockingClass): string => {
  switch (value) {
    case "approval-required":
      return "Approval required";
    case "override-required":
      return "Override required";
    case "precondition-unmet":
      return "Precondition not met";
    case "dependency-failed":
      return "Dependency failed";
    case "dependency-cycle":
      return "Dependency cycle";
    case "stale-candidate":
      return "Operation changed while waiting";
    case "policy-excluded":
      return "Excluded by policy";
    case "resource-conflict":
      return "Workspace is busy";
    case "external-blocked":
      return "External service blocked the operation";
    case "operation-aborted":
      return "Operation stopped";
    default:
      return unreachable(value);
  }
};

export const interruptionPhrase = (
  signal: "SIGINT" | "SIGTERM",
  disposition: "none" | UnitDisposition,
): string => {
  const prefix = signal === "SIGINT" ? "Interrupted" : "Terminated";
  switch (disposition) {
    case "restored":
      return `${prefix} — changes rolled back`;
    case "retained":
      return `${prefix} — partial work retained`;
    case "untouched":
    case "none":
      return `${prefix} — no changes applied`;
    case "unknown":
      return `${prefix} — settlement unknown`;
    default:
      return unreachable(disposition);
  }
};

export type PublishParticipation = "publish" | "verified-existing";

export const publishParticipation = (value: PublishParticipation): string => {
  switch (value) {
    case "publish":
      return "will publish";
    case "verified-existing":
      return "already published and verified";
    default:
      return unreachable(value);
  }
};

export type PublishDisposition =
  "included" | "excluded" | "unmanaged" | "not-authored" | "not-publishable" | "unmatched";

export const publishDisposition = (value: PublishDisposition): string => {
  switch (value) {
    case "included":
      return "included";
    case "excluded":
      return "excluded by selection";
    case "unmanaged":
      return "not managed by this workspace";
    case "not-authored":
      return "not authored here";
    case "not-publishable":
      return "not publishable";
    case "unmatched":
      return "did not match";
    default:
      return unreachable(value);
  }
};

export type PublishReason =
  | "selected"
  | "excluded"
  | "unmanaged"
  | "unmatched_selector"
  | "version_already_published"
  | "not_authored"
  | "not_publishable"
  | "invalid_workspace_source"
  | "authorization_failed"
  | "authoritative_preflight_failed"
  | "dependency_unavailable"
  | "candidate_invalid"
  | "stale_material"
  | "publish_precondition_changed"
  | "upload_failed"
  | "integrity_conflict"
  | "settlement_unresolved"
  | "authorization_expired"
  | "blocked_by_dependency"
  | "interrupted"
  | "version_exists"
  | "integrity_drift"
  | "verify_failed"
  | "blocked_by_preflight"
  | "source_state_not_accepted";

export const publishReason = (value: PublishReason): string => {
  switch (value) {
    case "selected":
      return "selected";
    case "excluded":
      return "excluded";
    case "unmanaged":
      return "not managed by this workspace";
    case "unmatched_selector":
      return "selector did not match";
    case "version_already_published":
      return "version already published";
    case "not_authored":
      return "not authored here";
    case "not_publishable":
      return "not publishable";
    case "invalid_workspace_source":
      return "workspace source is invalid";
    case "authorization_failed":
      return "authorization failed";
    case "authoritative_preflight_failed":
      return "authoritative preflight failed";
    case "dependency_unavailable":
      return "dependency unavailable";
    case "candidate_invalid":
      return "candidate is invalid";
    case "stale_material":
      return "source material changed";
    case "publish_precondition_changed":
      return "publish precondition changed";
    case "upload_failed":
      return "upload failed";
    case "integrity_conflict":
      return "published content has different integrity";
    case "settlement_unresolved":
      return "registry settlement could not be verified";
    case "authorization_expired":
      return "authorization expired";
    case "blocked_by_dependency":
      return "blocked by a dependency";
    case "interrupted":
      return "interrupted";
    case "version_exists":
      return "version already exists";
    case "integrity_drift":
      return "published integrity differs";
    case "verify_failed":
      return "verification failed";
    case "blocked_by_preflight":
      return "blocked by preflight";
    case "source_state_not_accepted":
      return "source state was not accepted";
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
