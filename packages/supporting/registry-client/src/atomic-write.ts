/**
 * Shared atomic single-file replacement: write a uniquely named temp file in
 * the target's directory, then rename it over the target.
 *
 * Deliberately duplicated from the workspace-state kernel: an integration
 * may not depend on a kernel, and this helper is within the sanctioned
 * duplication budget for small pure functions. The registry consumers never
 * sweep stale temps, so that half of the original stays behind.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as FileSystem from "effect/FileSystem";
import type { PlatformError } from "effect/PlatformError";

/**
 * Step at which an atomic write failed. `check-target` and `read-target` can
 * only occur with `skipIfUnchanged: "fail-on-read-error"`.
 */
export type AtomicWriteStep = "check-target" | "read-target" | "write-temp" | "rename";

/** Failure passed to `mapError` so each call site keeps its own error shape. */
export interface AtomicWriteFailure {
  readonly step: AtomicWriteStep;
  readonly targetPath: string;
  readonly tempPath: string;
  readonly cause: PlatformError;
}

/**
 * Content-equality short-circuit mode: `fail-on-read-error` surfaces
 * check/read failures via `mapError`; `ignore-read-errors` treats an
 * unreadable target as changed and proceeds to write.
 */
export type SkipIfUnchanged = "fail-on-read-error" | "ignore-read-errors";

/** Options for `writeFileAtomic`. */
export interface WriteFileAtomicOptions<E> {
  readonly targetPath: string;
  readonly content: string | Uint8Array;
  /** When set, leave the target untouched if it already has this content. */
  readonly skipIfUnchanged?: SkipIfUnchanged;
  /** Best-effort remove of the target before rename (Windows cannot always rename over an existing file). */
  readonly removeTargetBeforeRename?: boolean;
  readonly mapError: (failure: AtomicWriteFailure) => E;
}

/** In-process sequence so concurrent fibers never share a temp path. */
let tempSequence = 0;

const atomicWriteTempPrefix = (targetPath: string): string => `${targetPath}.tmp.`;

const makeTempPath = (targetPath: string): string => {
  tempSequence += 1;
  const pid = typeof process === "object" ? process.pid.toString(36) : "x";
  const random = Math.random().toString(36).slice(2, 8);
  return `${atomicWriteTempPrefix(targetPath)}${pid}.${tempSequence.toString(36)}.${random}`;
};

const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const targetHasContent = (
  fs: FileSystem.FileSystem,
  targetPath: string,
  content: string | Uint8Array,
): Effect.Effect<boolean, PlatformError> =>
  typeof content === "string"
    ? Effect.map(fs.readFileString(targetPath), (current) => current === content)
    : Effect.map(fs.readFile(targetPath), (current) => bytesEqual(current, content));

/**
 * Atomically replace `targetPath` with `content` via a same-directory temp
 * file and rename. Failures at each step are mapped by the caller, so error
 * categories, details, and suggestions stay call-site specific.
 */
export const writeFileAtomic = <E>(
  fs: FileSystem.FileSystem,
  options: WriteFileAtomicOptions<E>,
): Effect.Effect<"written" | "skipped", E> =>
  Effect.gen(function* () {
    const { content, mapError, targetPath } = options;
    const tempPath = makeTempPath(targetPath);
    const fail =
      (step: AtomicWriteStep) =>
      (cause: PlatformError): E =>
        mapError({ step, targetPath, tempPath, cause });

    if (options.skipIfUnchanged === "fail-on-read-error") {
      const exists = yield* fs.exists(targetPath).pipe(Effect.mapError(fail("check-target")));
      if (exists) {
        const unchanged = yield* targetHasContent(fs, targetPath, content).pipe(
          Effect.mapError(fail("read-target")),
        );
        if (unchanged) return "skipped" as const;
      }
    } else if (options.skipIfUnchanged === "ignore-read-errors") {
      const unchanged = yield* targetHasContent(fs, targetPath, content).pipe(Effect.option);
      if (Option.isSome(unchanged) && unchanged.value) return "skipped" as const;
    }

    yield* Effect.gen(function* () {
      yield* (
        typeof content === "string"
          ? fs.writeFileString(tempPath, content)
          : fs.writeFile(tempPath, content)
      ).pipe(Effect.mapError(fail("write-temp")));
      if (options.removeTargetBeforeRename === true) {
        yield* fs.remove(targetPath).pipe(Effect.ignore);
      }
      yield* fs.rename(tempPath, targetPath).pipe(Effect.mapError(fail("rename")));
    }).pipe(Effect.ensuring(fs.remove(tempPath, { force: true }).pipe(Effect.ignore)));
    return "written" as const;
  });
