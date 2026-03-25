/**
 * Environment detection for credential storage tier selection.
 *
 * Each detector returns an Effect<boolean> that checks for a specific
 * runtime environment condition.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";

/**
 * Detects SSH environment via SSH_CLIENT or SSH_TTY env vars.
 */
export const detectSSH = Effect.sync(() => {
  return process.env["SSH_CLIENT"] !== undefined || process.env["SSH_TTY"] !== undefined;
});

/**
 * Detects container environment by checking for /.dockerenv or /.containerenv.
 */
export const detectContainer = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dockerExists = yield* fs
    .exists("/.dockerenv")
    .pipe(Effect.catch(() => Effect.succeed(false)));
  if (dockerExists) return true;
  const containerExists = yield* fs
    .exists("/.containerenv")
    .pipe(Effect.catch(() => Effect.succeed(false)));
  return containerExists;
});

/**
 * Detects WSL by checking /proc/version for "microsoft" (case-insensitive).
 */
export const detectWSL = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const exists = yield* fs.exists("/proc/version").pipe(Effect.catch(() => Effect.succeed(false)));
  if (!exists) return false;
  const content = yield* fs
    .readFileString("/proc/version")
    .pipe(Effect.catch(() => Effect.succeed("")));
  return /microsoft/i.test(content);
});

/**
 * Detects if running as root (uid 0).
 */
export const detectRoot = Effect.sync(() => process.getuid?.() === 0);
