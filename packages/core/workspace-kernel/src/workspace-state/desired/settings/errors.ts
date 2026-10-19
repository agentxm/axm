/**
 * Typed failure families for settings reads and writes. Fields are domain facts; the
 * application error boundary owns rendering, codes, and suggestions.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Data from "effect/Data";

/**
 * Settings write failure at one step of the write pipeline. `path` carries
 * the fact each step's message interpolates: the settings directory for
 * `mkdir`, the temp file for `write-temp`, and the settings path otherwise.
 */
export class SettingsWriteError extends Data.TaggedError("SettingsWriteError")<{
  readonly path: string;
  readonly step: "mkdir" | "encode" | "check-target" | "read-target" | "write-temp" | "rename";
  readonly cause: unknown;
}> {}

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
