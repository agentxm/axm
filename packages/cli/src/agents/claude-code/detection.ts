/**
 * Claude Code agent detection.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as PlatformError from "@effect/platform/Error";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Effect from "effect/Effect";
import { claudeHome } from "./constants.js";

/**
 * Detect if Claude Code is installed.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const detect = (): Effect.Effect<
  boolean,
  PlatformError.PlatformError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.exists(claudeHome);
  });
