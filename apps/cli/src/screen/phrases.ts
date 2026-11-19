import type {
  BlockingClass,
  OperationOutcome,
  OperationPhase,
  OperationPresentation,
  ProgressAttempt,
  ProgressUnit,
  SettledOutcome,
  UnitDisposition,
  UnitState,
  UnitStateCounts,
  ArtifactChange,
  ConfiguredAgentOutcome,
} from "@agentxm/workspace-kernel/operations";

import type { Change, Tone } from "./doc.js";
import { bytes, capitalized, count } from "./grammar.js";

const unreachable = (value: never): never => {
  throw new Error(`Unrecognized CLI vocabulary: ${String(value)}`);
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
      return "changed";
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

/**
 * What a planned row says in place of a version when the operation has not yet
 * resolved what it will move to. A dash reads as "there is none"; a plan that
 * has not resolved its target yet has one it does not know.
 */
export const PENDING_VERSION = "pending";

/**
 * What a cell or field says in place of a value there is none of: a version
 * nothing reported, a title a concept does not carry, an activation that does
 * not apply. A dash reads as "there is none" in every mode, so the marker is
 * the same in Unicode and ASCII output and AXM prints no symbol of its own
 * for it.
 */
export const ABSENT = "-";

/** Why a row rolled back when the unit was still running as the operation stopped. */
export const INTERRUPTED_IN_FLIGHT = "interrupted in flight";

/**
 * Why a row was never tried, when nothing more specific stopped it. A unit the
 * operation stopped before still owes the reader a reason; this is the one it
 * has when no blocking condition named a subject of its own.
 */
export const notTriedReason = (presentation: OperationPresentation): string =>
  `The operation stopped before this ${presentation.subject.singular}.`;

/**
 * What a row says when its producer settled it unsettled and supplied no
 * reason. Saying so is information; a blank line beneath a failed row is not.
 */
export const UNREPORTED_REASON = "no reason was reported";

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

/**
 * That a running unit is on a later attempt, and how many its producer may
 * make. Both numbers count attempts (including the first); a first attempt is
 * not a retry and says nothing.
 */
export const retryAttempt = (attempt: ProgressAttempt): string | undefined =>
  attempt.n <= 1 ? undefined : `retry ${String(attempt.n)} of ${String(attempt.of)}`;

export const disposition = (value: UnitDisposition): string => {
  switch (value) {
    case "restored":
      return "effects were restored";
    case "retained":
      return "partial work was retained";
    case "untouched":
      return "no changes were made";
    case "unknown":
      return "settlement was not observed";
    default:
      return unreachable(value);
  }
};

/**
 * The same settlement fact as a sentence of its own, for a reason line whose
 * producer already finished its own sentence.
 */
export const dispositionStatement = (value: UnitDisposition): string => {
  return `${capitalized(disposition(value))}.`;
};

/**
 * What became of every unit that did not settle as planned, where they were
 * all left in the same state. A partial operation whose closures each rolled
 * themselves back says it once beneath its verdict instead of repeating it on
 * every row, and names what the claim covers so its scope is not guessed at.
 */
export const sharedDispositionStatement = (
  presentation: OperationPresentation,
  value: UnitDisposition,
): string => {
  const subjects = capitalized(presentation.subject.plural);
  switch (value) {
    case "restored":
      return `${subjects} that did not settle were restored.`;
    case "retained":
      return `${subjects} that did not settle kept their partial work.`;
    case "untouched":
      return `${subjects} that did not settle were left unchanged.`;
    case "unknown":
      return `AXM could not observe how the ${presentation.subject.plural} that did not settle were left.`;
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
  `Waiting because ${blockingClass(value)}`;

/**
 * The one way every command says that it left the workspace as it found it,
 * as the fact a verdict's aside states.
 */
export const NO_CHANGES_MADE = "no changes made";

/**
 * A verdict in two parts: the claim, bold and toned, and the consequence
 * that qualifies it. The painter sets the consequence as the first fact of
 * the verdict's aside, so no phrase spells the separator between them.
 */
export interface VerdictPhrase {
  readonly claim: string;
  readonly consequence?: string;
}

/** The facts a verdict's aside states, its consequence first. */
export const verdictFacts = (
  verdict: VerdictPhrase,
  facts: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  verdict.consequence === undefined ? facts : [verdict.consequence, ...facts];

export const interruptionPhrase = (
  signal: "SIGINT" | "SIGTERM",
  disposition: UnitDisposition,
): VerdictPhrase => {
  const claim = signal === "SIGINT" ? "Interrupted" : "Terminated";
  switch (disposition) {
    case "restored":
      return { claim, consequence: "changes rolled back" };
    case "retained":
      return { claim, consequence: "partial work kept" };
    case "untouched":
      return { claim, consequence: NO_CHANGES_MADE };
    case "unknown":
      return { claim, consequence: "settlement unknown" };
    default:
      return unreachable(disposition);
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
      return "available";
    case "current":
      return "already available";
    case "not-applicable":
      return "not used by this agent";
    case "unsupported":
      return "not supported by this agent";
    case "blocked":
      return "not updated";
    case "failed":
      return "update failed";
    default:
      return unreachable(value);
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

/**
 * The title line of a settled result: the command it records, named in its
 * imperative. The work is over, so the result no longer says it is going on.
 */
export const settledTitle = (presentation: OperationPresentation): string =>
  capitalized(presentation.verb.imperative);

/**
 * The verdict of an operation that changed nothing because every change it
 * made was undone: what did not happen, then why the workspace is as it was.
 * The rows above name the failure, so the verdict does not count them again.
 */
export const rolledBackVerdict = (presentation: OperationPresentation): VerdictPhrase => ({
  claim: nothingChangedVerdict(presentation),
  consequence: "all changes rolled back",
});

/**
 * The verdict of a failed operation that changed nothing. A count of the
 * units it failed to change would overstate the failure where most of them
 * were never reached; the aside counts how each one ended instead.
 */
export const nothingChangedVerdict = (presentation: OperationPresentation): string =>
  `Nothing ${presentation.verb.past.toLowerCase()}`;

/** The subject noun alone, pluralized for a count that is stated separately. */
export const subjectNoun = (presentation: OperationPresentation, value: number): string =>
  value === 1 ? presentation.subject.singular : presentation.subject.plural;

/** The header a ledger's name column carries for an operation's subject. */
export const subjectHeader = (presentation: OperationPresentation): string =>
  capitalized(presentation.subject.singular);

/**
 * Where an operation acts, for the aside on its title line: the project by its
 * directory's name where that is known, so a reader with several checkouts
 * open sees which one changed.
 */
export const scopePhrase = (scope: "project" | "user", project?: string): string =>
  scope === "user" ? "for this user" : project === undefined ? "in this project" : `in ${project}`;

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
): VerdictPhrase => {
  switch (outcome) {
    case "previewed":
      return {
        claim: `Would ${presentation.verb.imperative} ${subjectCount(presentation, counts.total)}`,
      };
    case "applied":
      return { claim: `${presentation.verb.past} ${subjectCount(presentation, counts.committed)}` };
    // The counts belong to the verdict's aside, not its claim.
    case "no-op":
      return {
        claim:
          counts.total === 0 ? `Nothing to ${presentation.verb.imperative}` : "Already up to date",
      };
    case "partial":
      return { claim: `Partially ${presentation.verb.past.toLowerCase()}` };
    case "failed":
      return {
        claim: `Failed to ${presentation.verb.imperative} ${subjectCount(presentation, Math.max(1, counts.total))}`,
      };
    case "blocked":
      return { claim: `${capitalized(presentation.verb.imperative)} is blocked` };
    case "cancelled":
      return { claim: "Cancelled", consequence: NO_CHANGES_MADE };
    case "interrupted":
      return { claim: "Interrupted" };
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
    case "acquisition":
      return "acquiring content";
    case "apply":
      return "applying changes";
    case "verification":
      return "verifying agent output";
    case "restoration":
      return "restoring affected changes";
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
    case "pending-human":
    case "indeterminate":
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
