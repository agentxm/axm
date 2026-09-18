import type {
  BlockingClass,
  OperationOutcome,
  OperationPhase,
  OperationPresentation,
  ProgressUnit,
  SettledOutcome,
  UnitDisposition,
  UnitState,
  UnitStateCounts,
} from "@agentxm/workspace/transitions/planning";
import type { ArtifactChange, ConfiguredAgentOutcome } from "@agentxm/workspace/desired-state";

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

/**
 * How long is left before a handoff expires, as an open wait says it. A wait
 * that has run out says so rather than counting past zero.
 */
export const remainingTime = (remainingMs: number): string => {
  if (remainingMs <= 0) return "expired";
  const seconds = Math.ceil(remainingMs / 1_000);
  if (seconds < 60) return `${String(seconds)}s left`;
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes)}m ${String(seconds % 60)}s left`;
};

/** The word one of an open wait's keys carries. */
export const waitKeyWord = (action: "open" | "copy" | "stop"): string => {
  switch (action) {
    case "open":
      return "open";
    case "copy":
      return "copy";
    case "stop":
      return "stop";
    default:
      return unreachable(action);
  }
};

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

/** The process exit code a problem ends with, as its aside states it. */
export const exitPhrase = (code: number): string => `exit ${String(code)}`;

/**
 * What a result row says about a unit the operation stopped before: it was
 * never attempted, which is not the same as being blocked by a condition of
 * its own.
 */
export const NOT_TRIED = "not tried";

/** Why a row rolled back when the unit was still running as the operation stopped. */
export const INTERRUPTED_IN_FLIGHT = "interrupted in flight";

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

/**
 * What a live ledger row says about a unit that has not settled. A running
 * unit usually names the work in flight instead; this is what a row says when
 * nothing more specific is known.
 */
export const liveUnitActivity = (value: "waiting" | "running" | "paused"): string => {
  switch (value) {
    case "waiting":
      return "waiting";
    case "running":
      return "working";
    case "paused":
      return "paused";
    default:
      return unreachable(value);
  }
};

/** How far a running unit has come, in the unit its producer measured. */
export const progressMeasure = (measure: {
  readonly done: number;
  readonly total?: number;
  readonly unit: ProgressUnit;
}): string => {
  switch (measure.unit) {
    case "bytes":
      return measure.total === undefined
        ? bytes(measure.done)
        : `${bytes(measure.done)} / ${bytes(measure.total)}`;
    case "files":
    case "items":
      return measure.total === undefined
        ? `${String(measure.done)} ${measure.unit}`
        : `${String(measure.done)}/${String(measure.total)} ${measure.unit}`;
    default:
      return unreachable(measure.unit);
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
    case "human-required":
      return "a person must act";
    case "operation-aborted":
      return "the operation was stopped";
    default:
      return unreachable(value);
  }
};

/** What the terminal is parked on while it waits on the system rather than a person. */
export const systemWaitStatus = (value: BlockingClass): string =>
  `Waiting — ${blockingClass(value)}`;

/**
 * What stopping a system wait costs, where that is known. Contention for the
 * workspace is decided before anything is written, so leaving it changes
 * nothing.
 */
export const systemWaitHint = (value: BlockingClass): string | undefined =>
  value === "resource-conflict" ? "ctrl-c stops waiting; nothing has been changed" : undefined;

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
    case "human-required":
      return "Waiting on a person";
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

/**
 * What a publish plan ledger says an extension will do: be uploaded, or be
 * skipped because the registry already holds that exact version.
 */
export const publishParticipation = (value: PublishParticipation): string => {
  switch (value) {
    case "publish":
      return "publish";
    case "verified-existing":
      return "skip";
    default:
      return unreachable(value);
  }
};

/** Why a publish row skips an extension the registry already holds. */
export const ALREADY_PUBLISHED = "already published";

/** What a publish result row says became of an extension. */
export const publishOutcome = (
  value: "published" | "failed" | "unconfirmed" | "blocked" | "skipped",
): string => {
  switch (value) {
    case "published":
      return "published";
    case "failed":
      return "failed";
    case "unconfirmed":
      return "unconfirmed";
    case "blocked":
      return "blocked";
    case "skipped":
      return "skip";
    default:
      return unreachable(value);
  }
};

export type PublishPhase =
  | "selection"
  | "authoritative_preflight"
  | "authorization"
  | "dependency_execution"
  | "upload_execution";

export const publishPhase = (value: PublishPhase): string => {
  switch (value) {
    case "selection":
      return "selection";
    case "authoritative_preflight":
      return "authoritative preflight";
    case "authorization":
      return "authorization";
    case "dependency_execution":
      return "dependency execution";
    case "upload_execution":
      return "upload";
    default:
      return unreachable(value);
  }
};

export type PublishVisibilitySource =
  "manifest" | "workspace" | "explicit" | "account" | "platform" | "existing";

/**
 * Where an extension's visibility came from: set by an input for a new
 * extension, or kept from the publication the registry already holds.
 */
export const publishVisibilityOrigin = (
  disposition: "establish" | "preserve",
  source: PublishVisibilitySource,
): string => {
  const from = (() => {
    switch (source) {
      case "manifest":
        return "the manifest";
      case "workspace":
        return "workspace settings";
      case "explicit":
        return "the command";
      case "account":
        return "account settings";
      case "platform":
        return "platform defaults";
      case "existing":
        return "the existing publication";
      default:
        return unreachable(source);
    }
  })();
  return `${disposition === "establish" ? "from" : "kept from"} ${from}`;
};

/** A Git revision as a person compares it: the short form Git itself prints. */
const shortRevision = (revision: string): string => revision.slice(0, 7);

/** How an extension's source relates to the Git HEAD the archive was compared with. */
export const publishSourceState = (
  status: "matches-head" | "differs-from-head" | "no-head",
  revision: string | undefined,
): string => {
  switch (status) {
    case "matches-head":
      return revision === undefined
        ? "matches Git HEAD"
        : `matches Git HEAD ${shortRevision(revision)}`;
    case "differs-from-head":
      return revision === undefined
        ? "differs from Git HEAD"
        : `differs from Git HEAD ${shortRevision(revision)}`;
    case "no-head":
      return "no Git HEAD to compare with";
    default:
      return unreachable(status);
  }
};

/** The archive paths that keep a working tree from matching Git HEAD. */
export const publishSourceDifferences = (differenceCount: number): string =>
  `${count(differenceCount, "path")} ${differenceCount === 1 ? "differs" : "differ"} from HEAD`;

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

/** The mark a ledger row carries for an artifact that changed as planned. */
export const artifactChangeMark = (value: ArtifactChange): Change => {
  switch (value) {
    case "created":
      return "create";
    case "updated":
      return "update";
    case "unchanged":
      return "unchanged";
    case "removed":
      return "remove";
    default:
      return unreachable(value);
  }
};

/**
 * What a plan ledger says will happen to one unit. The words are the
 * workspace's own — an extension is installed, updated, or removed — not the
 * invoking verb's: the title line already names the command, and one
 * operation such as `sync` plans all three at once.
 */
export const plannedArtifactChange = (value: ArtifactChange): string => {
  switch (value) {
    case "created":
      return "install";
    case "updated":
      return "update";
    case "unchanged":
      return "already current";
    case "removed":
      return "remove";
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

/**
 * The title line every plan-family command opens with: what it is doing, in
 * the operation's own verb. The ledger beneath it carries the units and the
 * verdict beneath that states the outcome.
 */
export const operationTitle = (
  presentation: OperationPresentation,
  mode: "preview" | "apply",
): string =>
  mode === "preview" ? `Previewing ${presentation.verb.imperative}` : presentation.verb.gerund;

/** The subject noun alone, pluralized for a count that is stated separately. */
export const subjectNoun = (presentation: OperationPresentation, value: number): string =>
  value === 1 ? presentation.subject.singular : presentation.subject.plural;

/** The header a ledger's name column carries for an operation's subject. */
export const subjectHeader = (presentation: OperationPresentation): string =>
  `${presentation.subject.singular.slice(0, 1).toUpperCase()}${presentation.subject.singular.slice(1)}`;

/** Where an operation acts, for the aside on its title line. */
export const scopePhrase = (scope: "project" | "user"): string =>
  scope === "project" ? "in this project" : "for this user";

/**
 * What a plan ledger's verdict states: the change it would make. Units that
 * are already current are not part of the claim; they are part of its aside.
 */
export const planVerdict = (
  presentation: OperationPresentation,
  mode: "preview" | "apply",
  changing: number,
): string =>
  changing === 0
    ? "Already up to date"
    : `${mode === "preview" ? "Would" : "Ready to"} ${presentation.verb.imperative} ${subjectCount(presentation, changing)}`;

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
    // The counts belong to the verdict's aside, not its claim.
    case "no-op":
      return counts.total === 0
        ? `Nothing to ${presentation.verb.imperative}`
        : "Already up to date";
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

export const phaseLabel = (phase: OperationPhase): string => {
  switch (phase) {
    case "resolution":
      return "resolving sources";
    case "planning":
      return "planning";
    case "preview":
      return "previewing";
    case "confirmation":
      return "awaiting confirmation";
    case "validation":
      return "validating";
    case "apply":
      return "applying";
    case "restoration":
      return "rolling back";
    default:
      return unreachable(phase);
  }
};

export const settledOutcomeTone = (outcome: SettledOutcome): Tone => {
  switch (outcome) {
    case "previewed":
    case "applied":
    case "no-op":
    case "completed":
      return "ok";
    case "partial":
    case "blocked":
    case "cancelled":
      return "warn";
    case "failed":
    case "interrupted":
      return "error";
    default:
      return unreachable(outcome);
  }
};
