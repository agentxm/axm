/**
 * Codex agent detection.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type * as PlatformError from "@effect/platform/Error";
import * as FileSystem from "@effect/platform/FileSystem";
import * as Effect from "effect/Effect";
import { codexHome } from "./constants.js";

/**
 * Detect if Codex is installed.
 *
 * Checks both the codexHome directory and /etc/codex as alternative paths.
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
    const [codexExists, etcExists] = yield* Effect.all(
      [fs.exists(codexHome), fs.exists("/etc/codex")],
      { concurrency: "unbounded" },
    );
    return codexExists || etcExists;
  });
