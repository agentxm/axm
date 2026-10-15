/** Per-source tagged error families for WorkspaceReadModel source-backed cells. */

import * as Data from "effect/Data";
import { LEGACY_LOCK_FILENAME } from "../workspace/constants.js";

/** Settings file IO failure (unreadable, permission denied, lower-level error). */
export class SettingsIoError extends Data.TaggedError("SettingsIoError")<{
  readonly path: string;
  readonly cause: unknown;
}> {}

/** Settings JSON parse failure; `raw` carries the unparsed text. */
export class SettingsParseError extends Data.TaggedError("SettingsParseError")<{
  readonly path: string;
  readonly raw: string;
  readonly cause: unknown;
}> {}

/** Settings schema decode failure; `raw` carries the parsed value. */
export class SettingsDecodeError extends Data.TaggedError("SettingsDecodeError")<{
  readonly path: string;
  readonly issues: ReadonlyArray<string>;
  readonly raw: unknown;
}> {}

/** Settings-read failure union (IO, parse, decode). */
export type SettingsReadError = SettingsIoError | SettingsParseError | SettingsDecodeError;

/** Lockfile IO failure. */
export class LockfileIoError extends Data.TaggedError("LockfileIoError")<{
  readonly path: string;
  readonly cause: unknown;
}> {}

/** Lockfile TOML parse failure; `raw` carries the unparsed text. */
export class LockfileParseError extends Data.TaggedError("LockfileParseError")<{
  readonly path: string;
  readonly raw: string;
  readonly cause: unknown;
}> {}

/** Lockfile schema decode failure; `raw` carries the parsed value. */
export class LockfileDecodeError extends Data.TaggedError("LockfileDecodeError")<{
  readonly path: string;
  readonly issues: ReadonlyArray<string>;
  readonly raw: unknown;
}> {}

/** A syntactically valid lockfile declares a version this CLI cannot read. */
export class LockfileVersionUnsupported extends Data.TaggedError("LockfileVersionUnsupported")<{
  readonly path: string;
  readonly observedVersion: number;
  readonly supportedVersion: number;
}> {}

/**
 * Whether a refused lockfile requires a newer AXM. A legacy YAML lockfile
 * declares a larger number in a superseded format; it is older, and takes the
 * re-acceptance route.
 */
export const lockfileRequiresNewerAxm = (error: LockfileVersionUnsupported): boolean => {
  const separator = Math.max(error.path.lastIndexOf("/"), error.path.lastIndexOf("\\"));
  return (
    error.observedVersion > error.supportedVersion &&
    error.path.slice(separator + 1) !== LEGACY_LOCK_FILENAME
  );
};

/** Lockfile-read failure union (IO, parse, decode, unsupported version). */
export type LockfileReadError =
  LockfileIoError | LockfileParseError | LockfileDecodeError | LockfileVersionUnsupported;

/** Provider-construction error: workspace root escapes the configured allowed root. */
export class WorkspaceRootEscape extends Data.TaggedError("WorkspaceRootEscape")<{
  readonly workspaceRoot: string;
  readonly allowedRoot: string;
}> {}

/** The skill discovery search root is missing, inaccessible, or not a directory. */
export class SkillDiscoveryRootInvalid extends Data.TaggedError("SkillDiscoveryRootInvalid")<{
  readonly searchRoot: string;
  readonly problem: "inaccessible" | "not-directory";
  readonly cause?: unknown;
}> {}

/** Scanning an agent's subagent files failed. */
export class SubagentScanFailed extends Data.TaggedError("SubagentScanFailed")<{
  readonly agentName: string;
  readonly cause: unknown;
}> {}
