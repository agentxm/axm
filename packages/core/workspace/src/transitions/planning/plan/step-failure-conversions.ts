/**
 * The rendering of the workspace kernel's own failure families — plan
 * execution, transaction settlement, workspace state, and configuration —
 * into the one rendered failure a plan step settles with and the application
 * boundary projects.
 *
 * Each family renders here once. Category, title, problem, detail, and
 * recovery are the serialized contract of machine output and human output
 * alike, so a failure reads the same whether it surfaced directly at a
 * command boundary or inside a plan.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Cause from "effect/Cause";
import type { ConfigError } from "effect/Config";
import * as Option from "effect/Option";
import type {
  AcceptedResolutionMissing,
  CanonicalPathRemovalError,
  ConfiguredAgentOutcomesUnavailable,
  DesiredPackGraphIncomplete,
  InlineExtensionSourceMissing,
  InvalidAgentId,
  LockEntryEndpointConflict,
  LockEntryNameInvalid,
  LockedSkillMissing,
  LockfileResolvedVersionInvalid,
  LockfileValidationError,
  LockfileWriteError,
  MaterializedTreeInvalid,
  PackageContentHashFailed,
  PathTraversalDetected,
  SettingsEntryMissing,
  SettingsWriteError,
  SkillDiscoveryRootInvalid,
  SubagentScanFailed,
  SupersededCanonicalRemovalFailed,
  SymlinkCreationError,
  WorkspaceLayoutError,
  WorkspaceNotInitialized,
  WorkspaceSourceInvalid,
  WorkspaceStateReadFailure,
} from "../../../desired-state/index.js";
import {
  TransitionLockError,
  TransitionLockUnavailable,
  WorkspaceDirectoryError,
  WorkspaceSnapshotError,
  WorkspaceTransitionCompromised,
  type WorkspaceRestorationError,
  type WorkspaceRestorationIncomplete,
  type WorkspaceTransactionFailure,
} from "../../settlement/errors.js";
import type {
  LifecyclePostconditionViolated,
  ScaffoldedExtensionUnresolved,
} from "../materialization-errors.js";
import {
  CandidateFingerprintFailed,
  STALE_CANDIDATE_DETAIL,
  StaleExecutionCandidate,
  StepFailure,
  makeStepFailure,
  type ApprovalRecoveryMissing,
  type PlanInteractionFailed,
} from "./errors.js";

/** AXM's own configuration could not be loaded or did not validate. */
export const configErrorToStepFailure = (error: ConfigError): StepFailure =>
  makeStepFailure({
    category: error.cause._tag === "SourceError" ? "unavailable" : "validation",
    detail: "AXM configuration could not be loaded.",
    cause: error,
  });

/**
 * Translate a scoped settings- or lockfile-read failure, naming the fix. An
 * unreadable file is unavailable storage; a readable file whose content is
 * wrong is a validation failure.
 */
export const workspaceStateReadFailureToStepFailure = (
  error: WorkspaceStateReadFailure,
): StepFailure => {
  switch (error._tag) {
    case "SettingsDecodeError":
      return makeStepFailure({
        category: "validation",
        detail: `Invalid workspace settings at ${error.path}: ${error.issues.join("; ")}`,
        suggestions: [
          { description: "Edit the settings file to fix the invalid value, then re-run." },
        ],
        cause: error,
      });
    case "SettingsParseError":
      return makeStepFailure({
        category: "validation",
        detail: `Workspace settings at ${error.path} are not valid JSON`,
        suggestions: [{ description: "Fix the JSON syntax in the settings file, then re-run." }],
        cause: error,
      });
    case "SettingsIoError":
      return makeStepFailure({
        category: "unavailable",
        detail: `Workspace settings at ${error.path} could not be read`,
        suggestions: [
          {
            description: "Repair the settings file permissions or restore the file, then re-run.",
          },
        ],
        cause: error,
      });
    case "LockfileIoError":
      return makeStepFailure({
        category: "unavailable",
        detail: `Workspace lockfile at ${error.path} could not be read`,
        suggestions: [
          {
            description:
              "Repair the lockfile permissions or restore a known-good copy, then re-run.",
          },
        ],
        cause: error,
      });
    case "LockfileParseError":
      return makeStepFailure({
        category: "validation",
        detail: `Workspace lockfile at ${error.path} is not valid YAML`,
        suggestions: [
          {
            description: "Fix the YAML syntax or restore a known-good lockfile, then re-run.",
          },
        ],
        cause: error,
      });
    case "LockfileDecodeError":
      return makeStepFailure({
        category: "validation",
        detail: `Invalid workspace lockfile at ${error.path}: ${error.issues.join("; ")}`,
        suggestions: [
          {
            description:
              "Correct the invalid values or restore a lockfile written in the supported format, then re-run.",
          },
        ],
        cause: error,
      });
    case "LockfileVersionUnsupported": {
      const direction: "older" | "newer" =
        error.observedVersion < error.supportedVersion ? "older" : "newer";
      return makeStepFailure({
        category: "validation",
        title: "Unsupported workspace lockfile version",
        detail:
          direction === "older"
            ? `Workspace lockfile at ${error.path} uses version ${error.observedVersion}, but this AXM uses version ${error.supportedVersion}. Back up and regenerate the lockfile before continuing.`
            : `Workspace lockfile at ${error.path} declares version ${error.observedVersion}, but this AXM supports version ${error.supportedVersion}. This workspace requires a newer AXM.`,
        problem: {
          code: "workspace-lockfile-version-unsupported",
          path: error.path,
          observedVersion: error.observedVersion,
          supportedVersion: error.supportedVersion,
          direction,
        },
        suggestions:
          direction === "older"
            ? [
                {
                  description:
                    "Back up the incompatible lockfile outside the workspace, review axm.json, then remove the incompatible file.",
                },
                {
                  description: "Preview a new lockfile in the supported format.",
                  cmd: "axm sync --preview",
                  commandScope: "workspace",
                },
                {
                  description: "Apply the previewed workspace changes.",
                  cmd: "axm sync",
                  commandScope: "workspace",
                },
                {
                  description:
                    "A workspace containing only workspace-authored content may correctly finish without a lockfile.",
                },
              ]
            : [
                {
                  description: "Upgrade AXM before accessing this workspace.",
                  cmd: "axm upgrade",
                  commandScope: "global",
                },
              ],
        cause: error,
      });
    }
    case "WorkspaceRootEscape":
      return makeStepFailure({
        category: "internal",
        detail: "Failed to read the workspace because its root escaped the allowed directory",
        cause: error,
      });
  }
};

const causeMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** Every workspace-state failure beside the scoped reads, rendered below. */
export type WorkspaceStateFailure =
  | SettingsWriteError
  | LockfileWriteError
  | LockfileValidationError
  | LockfileResolvedVersionInvalid
  | WorkspaceLayoutError
  | WorkspaceNotInitialized
  | LockedSkillMissing
  | SettingsEntryMissing
  | InvalidAgentId
  | DesiredPackGraphIncomplete
  | CanonicalPathRemovalError
  | SymlinkCreationError
  | LockEntryNameInvalid
  | LockEntryEndpointConflict
  | AcceptedResolutionMissing
  | InlineExtensionSourceMissing
  | SupersededCanonicalRemovalFailed
  | PackageContentHashFailed
  | WorkspaceSourceInvalid
  | SkillDiscoveryRootInvalid
  | SubagentScanFailed
  | MaterializedTreeInvalid
  | PathTraversalDetected
  | ConfiguredAgentOutcomesUnavailable;

const settingsWriteDetail = (error: SettingsWriteError): string => {
  switch (error.step) {
    case "mkdir":
      return `Failed to create directory: ${error.path}`;
    case "encode":
      return `Failed to encode settings: ${causeMessage(error.cause)}`;
    case "write-temp":
      return `Failed to write settings temp file: ${error.path}`;
    case "rename":
      return `Failed to atomically replace settings file: ${error.path}`;
  }
};

const lockfileWriteFailure = (error: LockfileWriteError): StepFailure => {
  switch (error.step) {
    case "mkdir":
      return makeStepFailure({
        category: "internal",
        detail: `Failed to create directory ${error.path}`,
        cause: error.cause,
      });
    case "encode":
      return makeStepFailure({
        category: "internal",
        detail: "Failed to encode lockfile",
        cause: error.cause,
      });
    case "serialize":
      return makeStepFailure({
        category: "internal",
        detail: "Failed to serialize lockfile to YAML",
        cause: error.cause,
      });
    case "check-target":
    case "read-target":
    case "write-temp":
    case "rename": {
      const detail = (): string => {
        switch (error.step) {
          case "check-target":
            return `Failed to check lockfile at ${error.path}`;
          case "read-target":
            return `Failed to read lockfile at ${error.path}`;
          case "write-temp":
            return `Failed to write lockfile temp file at ${error.path}`;
          default:
            return `Failed to atomically replace lockfile at ${error.path}`;
        }
      };
      return makeStepFailure({
        category: "validation",
        detail: `${detail()}. Fix the path's permissions or remove whatever occupies it, then rerun.`,
        cause: error.cause,
      });
    }
  }
};

const lockfileValidationDetail = (error: LockfileValidationError): string => {
  switch (error.step) {
    case "probe":
      return `Failed to check if lockfile exists at ${error.path}`;
    case "check":
      return `Failed to check the lockfile at ${error.path}. Fix the file's permissions or restore it from version control, then rerun.`;
    case "read":
      return `Failed to read the lockfile at ${error.path}. Fix the file's permissions or restore it from version control, then rerun.`;
    case "parse":
      return `Failed to parse lockfile at ${error.path}`;
    case "decode":
      return `Failed to decode lockfile at ${error.path}`;
  }
};

const symlinkCreationDetail = (error: SymlinkCreationError): string => {
  switch (error.step) {
    case "resolve-target":
      return `Failed to resolve target path`;
    case "remove-existing":
      return `Failed to remove existing path at ${error.path}`;
    case "mkdir-parent":
      return `Failed to create parent directory ${error.path}`;
    case "symlink":
      return `Failed to create symlink at ${error.path}`;
  }
};

/** Translate one workspace-state read-modify-write or record failure. */
export const workspaceStateFailureToStepFailure = (error: WorkspaceStateFailure): StepFailure => {
  switch (error._tag) {
    case "SettingsWriteError":
      return makeStepFailure({
        category: "internal",
        detail: settingsWriteDetail(error),
        cause: error.cause,
      });
    case "LockfileWriteError":
      return lockfileWriteFailure(error);
    case "LockfileValidationError":
      return makeStepFailure({
        category: "validation",
        detail: lockfileValidationDetail(error),
        cause: error.cause,
      });
    case "LockfileResolvedVersionInvalid":
      return makeStepFailure({
        category: "validation",
        detail: "Lockfile resolved versions must be exact semver values",
        suggestions: [
          {
            description:
              "Resolve the constraint first, then persist the exact resolved version (for example, 1.2.3 instead of ^1.2.3).",
          },
        ],
        cause: error.cause,
      });
    case "WorkspaceLayoutError":
      return makeStepFailure({ category: "validation", detail: error.detail, cause: error.cause });
    case "WorkspaceNotInitialized":
      return makeStepFailure({
        category: "internal",
        detail: `Workspace settings not found: ${error.settingsPath}`,
        suggestions: [{ description: "Create the workspace.", cmd: "axm setup" }],
      });
    case "LockedSkillMissing":
      return makeStepFailure({
        category: "conflict",
        detail: `Skill "${error.name}" has no entry in axm-lock.yaml`,
        suggestions: [
          { description: "Install the skill first.", cmd: "axm skills install <source>" },
        ],
      });
    case "SettingsEntryMissing":
      return makeStepFailure({
        category: "not_found",
        detail:
          error.entryType === "skill"
            ? `Skill "${error.name}" not found in settings`
            : `MCP server "${error.name}" not found in settings`,
      });
    case "InvalidAgentId":
      return makeStepFailure({
        category: "validation",
        detail: `Unknown agent ID: ${error.agentId}`,
        suggestions: [
          { description: "Inspect supported agent IDs.", cmd: "axm agents list --available" },
        ],
        cause: error.cause,
      });
    case "DesiredPackGraphIncomplete":
      return makeStepFailure({
        category: "conflict",
        detail:
          "AXM cannot decide whether to keep this pack because some pack manifests are missing or invalid.",
        recover: "Restore or reinstall configured pack manifests, then retry.",
      });
    case "CanonicalPathRemovalError":
      return makeStepFailure({
        category: "internal",
        detail:
          error.step === "inspect"
            ? `Failed to inspect the installed extension at ${error.path}`
            : `Failed to remove the installed extension at ${error.path}`,
        cause: error.cause,
      });
    case "SymlinkCreationError":
      return makeStepFailure({
        category: "internal",
        detail: symlinkCreationDetail(error),
        cause: error.cause,
      });
    case "LockEntryNameInvalid":
      return makeStepFailure({
        category: "validation",
        detail: `Lockfile extension name is invalid: ${error.name}`,
      });
    case "LockEntryEndpointConflict":
      return makeStepFailure({
        category: "conflict",
        detail: `axm-lock.yaml records ${error.acceptedEndpoint} for ${error.sourceKind} source "${error.sourceName}", but axm.json resolves it to ${error.resolvedEndpoint}`,
      });
    case "AcceptedResolutionMissing":
      return makeStepFailure({
        category: "validation",
        detail: `axm-lock.yaml has no ${error.label} entry for ${error.name}`,
      });
    case "InlineExtensionSourceMissing":
      return makeStepFailure({
        category: "validation",
        detail: `Inline MCP server "${error.name}" has no package source to resolve.`,
      });
    case "SupersededCanonicalRemovalFailed":
      return makeStepFailure({
        category: "internal",
        detail: `Failed to remove the previous installed package at ${error.path}`,
        cause: error.cause,
      });
    case "PackageContentHashFailed":
      return makeStepFailure({
        category: "internal",
        detail: `Failed to hash package content at ${error.packageDir}`,
        cause: error.cause,
      });
    case "WorkspaceSourceInvalid":
      return makeStepFailure({
        category: "validation",
        detail: `Invalid workspace source "${error.source}": ${error.detail}`,
        recover: "Restore a valid canonical workspace package or update the settings source.",
        cause: error.cause,
      });
    case "SkillDiscoveryRootInvalid":
      return makeStepFailure({
        category: "internal",
        detail:
          error.problem === "inaccessible"
            ? `Directory does not exist or is not accessible: ${error.searchRoot}`
            : `Path is not a directory: ${error.searchRoot}`,
        cause: error.cause,
      });
    case "SubagentScanFailed":
      return makeStepFailure({
        category: "internal",
        detail: `Failed to scan subagent files for ${error.agentName}`,
        cause: error.cause,
      });
    case "MaterializedTreeInvalid":
      return makeStepFailure({
        category: "validation",
        detail: `Installed package files are invalid at ${error.root}: ${error.reason}`,
        cause: error.cause,
      });
    case "PathTraversalDetected":
      return makeStepFailure({
        category: "internal",
        detail: `Path traversal detected: ${error.path}`,
      });
    case "ConfiguredAgentOutcomesUnavailable":
      return makeStepFailure({
        category: error.category,
        detail: error.detail,
        suggestions: error.suggestions,
        cause: error.cause,
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
      return makeStepFailure({ category: "internal", detail: detail(), cause: failure.cause });
    }
    case "WorkspaceDirectoryError":
      return makeStepFailure({
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
      return makeStepFailure({ category: "internal", detail: detail(), cause: failure.cause });
    }
    case "TransitionLockUnavailable":
      return makeStepFailure({
        category: "conflict",
        detail: `another operation holds the workspace transition${
          failure.holder === undefined
            ? ""
            : ` (${failure.holder.command} (pid ${failure.holder.pid}))`
        }; waited ${Math.round(failure.waitedMillis / 1000)}s`,
      });
    case "WorkspaceTransitionCompromised":
      return makeStepFailure({
        category: "conflict",
        detail: `The workspace transition at ${failure.lockPath} was compromised; the operation stopped.`,
        cause: failure.cause,
      });
  }
};

/** Translate a restoration-step failure, reproducing each step's detail. */
export const workspaceRestorationErrorToStepFailure = (
  error: WorkspaceRestorationError,
): StepFailure => {
  const detail = (): string => {
    switch (error.step) {
      case "stage":
        return `Staged restoration did not validate for ${error.target}`;
      case "stopped":
        return `Workspace restoration stopped before ${error.target}: the workspace transition was compromised`;
      case "verify":
        return `Workspace restoration did not verify for ${error.target}`;
    }
  };
  return makeStepFailure({ category: "internal", detail: detail(), cause: error.cause });
};

/** Translate an execution-material fingerprint failure. */
export const candidateFingerprintFailedToStepFailure = (
  error: CandidateFingerprintFailed,
): StepFailure =>
  makeStepFailure({
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
): StepFailure => workspaceStateFailureToStepFailure(error);

/** Every plan-execution failure the kernel constructs. */
export type PlanExecutionFailure =
  | StaleExecutionCandidate
  | CandidateFingerprintFailed
  | ApprovalRecoveryMissing
  | PlanInteractionFailed
  | LifecyclePostconditionViolated
  | ScaffoldedExtensionUnresolved;

const postconditionDetail = (failure: LifecyclePostconditionViolated): string => {
  switch (failure.postcondition) {
    case "install-observable":
      return `Installed ${failure.targetType} "${failure.targetName}" did not satisfy its observable contract`;
    case "install-declared":
      return `Installed ${failure.targetType} "${failure.targetName}" has no desired-state declaration`;
    case "new-observable":
      return `New ${failure.targetType} "${failure.targetName}" did not satisfy its observable contract`;
    case "new-declared":
      return `New ${failure.targetType} "${failure.targetName}" has no desired-state declaration`;
    case "materialize-observable":
      return `Reconciled ${failure.targetType} "${failure.targetName}" did not satisfy its observable contract`;
    case "uninstall-remains-declared":
      return `Uninstalled ${failure.targetType} "${failure.targetName}" remains declared`;
    case "uninstall-observed-state":
      return `Uninstalled ${failure.targetType} "${failure.targetName}" has an invalid observed postcondition`;
  }
};

/** Translate one plan-execution failure. */
export const planExecutionFailureToStepFailure = (failure: PlanExecutionFailure): StepFailure => {
  switch (failure._tag) {
    case "StaleExecutionCandidate":
      return makeStepFailure({ category: "conflict", detail: STALE_CANDIDATE_DETAIL });
    case "CandidateFingerprintFailed":
      return candidateFingerprintFailedToStepFailure(failure);
    case "ApprovalRecoveryMissing":
      return makeStepFailure({
        category: "internal",
        detail: "Apply execution is missing approval recovery metadata",
      });
    case "PlanInteractionFailed":
      return makeStepFailure({
        category: failure.category,
        detail: failure.detail,
        suggestions: failure.suggestions,
        cause: failure.cause,
      });
    case "LifecyclePostconditionViolated":
      return makeStepFailure({ category: "internal", detail: postconditionDetail(failure) });
    case "ScaffoldedExtensionUnresolved":
      return makeStepFailure({
        category: "not_found",
        detail: `Newly scaffolded ${failure.targetType} "${failure.targetName}" could not be resolved from its workspace source`,
      });
  }
};

const isWorkspaceTransactionFailure = (failure: unknown): failure is WorkspaceTransactionFailure =>
  failure instanceof WorkspaceSnapshotError ||
  failure instanceof WorkspaceDirectoryError ||
  failure instanceof TransitionLockError ||
  failure instanceof TransitionLockUnavailable ||
  failure instanceof WorkspaceTransitionCompromised;

/**
 * Render the first deciding line of a transition cause. A transition fails
 * with a rendered step failure, a stale candidate, or the transaction
 * machinery's own failure; anything else is summarized without its stack.
 */
const firstCauseLine = (cause: Cause.Cause<unknown>): string => {
  const failure = Option.getOrUndefined(Cause.findErrorOption(cause));
  if (failure instanceof StepFailure) return failure.detail;
  if (failure instanceof StaleExecutionCandidate) return STALE_CANDIDATE_DETAIL;
  if (failure instanceof CandidateFingerprintFailed) {
    return candidateFingerprintFailedToStepFailure(failure).detail;
  }
  if (isWorkspaceTransactionFailure(failure)) {
    return workspaceTransactionFailureToStepFailure(failure).detail;
  }
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
  makeStepFailure({
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
