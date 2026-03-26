/**
 * Runtime environment detection utilities.
 *
 * Pure functions for env var / process checks. Effect-based for filesystem checks.
 */

import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Flag, GlobalFlag } from "effect/unstable/cli";

// eslint-disable-next-line no-restricted-properties -- Centralized env var access point; all callers use these helpers
const readEnv = (name: string): string | undefined => process.env[name];

/** Read an optional env var. Centralized access point for process.env. */
export const envOption = (name: string): Effect.Effect<Option.Option<string>> =>
  Effect.sync(() => Option.fromUndefinedOr(readEnv(name)));

/** Read an env var with a default value. Centralized access point for process.env. */
export const envWithDefault = (name: string, fallback: string): Effect.Effect<string> =>
  Effect.sync(() => readEnv(name) ?? fallback);

/** Returns true if CI=true env var is set. */
export const isCI: Effect.Effect<boolean> = Effect.sync(() => readEnv("CI") === "true");

/**
 * Raw --non-interactive global flag. Callers should use {@link isNonInteractive}
 * as the source of truth for interactivity — it combines this flag with
 * environment detection (CI, TTY).
 */
export const nonInteractiveFlag = GlobalFlag.setting("axm-non-interactive")({
  flag: Flag.boolean("non-interactive").pipe(
    Flag.optional,
    Flag.withDescription("Disable all interactive prompts"),
  ),
});

/**
 * Returns true when the process should suppress interactive prompts.
 *
 * Resolution chain: explicit --non-interactive flag → CI=true env var → stdin is not a TTY.
 * When the flag is explicitly set, it wins. Environment detection is the fallback.
 */
export const isNonInteractive = Effect.gen(function* () {
  const flag = yield* nonInteractiveFlag;
  const ci = yield* isCI;
  return Option.getOrElse(flag, () => ci || process.stdin.isTTY !== true);
});

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
