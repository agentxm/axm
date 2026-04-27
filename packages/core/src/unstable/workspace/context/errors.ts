/** Per-source tagged error families for WorkspaceContext source-backed cells. */

import * as Data from "effect/Data";

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

/** Lockfile YAML parse failure; `raw` carries the unparsed text. */
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

/** Lockfile-read failure union (IO, parse, decode). */
export type LockfileReadError = LockfileIoError | LockfileParseError | LockfileDecodeError;

/** Provider-construction error: workspace root escapes the configured allowed root. */
export class WorkspaceRootEscape extends Data.TaggedError("WorkspaceRootEscape")<{
  readonly workspaceRoot: string;
  readonly allowedRoot: string;
}> {}
