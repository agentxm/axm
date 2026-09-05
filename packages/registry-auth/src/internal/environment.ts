/**
 * Runtime environment detection for credential policy and login flows.
 *
 * Pure functions for env var / process checks. Effect-based for filesystem
 * checks. Mirrors the shared helpers the extracted kernels carry; a generic
 * utils package is deliberately not created.
 */

import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

// eslint-disable-next-line no-restricted-properties -- Centralized env var access point; all callers use these helpers
const readEnv = (name: string): string | undefined => process.env[name];

/** Read an optional env var. Centralized access point for process.env. */
export const envOption = (name: string): Effect.Effect<Option.Option<string>> =>
  Effect.sync(() => Option.fromUndefinedOr(readEnv(name)));

/** Returns true if SSH_CLIENT or SSH_TTY env var is set. */
export const isSSH: Effect.Effect<boolean> = Effect.sync(
  () => readEnv("SSH_CLIENT") !== undefined || readEnv("SSH_TTY") !== undefined,
);

/** Returns true if running as root (uid 0). */
export const isRoot = (): boolean => process.getuid?.() === 0;

/** Returns true if /.dockerenv or /.containerenv exists. Requires FileSystem. */
export const isContainer = Effect.gen(function* () {
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

/** Returns true if /proc/version contains "microsoft". Requires FileSystem. */
export const isWSL = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const exists = yield* fs.exists("/proc/version").pipe(Effect.catch(() => Effect.succeed(false)));
  if (!exists) return false;
  const content = yield* fs
    .readFileString("/proc/version")
    .pipe(Effect.catch(() => Effect.succeed("")));
  return /microsoft/i.test(content);
});

/** Returns true if CI env var is set. */
export const isCI: Effect.Effect<boolean> = Effect.map(envOption("CI"), (value) =>
  Option.exists(value, (raw) => raw.length > 0 && raw !== "0" && raw.toLowerCase() !== "false"),
);
