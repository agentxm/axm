/**
 * Conversions from model- and protocol-level typed failures into CLI-facing
 * `AppError` values. These live with the application error vocabulary so the
 * shared packages stay free of CLI error concerns.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { FqnInvalidError } from "@agentxm/extension-model/unstable/extensions/fqn";
import { FrontmatterParseFailure } from "@agentxm/registry-protocol/unstable/content/frontmatter";
import { FRONTMATTER_PARSE_FALLBACK_REASON } from "@agentxm/registry-protocol/unstable/content/frontmatter";
import { SubagentContentError } from "@agentxm/registry-protocol/unstable/content/subagent-content";
import type { AppErrorCode } from "./app-error.js";
import {
  WorkspaceRestorationIncomplete,
  restorationIncompleteToAppError,
} from "../workspace/transaction.js";
import {
  OPERATION_ERROR_CATEGORIES,
  STALE_CANDIDATE_DETAIL,
  StaleExecutionCandidate,
  StepFailure,
} from "../plan/errors.js";
import { SettingsWriteError } from "../settings/errors.js";
import { LockfileValidationError, LockfileWriteError } from "../lockfile/errors.js";
import {
  CanonicalPathRemovalError,
  DesiredPackGraphIncomplete,
  InvalidAgentId,
  LockedSkillMissing,
  SettingsEntryMissing,
  SymlinkCreationError,
  WorkspaceLayoutError,
  WorkspaceNotInitialized,
} from "../workspace/errors.js";
import {
  LockfileDecodeError,
  LockfileIoError,
  LockfileParseError,
  SettingsDecodeError,
  SettingsIoError,
  SettingsParseError,
  WorkspaceRootEscape,
  type LockfileReadError,
  type SettingsReadError,
} from "../workspace/read-model/errors.js";
import { AppError, makeAppError } from "./index.js";

// The kernel's serialized category vocabulary and the CLI's AppErrorCode must
// stay the same strings; divergence is a compile error here, at the boundary
// that owns the mapping.
OPERATION_ERROR_CATEGORIES satisfies ReadonlyArray<AppErrorCode>;

/**
 * Translate a `FqnInvalidError` into a CLI-facing `AppError` with the canonical
 * format suggestion. Use at user-input boundaries (CLI handlers, publish
 * operations) where the parse failure is a user error.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const fqnInvalidErrorToAppError = (error: FqnInvalidError): AppError =>
  makeAppError({
    code: "validation",
    detail: `Invalid fully qualified name: ${error.input}`,
    suggestions: [
      {
        description:
          "Use the 3-segment format: @handle/(skills|mcps|subagents|rules|hooks|knowledge|packs)/name",
      },
    ],
    cause: error,
  });

/** Preserve the former CLI-facing validation error at higher-level boundaries. */
export const frontmatterParseFailureToAppError = (cause: FrontmatterParseFailure): AppError =>
  makeAppError({
    code: "validation",
    detail: FRONTMATTER_PARSE_FALLBACK_REASON,
    suggestions: [
      {
        description: "Ensure the frontmatter block contains valid YAML between --- delimiters.",
      },
    ],
    cause,
  });

/** Translate a subagent content failure into a CLI-facing `AppError`. */
export const subagentContentErrorToAppError = (error: SubagentContentError): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    suggestions: error.suggestion === undefined ? [] : [{ description: error.suggestion }],
    cause: error,
  });

/**
 * Translate a plan step failure into the CLI-facing `AppError` envelope: the
 * category is the code, and detail, suggestions, and cause carry over 1:1.
 */
export const stepFailureToAppError = (error: StepFailure): AppError =>
  makeAppError({
    code: error.category,
    detail: error.detail,
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate a stale execution candidate, byte-identical to the former sniffed shape. */
export const staleExecutionCandidateToAppError = (_error: StaleExecutionCandidate): AppError =>
  makeAppError({
    code: "conflict",
    detail: STALE_CANDIDATE_DETAIL,
  });

/**
 * Interim bridge for producers whose dependencies still fail with `AppError`:
 * the step failure keeps the category (code), detail, suggestions, and cause
 * so plan data and machine output stay byte-identical. Call sites dissolve as
 * later decoupling waves give those dependencies typed failures.
 */
export const appErrorToStepFailure = (error: AppError): StepFailure =>
  new StepFailure({
    category: error.code,
    detail: error.detail,
    ...(error.suggestions === undefined ? {} : { suggestions: error.suggestions }),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/**
 * Interim bridge composing `toAppError` with `appErrorToStepFailure`, for
 * plan-step producers whose dependencies now fail with typed workspace
 * errors while step plumbing still speaks `StepFailure` categories from the
 * AppError rendering. Dissolves with the `appErrorToStepFailure` sites.
 */
export const failureToStepFailure = (error: KnownFailure | AppError): StepFailure =>
  appErrorToStepFailure(toAppError(error));

const causeMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/**
 * Translate scoped settings-read failures into the facade's former rendering:
 * a hand-editable settings problem is a validation failure that names the fix.
 */
export const settingsReadErrorToAppError = (error: SettingsReadError): AppError => {
  switch (error._tag) {
    case "SettingsDecodeError":
      return makeAppError({
        code: "validation",
        detail: `Invalid workspace settings at ${error.path}: ${error.issues.join("; ")}`,
        cause: error,
        suggestions: [
          { description: "Edit the settings file to fix the invalid value, then re-run." },
        ],
      });
    case "SettingsParseError":
      return makeAppError({
        code: "validation",
        detail: `Workspace settings at ${error.path} are not valid JSON`,
        cause: error,
        suggestions: [{ description: "Fix the JSON syntax in the settings file, then re-run." }],
      });
    case "SettingsIoError":
      return makeAppError({
        code: "validation",
        detail: `Workspace settings at ${error.path} could not be read`,
        cause: error,
        suggestions: [
          {
            description: "Repair the settings file permissions or restore the file, then re-run.",
          },
        ],
      });
  }
};

/** An unreadable or corrupt lockfile is actionable workspace state. */
export const lockfileReadErrorToAppError = (error: LockfileReadError): AppError =>
  makeAppError({
    code: "validation",
    detail: `Failed to read the workspace lockfile. Fix the file's permissions or restore it from version control, then rerun.`,
    cause: error,
  });

/** The workspace root escaped the allowed root while building the read model. */
export const workspaceRootEscapeToAppError = (error: WorkspaceRootEscape): AppError =>
  makeAppError({
    code: "internal",
    detail: `Failed to read workspace workspace`,
    cause: error,
  });

/** Translate a settings write failure, reproducing each step's detail. */
export const settingsWriteErrorToAppError = (error: SettingsWriteError): AppError => {
  const detail = (): string => {
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
  return makeAppError({ code: "internal", detail: detail(), cause: error.cause });
};

/** Translate a lockfile write failure, reproducing each step's code and detail. */
export const lockfileWriteErrorToAppError = (error: LockfileWriteError): AppError => {
  switch (error.step) {
    case "mkdir":
      return makeAppError({
        code: "internal",
        detail: `Failed to create directory ${error.path}`,
        cause: error.cause,
      });
    case "encode":
      return makeAppError({
        code: "internal",
        detail: "Failed to encode lockfile",
        cause: error.cause,
      });
    case "serialize":
      return makeAppError({
        code: "internal",
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
      return makeAppError({
        code: "validation",
        detail: `${detail()}. Fix the path's permissions or remove whatever occupies it, then rerun.`,
        cause: error.cause,
      });
    }
  }
};

/** Translate an on-disk lockfile validation failure, reproducing each step's detail. */
export const lockfileValidationErrorToAppError = (error: LockfileValidationError): AppError => {
  const detail = (): string => {
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
  return makeAppError({ code: "validation", detail: detail(), cause: error.cause });
};

/** Translate a workspace layout failure; the kernel owns the fact sentence. */
export const workspaceLayoutErrorToAppError = (error: WorkspaceLayoutError): AppError =>
  makeAppError({
    code: "validation",
    detail: error.detail,
    ...(error.cause === undefined ? {} : { cause: error.cause }),
  });

/** Translate a missing-workspace failure with the canonical setup suggestion. */
export const workspaceNotInitializedToAppError = (error: WorkspaceNotInitialized): AppError =>
  makeAppError({
    code: "internal",
    detail: `Workspace settings not found: ${error.settingsPath}`,
    suggestions: [{ description: "Create the workspace.", cmd: "axm setup" }],
  });

/** Translate a missing locked skill with the canonical install suggestion. */
export const lockedSkillMissingToAppError = (error: LockedSkillMissing): AppError =>
  makeAppError({
    code: "conflict",
    detail: `Skill "${error.name}" not found in lockfile`,
    suggestions: [
      {
        description: "Install the skill first.",
        cmd: "axm skills install <source>",
      },
    ],
  });

/** Translate a missing settings entry for an entry-level update. */
export const settingsEntryMissingToAppError = (error: SettingsEntryMissing): AppError =>
  makeAppError({
    code: "not_found",
    detail:
      error.entryType === "skill"
        ? `Skill "${error.name}" not found in settings`
        : `MCP server "${error.name}" not found in settings`,
  });

/** Translate an invalid configurable-agent ID. */
export const invalidAgentIdToAppError = (error: InvalidAgentId): AppError =>
  makeAppError({
    code: "validation",
    detail: `Invalid agent ID: ${error.agentId}`,
    cause: error.cause,
  });

/** Translate an undecidable pack-retention query. */
export const desiredPackGraphIncompleteToAppError = (
  _error: DesiredPackGraphIncomplete,
): AppError =>
  makeAppError({
    code: "conflict",
    detail: "Cannot decide pack retention because the desired pack graph is incomplete.",
    recover: "Restore or reinstall configured pack manifests, then retry.",
  });

/** Translate a canonical-path removal failure, reproducing each step's detail. */
export const canonicalPathRemovalErrorToAppError = (error: CanonicalPathRemovalError): AppError =>
  makeAppError({
    code: "internal",
    detail:
      error.step === "inspect"
        ? `Failed to inspect canonical extension path ${error.path}`
        : `Failed to remove canonical extension path ${error.path}`,
    cause: error.cause,
  });

/** Translate a symlink creation failure, reproducing each step's detail. */
export const symlinkCreationErrorToAppError = (error: SymlinkCreationError): AppError => {
  const detail = (): string => {
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
  return makeAppError({ code: "internal", detail: detail(), cause: error.cause });
};

/**
 * Every typed failure the application boundary knows how to convert. Each
 * package's error union registers here as it stops constructing `AppError`
 * directly; the dispatcher is the single conversion seam the CLI uses.
 */
export type KnownFailure =
  | FqnInvalidError
  | FrontmatterParseFailure
  | SubagentContentError
  | WorkspaceRestorationIncomplete
  | StepFailure
  | StaleExecutionCandidate
  | SettingsIoError
  | SettingsParseError
  | SettingsDecodeError
  | LockfileIoError
  | LockfileParseError
  | LockfileDecodeError
  | WorkspaceRootEscape
  | SettingsWriteError
  | LockfileWriteError
  | LockfileValidationError
  | WorkspaceLayoutError
  | WorkspaceNotInitialized
  | LockedSkillMissing
  | SettingsEntryMissing
  | InvalidAgentId
  | DesiredPackGraphIncomplete
  | CanonicalPathRemovalError
  | SymlinkCreationError;

export const isKnownFailure = (error: unknown): error is KnownFailure =>
  error instanceof FqnInvalidError ||
  error instanceof FrontmatterParseFailure ||
  error instanceof SubagentContentError ||
  error instanceof WorkspaceRestorationIncomplete ||
  error instanceof StepFailure ||
  error instanceof StaleExecutionCandidate ||
  error instanceof SettingsIoError ||
  error instanceof SettingsParseError ||
  error instanceof SettingsDecodeError ||
  error instanceof LockfileIoError ||
  error instanceof LockfileParseError ||
  error instanceof LockfileDecodeError ||
  error instanceof WorkspaceRootEscape ||
  error instanceof SettingsWriteError ||
  error instanceof LockfileWriteError ||
  error instanceof LockfileValidationError ||
  error instanceof WorkspaceLayoutError ||
  error instanceof WorkspaceNotInitialized ||
  error instanceof LockedSkillMissing ||
  error instanceof SettingsEntryMissing ||
  error instanceof InvalidAgentId ||
  error instanceof DesiredPackGraphIncomplete ||
  error instanceof CanonicalPathRemovalError ||
  error instanceof SymlinkCreationError;

/**
 * Convert a known typed failure into the CLI-facing `AppError` envelope. An
 * `AppError` passes through unchanged so still-coupled callers can map a
 * mixed channel with one `Effect.mapError(toAppError)` during the decoupling
 * waves.
 */
export const toAppError = (error: KnownFailure | AppError): AppError => {
  switch (error._tag) {
    case "AppError":
      return error;
    case "FqnInvalidError":
      return fqnInvalidErrorToAppError(error);
    case "FrontmatterParseFailure":
      return frontmatterParseFailureToAppError(error);
    case "SubagentContentError":
      return subagentContentErrorToAppError(error);
    case "WorkspaceRestorationIncomplete":
      return restorationIncompleteToAppError(error);
    case "StepFailure":
      return stepFailureToAppError(error);
    case "StaleExecutionCandidate":
      return staleExecutionCandidateToAppError(error);
    case "SettingsIoError":
    case "SettingsParseError":
    case "SettingsDecodeError":
      return settingsReadErrorToAppError(error);
    case "LockfileIoError":
    case "LockfileParseError":
    case "LockfileDecodeError":
      return lockfileReadErrorToAppError(error);
    case "WorkspaceRootEscape":
      return workspaceRootEscapeToAppError(error);
    case "SettingsWriteError":
      return settingsWriteErrorToAppError(error);
    case "LockfileWriteError":
      return lockfileWriteErrorToAppError(error);
    case "LockfileValidationError":
      return lockfileValidationErrorToAppError(error);
    case "WorkspaceLayoutError":
      return workspaceLayoutErrorToAppError(error);
    case "WorkspaceNotInitialized":
      return workspaceNotInitializedToAppError(error);
    case "LockedSkillMissing":
      return lockedSkillMissingToAppError(error);
    case "SettingsEntryMissing":
      return settingsEntryMissingToAppError(error);
    case "InvalidAgentId":
      return invalidAgentIdToAppError(error);
    case "DesiredPackGraphIncomplete":
      return desiredPackGraphIncompleteToAppError(error);
    case "CanonicalPathRemovalError":
      return canonicalPathRemovalErrorToAppError(error);
    case "SymlinkCreationError":
      return symlinkCreationErrorToAppError(error);
  }
};
