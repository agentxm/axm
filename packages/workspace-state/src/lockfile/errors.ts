/**
 * Typed failure families for lockfile writes and on-disk lockfile validation.
 * Fields are domain facts; the application error boundary owns rendering,
 * codes, and suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";

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
 * The on-disk lockfile could not be probed, checked, read, parsed, or
 * decoded. `probe` is the existence probe outside the write path; the other
 * steps come from the read-before-commit path.
 */
export class LockfileValidationError extends Data.TaggedError("LockfileValidationError")<{
  readonly path: string;
  readonly step: "probe" | "check" | "read" | "parse" | "decode";
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
