/**
 * Typed failure families for lockfile reads, writes, and on-disk validation.
 * Fields are domain facts; the application error boundary owns rendering,
 * codes, and suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";
import { LEGACY_LOCK_FILENAME } from "../../workspace/constants.js";

/**
 * Lockfile write failure at one step of the encode/serialize/atomic-write
 * pipeline. `path` carries the fact each step's message interpolates: the
 * parent directory for `mkdir`, the temp file for `write-temp`, and the
 * lockfile path otherwise.
 */
export class LockfileWriteError extends Data.TaggedError("LockfileWriteError")<{
  readonly path: string;
  readonly step:
    "mkdir" | "encode" | "serialize" | "check-target" | "read-target" | "write-temp" | "rename";
  readonly cause: unknown;
}> {}

/**
 * The on-disk lockfile could not be probed outside the write path.
 * Read-before-commit failures use the lockfile read errors below.
 */
export class LockfileValidationError extends Data.TaggedError("LockfileValidationError")<{
  readonly path: string;
  readonly step: "probe";
  readonly cause: unknown;
}> {}

/** A lockfile resolved version is not an exact semver value. */
export class LockfileResolvedVersionInvalid extends Data.TaggedError(
  "LockfileResolvedVersionInvalid",
)<{
  readonly field: string;
  readonly value: string;
  readonly cause: unknown;
}> {}

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
