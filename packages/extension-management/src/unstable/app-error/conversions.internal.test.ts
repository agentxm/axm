import { describe, expect, it } from "vitest";

import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { AppError, makeAppError, type AppErrorCode } from "./app-error.js";
import { isKnownFailure, toAppError, type KnownFailure } from "./conversions.js";
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
} from "../workspace/read-model/errors.js";
import {
  TransitionLockError,
  TransitionLockUnavailable,
  WorkspaceDirectoryError,
  WorkspaceRestorationError,
  WorkspaceSnapshotError,
  WorkspaceTransitionCompromised,
} from "../workspace/transaction.js";

const ioCause = new Error("EACCES");

interface ConversionCase {
  readonly name: string;
  readonly failure: KnownFailure;
  readonly code: AppErrorCode;
  readonly detail: string;
  readonly suggestions?: ReadonlyArray<SuggestedAction>;
  /** Expected `cause`; "self" pins the typed failure itself as the cause. */
  readonly cause?: unknown | "self";
}

const LOCKFILE_READ_DETAIL =
  "Failed to read the workspace lockfile. Fix the file's permissions or restore it from version control, then rerun.";

const lockfileWriteSuffix =
  ". Fix the path's permissions or remove whatever occupies it, then rerun.";
const lockfileCheckSuffix =
  ". Fix the file's permissions or restore it from version control, then rerun.";

// One row per distinct code/detail template; the byte-for-byte contract for
// the workspace-state families lives here, not in the producing modules.
const cases: ReadonlyArray<ConversionCase> = [
  {
    name: "SettingsIoError",
    failure: new SettingsIoError({ path: "/w/axm.json", cause: ioCause }),
    code: "validation",
    detail: "Workspace settings at /w/axm.json could not be read",
    suggestions: [
      { description: "Repair the settings file permissions or restore the file, then re-run." },
    ],
    cause: "self",
  },
  {
    name: "SettingsParseError",
    failure: new SettingsParseError({ path: "/w/axm.json", raw: "{", cause: ioCause }),
    code: "validation",
    detail: "Workspace settings at /w/axm.json are not valid JSON",
    suggestions: [{ description: "Fix the JSON syntax in the settings file, then re-run." }],
    cause: "self",
  },
  {
    name: "SettingsDecodeError",
    failure: new SettingsDecodeError({
      path: "/w/axm.json",
      issues: ["agents must be an array", "owner is invalid"],
      raw: {},
    }),
    code: "validation",
    detail: "Invalid workspace settings at /w/axm.json: agents must be an array; owner is invalid",
    suggestions: [{ description: "Edit the settings file to fix the invalid value, then re-run." }],
    cause: "self",
  },
  {
    name: "LockfileIoError",
    failure: new LockfileIoError({ path: "/w/axm-lock.yaml", cause: ioCause }),
    code: "validation",
    detail: LOCKFILE_READ_DETAIL,
    cause: "self",
  },
  {
    name: "LockfileParseError",
    failure: new LockfileParseError({ path: "/w/axm-lock.yaml", raw: ":", cause: ioCause }),
    code: "validation",
    detail: LOCKFILE_READ_DETAIL,
    cause: "self",
  },
  {
    name: "LockfileDecodeError",
    failure: new LockfileDecodeError({ path: "/w/axm-lock.yaml", issues: ["bad"], raw: {} }),
    code: "validation",
    detail: LOCKFILE_READ_DETAIL,
    cause: "self",
  },
  {
    name: "WorkspaceRootEscape",
    failure: new WorkspaceRootEscape({ workspaceRoot: "/outside", allowedRoot: "/w" }),
    code: "internal",
    detail: "Failed to read workspace workspace",
    cause: "self",
  },
  {
    name: "SettingsWriteError mkdir",
    failure: new SettingsWriteError({ path: "/w/.axm", step: "mkdir", cause: ioCause }),
    code: "internal",
    detail: "Failed to create directory: /w/.axm",
    cause: ioCause,
  },
  {
    name: "SettingsWriteError encode",
    failure: new SettingsWriteError({
      path: "/w/axm.json",
      step: "encode",
      cause: new Error("bad settings"),
    }),
    code: "internal",
    detail: "Failed to encode settings: bad settings",
    cause: new Error("bad settings"),
  },
  {
    name: "SettingsWriteError write-temp",
    failure: new SettingsWriteError({
      path: "/w/axm.json.tmp.1",
      step: "write-temp",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to write settings temp file: /w/axm.json.tmp.1",
    cause: ioCause,
  },
  {
    name: "SettingsWriteError rename",
    failure: new SettingsWriteError({ path: "/w/axm.json", step: "rename", cause: ioCause }),
    code: "internal",
    detail: "Failed to atomically replace settings file: /w/axm.json",
    cause: ioCause,
  },
  {
    name: "LockfileWriteError mkdir",
    failure: new LockfileWriteError({ path: "/w", step: "mkdir", cause: ioCause }),
    code: "internal",
    detail: "Failed to create directory /w",
    cause: ioCause,
  },
  {
    name: "LockfileWriteError encode",
    failure: new LockfileWriteError({ path: "/w/axm-lock.yaml", step: "encode", cause: ioCause }),
    code: "internal",
    detail: "Failed to encode lockfile",
    cause: ioCause,
  },
  {
    name: "LockfileWriteError serialize",
    failure: new LockfileWriteError({
      path: "/w/axm-lock.yaml",
      step: "serialize",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to serialize lockfile to YAML",
    cause: ioCause,
  },
  {
    name: "LockfileWriteError check-target",
    failure: new LockfileWriteError({
      path: "/w/axm-lock.yaml",
      step: "check-target",
      cause: ioCause,
    }),
    code: "validation",
    detail: `Failed to check lockfile at /w/axm-lock.yaml${lockfileWriteSuffix}`,
    cause: ioCause,
  },
  {
    name: "LockfileWriteError read-target",
    failure: new LockfileWriteError({
      path: "/w/axm-lock.yaml",
      step: "read-target",
      cause: ioCause,
    }),
    code: "validation",
    detail: `Failed to read lockfile at /w/axm-lock.yaml${lockfileWriteSuffix}`,
    cause: ioCause,
  },
  {
    name: "LockfileWriteError write-temp",
    failure: new LockfileWriteError({
      path: "/w/axm-lock.yaml.tmp.1",
      step: "write-temp",
      cause: ioCause,
    }),
    code: "validation",
    detail: `Failed to write lockfile temp file at /w/axm-lock.yaml.tmp.1${lockfileWriteSuffix}`,
    cause: ioCause,
  },
  {
    name: "LockfileWriteError rename",
    failure: new LockfileWriteError({ path: "/w/axm-lock.yaml", step: "rename", cause: ioCause }),
    code: "validation",
    detail: `Failed to atomically replace lockfile at /w/axm-lock.yaml${lockfileWriteSuffix}`,
    cause: ioCause,
  },
  {
    name: "LockfileValidationError probe",
    failure: new LockfileValidationError({
      path: "/w/axm-lock.yaml",
      step: "probe",
      cause: ioCause,
    }),
    code: "validation",
    detail: "Failed to check if lockfile exists at /w/axm-lock.yaml",
    cause: ioCause,
  },
  {
    name: "LockfileValidationError check",
    failure: new LockfileValidationError({
      path: "/w/axm-lock.yaml",
      step: "check",
      cause: ioCause,
    }),
    code: "validation",
    detail: `Failed to check the lockfile at /w/axm-lock.yaml${lockfileCheckSuffix}`,
    cause: ioCause,
  },
  {
    name: "LockfileValidationError read",
    failure: new LockfileValidationError({
      path: "/w/axm-lock.yaml",
      step: "read",
      cause: ioCause,
    }),
    code: "validation",
    detail: `Failed to read the lockfile at /w/axm-lock.yaml${lockfileCheckSuffix}`,
    cause: ioCause,
  },
  {
    name: "LockfileValidationError parse",
    failure: new LockfileValidationError({
      path: "/w/axm-lock.yaml",
      step: "parse",
      cause: ioCause,
    }),
    code: "validation",
    detail: "Failed to parse lockfile at /w/axm-lock.yaml",
    cause: ioCause,
  },
  {
    name: "LockfileValidationError decode",
    failure: new LockfileValidationError({
      path: "/w/axm-lock.yaml",
      step: "decode",
      cause: ioCause,
    }),
    code: "validation",
    detail: "Failed to decode lockfile at /w/axm-lock.yaml",
    cause: ioCause,
  },
  {
    name: "WorkspaceLayoutError with cause",
    failure: new WorkspaceLayoutError({
      detail: 'Invalid skill authored directory "../out": path escapes the workspace',
      cause: ioCause,
    }),
    code: "validation",
    detail: 'Invalid skill authored directory "../out": path escapes the workspace',
    cause: ioCause,
  },
  {
    name: "WorkspaceLayoutError without cause",
    failure: new WorkspaceLayoutError({
      detail: "Invalid rule authored root /w/rules: expected a directory",
    }),
    code: "validation",
    detail: "Invalid rule authored root /w/rules: expected a directory",
  },
  {
    name: "WorkspaceNotInitialized",
    failure: new WorkspaceNotInitialized({ settingsPath: "/w/axm.json" }),
    code: "internal",
    detail: "Workspace settings not found: /w/axm.json",
    suggestions: [{ description: "Create the workspace.", cmd: "axm setup" }],
  },
  {
    name: "LockedSkillMissing",
    failure: new LockedSkillMissing({ name: "review" }),
    code: "conflict",
    detail: 'Skill "review" not found in lockfile',
    suggestions: [{ description: "Install the skill first.", cmd: "axm skills install <source>" }],
  },
  {
    name: "SettingsEntryMissing skill",
    failure: new SettingsEntryMissing({ entryType: "skill", name: "review" }),
    code: "not_found",
    detail: 'Skill "review" not found in settings',
  },
  {
    name: "SettingsEntryMissing mcp-server",
    failure: new SettingsEntryMissing({ entryType: "mcp-server", name: "srv" }),
    code: "not_found",
    detail: 'MCP server "srv" not found in settings',
  },
  {
    name: "InvalidAgentId",
    failure: new InvalidAgentId({ agentId: "universal", cause: ioCause }),
    code: "validation",
    detail: "Invalid agent ID: universal",
    cause: ioCause,
  },
  {
    name: "DesiredPackGraphIncomplete",
    failure: new DesiredPackGraphIncomplete(),
    code: "conflict",
    detail: "Cannot decide pack retention because the desired pack graph is incomplete.",
    suggestions: [{ description: "Restore or reinstall configured pack manifests, then retry." }],
  },
  {
    name: "CanonicalPathRemovalError inspect",
    failure: new CanonicalPathRemovalError({ path: "/w/ext", step: "inspect", cause: ioCause }),
    code: "internal",
    detail: "Failed to inspect canonical extension path /w/ext",
    cause: ioCause,
  },
  {
    name: "CanonicalPathRemovalError remove",
    failure: new CanonicalPathRemovalError({ path: "/w/ext", step: "remove", cause: ioCause }),
    code: "internal",
    detail: "Failed to remove canonical extension path /w/ext",
    cause: ioCause,
  },
  {
    name: "SymlinkCreationError resolve-target",
    failure: new SymlinkCreationError({ path: "/w/src", step: "resolve-target", cause: ioCause }),
    code: "internal",
    detail: "Failed to resolve target path",
    cause: ioCause,
  },
  {
    name: "SymlinkCreationError remove-existing",
    failure: new SymlinkCreationError({ path: "/w/link", step: "remove-existing", cause: ioCause }),
    code: "internal",
    detail: "Failed to remove existing path at /w/link",
    cause: ioCause,
  },
  {
    name: "SymlinkCreationError mkdir-parent",
    failure: new SymlinkCreationError({ path: "/w/parent", step: "mkdir-parent", cause: ioCause }),
    code: "internal",
    detail: "Failed to create parent directory /w/parent",
    cause: ioCause,
  },
  {
    name: "SymlinkCreationError symlink",
    failure: new SymlinkCreationError({ path: "/w/link", step: "symlink", cause: ioCause }),
    code: "internal",
    detail: "Failed to create symlink at /w/link",
    cause: ioCause,
  },
  {
    name: "WorkspaceSnapshotError inspect-target",
    failure: new WorkspaceSnapshotError({
      target: "/w/axm.json",
      step: "inspect-target",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to inspect transaction target /w/axm.json",
    cause: ioCause,
  },
  {
    name: "WorkspaceSnapshotError create-store",
    failure: new WorkspaceSnapshotError({
      target: "/w/axm.json",
      step: "create-store",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to create the rollback snapshot directory",
    cause: ioCause,
  },
  {
    name: "WorkspaceSnapshotError copy",
    failure: new WorkspaceSnapshotError({ target: "/w/axm.json", step: "copy", cause: ioCause }),
    code: "internal",
    detail: "Failed to snapshot transaction target /w/axm.json",
    cause: ioCause,
  },
  {
    name: "WorkspaceSnapshotError inspect-ancestor",
    failure: new WorkspaceSnapshotError({
      target: "/w/agent_extensions",
      step: "inspect-ancestor",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to inspect transaction ancestor /w/agent_extensions",
    cause: ioCause,
  },
  {
    name: "WorkspaceDirectoryError inspect",
    failure: new WorkspaceDirectoryError({ path: "/w/.axm", step: "inspect", cause: ioCause }),
    code: "internal",
    detail: "Failed to inspect workspace state directory /w/.axm",
    cause: ioCause,
  },
  {
    name: "WorkspaceDirectoryError create",
    failure: new WorkspaceDirectoryError({ path: "/w/.axm", step: "create", cause: ioCause }),
    code: "internal",
    detail: "Failed to create workspace state directory /w/.axm",
    cause: ioCause,
  },
  {
    name: "TransitionLockError create-scratch",
    failure: new TransitionLockError({
      path: "/w/.axm/tmp",
      step: "create-scratch",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to create workspace scratch directory /w/.axm/tmp",
    cause: ioCause,
  },
  {
    name: "TransitionLockError acquire",
    failure: new TransitionLockError({
      path: "/w/.axm/tmp/workspace-transition.lock",
      step: "acquire",
      cause: ioCause,
    }),
    code: "internal",
    detail:
      "Failed to acquire the workspace transition lock at /w/.axm/tmp/workspace-transition.lock",
    cause: ioCause,
  },
  {
    name: "TransitionLockError record-holder",
    failure: new TransitionLockError({
      path: "/w/.axm/tmp/workspace-transition.lock",
      step: "record-holder",
      cause: ioCause,
    }),
    code: "internal",
    detail:
      "Failed to record the workspace transition holder at /w/.axm/tmp/workspace-transition.lock",
    cause: ioCause,
  },
  {
    name: "TransitionLockError inspect-timestamp",
    failure: new TransitionLockError({
      path: "/w/.axm/tmp/workspace-transition.lock",
      step: "inspect-timestamp",
      cause: ioCause,
    }),
    code: "internal",
    detail:
      "Failed to inspect the workspace transition lock timestamp at /w/.axm/tmp/workspace-transition.lock",
    cause: ioCause,
  },
  {
    name: "TransitionLockError missing-timestamp",
    failure: new TransitionLockError({
      path: "/w/.axm/tmp/workspace-transition.lock",
      step: "missing-timestamp",
    }),
    code: "internal",
    detail:
      "Workspace transition lock at /w/.axm/tmp/workspace-transition.lock has no modification time",
  },
  {
    name: "TransitionLockError preserve-timestamp",
    failure: new TransitionLockError({
      path: "/w/.axm/tmp/workspace-transition.lock",
      step: "preserve-timestamp",
      cause: ioCause,
    }),
    code: "internal",
    detail:
      "Failed to preserve the workspace transition lock timestamp at /w/.axm/tmp/workspace-transition.lock",
    cause: ioCause,
  },
  {
    name: "TransitionLockError release",
    failure: new TransitionLockError({
      path: "/w/.axm/tmp/workspace-transition.lock",
      step: "release",
      cause: ioCause,
    }),
    code: "internal",
    detail: "Failed to release workspace transition lock at /w/.axm/tmp/workspace-transition.lock",
    cause: ioCause,
  },
  {
    name: "TransitionLockUnavailable with holder",
    failure: new TransitionLockUnavailable({
      holder: { command: "install", pid: 123 },
      waitedMillis: 60_000,
    }),
    code: "conflict",
    detail: "another operation holds the workspace transition (install (pid 123)); waited 60s",
  },
  {
    name: "TransitionLockUnavailable without holder",
    failure: new TransitionLockUnavailable({ holder: undefined, waitedMillis: 1_499 }),
    code: "conflict",
    detail: "another operation holds the workspace transition; waited 1s",
  },
  {
    name: "WorkspaceTransitionCompromised",
    failure: new WorkspaceTransitionCompromised({
      workspaceDir: "/w/.axm",
      lockPath: "/w/.axm/tmp/workspace-transition.lock",
      cause: ioCause,
    }),
    code: "conflict",
    detail:
      "The workspace transition at /w/.axm/tmp/workspace-transition.lock was compromised; the operation stopped.",
    cause: ioCause,
  },
  {
    name: "WorkspaceRestorationError stage",
    failure: new WorkspaceRestorationError({
      target: "/w/axm.json",
      step: "stage",
      cause: { stagedHash: "a", backupHash: "b" },
    }),
    code: "internal",
    detail: "Staged restoration did not validate for /w/axm.json",
    cause: { stagedHash: "a", backupHash: "b" },
  },
  {
    name: "WorkspaceRestorationError stopped",
    failure: new WorkspaceRestorationError({
      target: "/w/axm.json",
      step: "stopped",
      cause: undefined,
    }),
    code: "internal",
    detail:
      "Workspace restoration stopped before /w/axm.json: the workspace transition was compromised",
  },
  {
    name: "WorkspaceRestorationError verify",
    failure: new WorkspaceRestorationError({
      target: "/w/axm.json",
      step: "verify",
      cause: { state: "copied" },
    }),
    code: "internal",
    detail: "Workspace restoration did not verify for /w/axm.json",
    cause: { state: "copied" },
  },
];

describe("workspace-state conversions", () => {
  it.each(cases.map((entry) => [entry.name, entry] as const))(
    "converts %s byte-identically",
    (_name, entry) => {
      const converted = toAppError(entry.failure);
      expect(converted).toBeInstanceOf(AppError);
      expect(converted.code).toBe(entry.code);
      expect(converted.detail).toBe(entry.detail);
      if (entry.suggestions === undefined) {
        expect(converted.suggestions).toBeUndefined();
      } else {
        expect(converted.suggestions).toEqual(entry.suggestions);
      }
      if (entry.cause === "self") {
        expect(converted.cause).toBe(entry.failure);
      } else {
        expect(converted.cause).toEqual(entry.cause);
      }
    },
  );

  it("registers every table row as a known failure", () => {
    for (const entry of cases) {
      expect(isKnownFailure(entry.failure)).toBe(true);
    }
  });

  it("passes an AppError through unchanged", () => {
    const original = makeAppError({ code: "conflict", detail: "already handled" });
    expect(toAppError(original)).toBe(original);
    expect(isKnownFailure(original)).toBe(false);
  });
});
