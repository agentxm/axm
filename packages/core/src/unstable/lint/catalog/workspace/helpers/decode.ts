/**
 * Shared schema decode helpers for workspace lint rules.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { LockfileSchema, type Lockfile } from "../../../../lockfile/schema.js";
import { SettingsSchema, type Settings } from "../../../../settings/schema.js";

/** Decode workspace settings, returning `Option.none()` on schema failure. */
export const decodeSettings = (input: unknown): Option.Option<Settings> => {
  const result = Schema.decodeUnknownResult(SettingsSchema)(input, {
    onExcessProperty: "ignore",
    errors: "all",
  });
  return Result.isSuccess(result) ? Option.some(result.success) : Option.none();
};

/** Decode the workspace lockfile, returning `Option.none()` on schema failure. */
export const decodeLockfile = (input: unknown): Option.Option<Lockfile> => {
  const result = Schema.decodeUnknownResult(LockfileSchema)(input, {
    onExcessProperty: "ignore",
    errors: "all",
  });
  return Result.isSuccess(result) ? Option.some(result.success) : Option.none();
};
