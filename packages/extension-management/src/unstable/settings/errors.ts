/**
 * Typed failure family for settings writes. Fields are domain facts; the
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
  readonly step: "mkdir" | "encode" | "write-temp" | "rename";
  readonly cause: unknown;
}> {}
