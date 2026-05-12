/**
 * Runtime environment detection utilities.
 *
 * Pure functions for env var / process checks. Effect-based for filesystem checks.
 *
 * CLI-specific detection (isCI, isNonInteractive, nonInteractiveFlag) lives in
 * cli-flags/non-interactive.ts. This module covers general environment detection.
 */

import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

// eslint-disable-next-line no-restricted-properties -- Centralized env var access point; all callers use these helpers
const readEnv = (name: string): string | undefined => process.env[name];

/** Read an optional env var. Centralized access point for process.env. */
export const envOption = (name: string): Effect.Effect<Option.Option<string>> =>
  Effect.sync(() => Option.fromUndefinedOr(readEnv(name)));

/** Read an env var with a default value. Centralized access point for process.env. */
export const envWithDefault = (name: string, fallback: string): Effect.Effect<string> =>
  Effect.sync(() => readEnv(name) ?? fallback);

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

/**
 * Pure data-dir resolution given explicit home-directory inputs.
 * Shared by `resolveAxmDataDir` (reads process globals) and call sites
 * that supply inputs directly for testability.
 */
export const resolveAxmDataDirPure = (
  pathJoin: (...segments: ReadonlyArray<string>) => string,
  homeDir: string,
): string => {
  return pathJoin(homeDir, ".axm");
};

/**
 * Resolve the axm data directory using platform conventions.
 *
 * - Unix: `~/.axm/`
 * - Windows: `%USERPROFILE%\.axm\`
 */
export const resolveAxmDataDir = (pathJoin: (...segments: ReadonlyArray<string>) => string) =>
  Effect.sync(() => {
    const platform = process.platform;
    const homeDir =
      platform === "win32"
        ? (readEnv("USERPROFILE") ?? readEnv("HOME") ?? readEnv("HOMEPATH") ?? "/tmp")
        : (readEnv("HOME") ?? readEnv("USERPROFILE") ?? readEnv("HOMEPATH") ?? "/tmp");
    return resolveAxmDataDirPure(pathJoin, homeDir);
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
