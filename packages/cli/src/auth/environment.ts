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
import * as Option from "effect/Option";

import { CliEnvConfig } from "../config/index.js";

/**
 * Detects SSH environment via SSH_CLIENT or SSH_TTY env vars.
 */
export const detectSSH: Effect.Effect<boolean, never, CliEnvConfig> = Effect.gen(function* () {
  const config = yield* CliEnvConfig;
  return Option.isSome(config.sshClient) || Option.isSome(config.sshTty);
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
 * Detects CI environment via CI=true env var.
 */
export const detectCI: Effect.Effect<boolean, never, CliEnvConfig> = Effect.gen(function* () {
  const config = yield* CliEnvConfig;
  return config.ci === "true";
});

/**
 * Detects if running as root (uid 0).
 */
export const detectRoot = Effect.sync(() => process.getuid?.() === 0);
