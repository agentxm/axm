/**
 * Runtime environment detection utilities.
 *
 * Pure functions for env var / process checks. Effect-based for filesystem checks.
 */

import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Flag, GlobalFlag } from "effect/unstable/cli";

/** Returns true if CI=true env var is set. */
export const isCI = (): boolean => process.env["CI"] === "true";

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
  return Option.getOrElse(flag, () => isCI() || process.stdin.isTTY !== true);
});

/** Returns true if SSH_CLIENT or SSH_TTY env var is set. */
export const isSSH = (): boolean =>
  process.env["SSH_CLIENT"] !== undefined || process.env["SSH_TTY"] !== undefined;

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
