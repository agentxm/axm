/**
 * Conversions from typed workspace failures into `StepFailure` values that a
 * plan resolution embeds. Category, detail, and suggestion strings are the
 * plan pipeline's serialized contract: they must stay byte-identical to the
 * CLI boundary's `AppError` renderings of the same failures, so machine
 * output does not depend on which side of the seam rendered the failure.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import type {
  ConfiguredAgentOutcomesUnavailable,
  WorkspaceRestorationIncomplete,
  WorkspaceStateReadFailure,
  WorkspaceTransactionFailure,
} from "@agentxm/workspace-state";
import {
  STALE_CANDIDATE_DETAIL,
  StaleExecutionCandidate,
  StepFailure,
  type CandidateFingerprintFailed,
} from "./errors.js";

/** Translate a scoped settings- or lockfile-read failure, naming the fix. */
export const workspaceStateReadFailureToStepFailure = (
  error: WorkspaceStateReadFailure,
): StepFailure => {
  switch (error._tag) {
    case "SettingsDecodeError":
      return new StepFailure({
        category: "validation",
        detail: `Invalid workspace settings at ${error.path}: ${error.issues.join("; ")}`,
        suggestions: [
          { description: "Edit the settings file to fix the invalid value, then re-run." },
        ],
        cause: error,
      });
    case "SettingsParseError":
      return new StepFailure({
        category: "validation",
        detail: `Workspace settings at ${error.path} are not valid JSON`,
        suggestions: [{ description: "Fix the JSON syntax in the settings file, then re-run." }],
        cause: error,
      });
    case "SettingsIoError":
      return new StepFailure({
        category: "validation",
        detail: `Workspace settings at ${error.path} could not be read`,
        suggestions: [
          {
            description: "Repair the settings file permissions or restore the file, then re-run.",
          },
        ],
        cause: error,
      });
    case "LockfileIoError":
    case "LockfileParseError":
    case "LockfileDecodeError":
      return new StepFailure({
        category: "validation",
        detail: `Failed to read the workspace lockfile. Fix the file's permissions or restore it from version control, then rerun.`,
        cause: error,
      });
    case "WorkspaceRootEscape":
      return new StepFailure({
        category: "internal",
        detail: `Failed to read workspace workspace`,
        cause: error,
      });
  }
};

/**
 * Translate a transaction-machinery failure, reproducing each step's detail.
 * A `StepFailure` passes through unchanged: producers inside the transition
 * already speak the serialized vocabulary.
 */
export const workspaceTransactionFailureToStepFailure = (
  failure: WorkspaceTransactionFailure | StepFailure,
): StepFailure => {
  if (failure instanceof StepFailure) return failure;
  switch (failure._tag) {
    case "WorkspaceSnapshotError": {
      const detail = (): string => {
        switch (failure.step) {
          case "inspect-target":
            return `Failed to inspect transaction target ${failure.target}`;
          case "create-store":
            return "Failed to create the rollback snapshot directory";
          case "copy":
            return `Failed to snapshot transaction target ${failure.target}`;
          case "inspect-ancestor":
            return `Failed to inspect transaction ancestor ${failure.target}`;
        }
      };
      return new StepFailure({ category: "internal", detail: detail(), cause: failure.cause });
    }
    case "WorkspaceDirectoryError":
      return new StepFailure({
        category: "internal",
        detail:
          failure.step === "inspect"
            ? `Failed to inspect workspace state directory ${failure.path}`
            : `Failed to create workspace state directory ${failure.path}`,
        cause: failure.cause,
      });
    case "TransitionLockError": {
      const detail = (): string => {
        switch (failure.step) {
          case "create-scratch":
            return `Failed to create workspace scratch directory ${failure.path}`;
          case "acquire":
            return `Failed to acquire the workspace transition lock at ${failure.path}`;
          case "record-holder":
            return `Failed to record the workspace transition holder at ${failure.path}`;
          case "inspect-timestamp":
            return `Failed to inspect the workspace transition lock timestamp at ${failure.path}`;
          case "missing-timestamp":
            return `Workspace transition lock at ${failure.path} has no modification time`;
          case "preserve-timestamp":
            return `Failed to preserve the workspace transition lock timestamp at ${failure.path}`;
          case "release":
            return `Failed to release workspace transition lock at ${failure.path}`;
        }
      };
      return new StepFailure({ category: "internal", detail: detail(), cause: failure.cause });
    }
    case "TransitionLockUnavailable":
      return new StepFailure({
        category: "conflict",
        detail: `another operation holds the workspace transition${
          failure.holder === undefined
            ? ""
            : ` (${failure.holder.command} (pid ${failure.holder.pid}))`
        }; waited ${Math.round(failure.waitedMillis / 1000)}s`,
      });
    case "WorkspaceTransitionCompromised":
      return new StepFailure({
        category: "conflict",
        detail: `The workspace transition at ${failure.lockPath} was compromised; the operation stopped.`,
        cause: failure.cause,
      });
  }
};

/** Translate an execution-material fingerprint failure. */
export const candidateFingerprintFailedToStepFailure = (
  error: CandidateFingerprintFailed,
): StepFailure =>
  new StepFailure({
    category: "internal",
    detail: `Failed to fingerprint execution material at ${error.target}`,
    cause: error.cause,
  });

/**
 * Translate a provider failure: the implementation chose the category and
 * wording at construction, so the fields carry over 1:1.
 */
export const configuredAgentOutcomesUnavailableToStepFailure = (
  error: ConfiguredAgentOutcomesUnavailable,
): StepFailure =>
  new StepFailure({
    category: error.category,
    detail: error.detail,
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Render the first deciding line of a transition cause for the boundary text. */
const firstCauseLine = (cause: Cause.Cause<unknown>): string => {
  const failure = Option.getOrUndefined(Cause.findErrorOption(cause));
  if (failure instanceof StepFailure) return failure.detail;
  if (failure instanceof StaleExecutionCandidate) return STALE_CANDIDATE_DETAIL;
  return Cause.pretty(cause).split(/\r?\n/, 1)[0]?.trim() || "The transition did not complete";
};

const sentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

/** Render the deciding transition cause before restoration consequences. */
const transitionFailureText = (error: WorkspaceRestorationIncomplete): string =>
  error.terminationCause === "interruption"
    ? "Transition was interrupted."
    : `Transition failed: ${sentence(firstCauseLine(error.transitionCause))}`;

/**
 * Render the typed restoration failure: the deciding transition cause, the
 * retained-state consequence, and the preserved snapshot directory when one
 * exists.
 */
export const restorationIncompleteToStepFailure = (
  error: WorkspaceRestorationIncomplete,
): StepFailure =>
  new StepFailure({
    category: "conflict",
    detail: `${transitionFailureText(error)} Workspace restoration did not complete; the affected paths keep the state the failure left${
      error.snapshotDir === undefined
        ? "."
        : `, and their pre-change snapshots are preserved at ${error.snapshotDir}.`
    }`,
    suggestions: [
      {
        description:
          "Re-run the command; the next mutation plans from the current workspace state.",
      },
    ],
    cause: {
      transition: Cause.pretty(error.transitionCause),
      restoration: error.restorationCause,
    },
  });
