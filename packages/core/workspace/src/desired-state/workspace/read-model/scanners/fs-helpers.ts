/**
 * Shared filesystem helpers used by the workspace read-model scanners.
 *
 * Each scanner needs the same handful of resilient `FileSystem` probes:
 * "does this file exist", "list this directory's children", "filter to
 * subdirectories only", and "split an absolute path by the platform
 * separator". Before this module they were duplicated nearly verbatim across
 * `agent-dir.ts`, `agent-settings.ts`, and `canonical-extensions.ts`, with
 * subtle drift in their diagnostic-message prefixes and in whether
 * `filterDirectories` accepted a `diagnostics` argument.
 *
 * Helpers in this module:
 *
 * - Take a `scannerName` so each scanner's diagnostics carry its own prefix
 *   (`canonical-extensions:`, `agent-dir:`, etc.) — matching the call-site
 *   strings the existing scanner tests assert on.
 * - Return `Option<T>` from probe-style helpers (`fileExists`,
 *   `directoryCandidate`) so callers can compose with `Array.getSomes`
 *   instead of `null` sentinels. Boolean wrappers stay available where the
 *   caller cares about presence directly.
 * - Carry no `R` requirement: each helper takes `fs` / `path` / `diagnostics`
 *   directly as arguments and the resulting `Effect` is dependency-closed.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import type { Diagnostics } from "../diagnostics.js";

/**
 * Probe a path with `fs.exists`. Returns `true` when the file exists,
 * `false` when it does not, and emits a `scanner-io` diagnostic and returns
 * `false` when the probe itself errors.
 */
export const fileExists = (
  scannerName: string,
  fs: FileSystem.FileSystem,
  diagnostics: Diagnostics,
  filePath: string,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    const exists = yield* Effect.result(fs.exists(filePath));
    if (exists._tag === "Failure") {
      yield* diagnostics.append({
        source: "scanner",
        message: `${scannerName}: cannot stat ${filePath}`,
        path: filePath,
        code: "scanner-io",
      });
      return false;
    }
    return exists.success;
  });

/**
 * Enumerate the immediate children of `parent` and return their absolute
 * paths. When `parent` is absent, returns `[]`. When `parent` exists but
 * cannot be enumerated, emits a `scanner-io` diagnostic and returns `[]`.
 *
 * Callers feed the result into `filterDirectories` to keep only
 * subdirectories, or treat each entry as a candidate file to probe.
 */
export const childEntries = (
  scannerName: string,
  fs: FileSystem.FileSystem,
  diagnostics: Diagnostics,
  path: Path.Path,
  parent: string,
): Effect.Effect<ReadonlyArray<string>> =>
  Effect.gen(function* () {
    const exists = yield* Effect.result(fs.exists(parent));
    if (exists._tag === "Failure") {
      yield* diagnostics.append({
        source: "scanner",
        message: `${scannerName}: cannot stat ${parent}`,
        path: parent,
        code: "scanner-io",
      });
      return [];
    }
    if (!exists.success) return [];

    const entries = yield* Effect.result(fs.readDirectory(parent));
    if (entries._tag === "Failure") {
      yield* diagnostics.append({
        source: "scanner",
        message: `${scannerName}: cannot read directory ${parent}`,
        path: parent,
        code: "scanner-io",
      });
      return [];
    }
    return entries.success.map((entry) => path.join(parent, entry));
  });

/**
 * Filter `candidates` down to entries that are directories. Directory
 * detection uses a successful `readDirectory` call so the helper stays
 * compatible with the v1 fixture builder's in-memory `FileSystem`, which
 * does not implement `fs.stat`.
 *
 * Failures (file or unreadable directory) are silently dropped: an explicit
 * warning here would fire on every regular file inside a scanned tree
 * (`README.md`, `SKILL.md`, etc.). The shared scanner test still asserts
 * that failing-fs cases surface warnings via the parent `readDirectory`.
 */
export const filterDirectories = (
  fs: FileSystem.FileSystem,
  candidates: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<string>> =>
  Effect.gen(function* () {
    const checks = yield* Effect.forEach(
      candidates,
      (candidate) =>
        Effect.gen(function* () {
          const result = yield* Effect.result(fs.readDirectory(candidate));
          if (result._tag === "Failure") return Option.none<string>();
          return Option.some(candidate);
        }),
      { concurrency: "unbounded" },
    );
    return Array.getSomes(checks);
  });

/**
 * Split an absolute path into its constituent segments using the `Path`
 * service's platform separator. Subject modules consume the array so they do
 * not re-parse the string with a hard-coded `/` separator. POSIX
 * `/ws/.claude/skills/x` → `["", "ws", ".claude", "skills", "x"]`; Windows
 * `C:\\ws\\.claude\\skills\\x` → `["C:", "ws", ".claude", "skills", "x"]`.
 */
export const splitAbsolutePathSegments = (
  path: Path.Path,
  absolute: string,
): ReadonlyArray<string> => absolute.split(path.sep);
