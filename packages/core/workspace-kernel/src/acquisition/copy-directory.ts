/**
 * Shared extension utilities.
 *
 * Cross-cutting utilities used by multiple extension types.
 * Promoted from skills-specific modules to avoid cross-feature dependencies.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { PlatformError } from "effect/PlatformError";
import {
  assertResolvedNoPhysicalOverlap,
  NativeLocationError,
  resolveNativeEntry,
  validateContainedLink,
} from "../locations/index.js";
import * as Data from "effect/Data";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

// -----------------------------------------------------------------------------
// Extension Directory Copy
// -----------------------------------------------------------------------------

/**
 * VCS state is never copied in any copy mode. It does not belong to authored
 * package content, and copying a `.git` directory from a git-hosted or local
 * source would only bloat the canonical copy.
 */
const ALWAYS_EXCLUDED_NAMES = new Set([".git"]);

/**
 * Entries additionally omitted from an agent-facing artifact: human files,
 * AXM-managed install metadata, and authoring-private (`_`-prefixed) files.
 * These belong in the canonical copy (they are part of the published package)
 * but are trimmed when fanning out to an agent directory.
 */
const AGENT_ARTIFACT_EXCLUDED_NAMES = new Set(["README.md", "metadata.json"]);

export const MAX_COPIED_EXTENSION_BYTES = 256 * 1024 * 1024;
export const MAX_COPIED_EXTENSION_ENTRIES = 10_000;

export class DirectoryCopyLimitExceeded extends Data.TaggedError("DirectoryCopyLimitExceeded")<{
  readonly resource: "bytes" | "entries";
  readonly limit: number;
}> {}

const isExcluded = (name: string, forAgentArtifact: boolean): boolean => {
  if (ALWAYS_EXCLUDED_NAMES.has(name)) return true;
  if (!forAgentArtifact) return false;
  return AGENT_ARTIFACT_EXCLUDED_NAMES.has(name) || name.startsWith("_");
};

/**
 * What a walk of a copy source observed immediately before the copy: each
 * listed entry's link value and each listed directory's children in listing
 * order, keyed by the entry's path relative to `root`.
 */
interface CopySourceObservation {
  readonly root: string;
  readonly links: HashMap.HashMap<string, Option.Option<string>>;
  readonly children: HashMap.HashMap<string, ReadonlyArray<string>>;
}

/**
 * Record a walk of `root` for the copy that immediately follows it.
 *
 * `listing` is a recursive directory listing of `root` in the order it was
 * returned, as paths relative to `root`, each with the outcome of reading its
 * link value (none when the read failed). A recursive listing descends into
 * every entry that is a directory, so a listed directory without listed
 * children is empty.
 */
export const observeCopySource = (
  root: string,
  listing: Iterable<readonly [relativePath: string, link: Option.Option<string>]>,
): Effect.Effect<CopySourceObservation, never, Path.Path> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const links: Array<readonly [string, Option.Option<string>]> = [];
    const grouped = new Map<string, Array<string>>();
    for (const [relativePath, link] of listing) {
      links.push([relativePath, link]);
      const parent = path.dirname(relativePath);
      const key = parent === "." ? "" : parent;
      const siblings = grouped.get(key);
      if (siblings === undefined) grouped.set(key, [path.basename(relativePath)]);
      else siblings.push(path.basename(relativePath));
    }
    return Object.freeze({
      root,
      links: HashMap.fromIterable(links),
      children: HashMap.fromIterable(
        Array.from(grouped, ([key, names]) => [key, Object.freeze(names)] as const),
      ),
    });
  });

const scanCopy = (
  src: string,
  dest: string,
  fs: FileSystem.FileSystem,
  path: Path.Path,
  forAgentArtifact: boolean,
  maxBytes: number,
  maxEntries: number,
  observation: CopySourceObservation | undefined,
) =>
  Effect.gen(function* () {
    // An entry the walk did not list is read live.
    const readLink = (source: string, key: string): Effect.Effect<Option.Option<string>> => {
      const observed =
        observation === undefined ? Option.none() : HashMap.get(observation.links, key);
      return Option.isSome(observed)
        ? Effect.succeed(observed.value)
        : fs.readLink(source).pipe(Effect.option);
    };
    const readDirectory = (
      source: string,
      key: string,
    ): Effect.Effect<ReadonlyArray<string>, PlatformError> => {
      if (observation === undefined) return fs.readDirectory(source);
      const observed = HashMap.get(observation.children, key);
      if (Option.isSome(observed)) return Effect.succeed(observed.value);
      return key === "" || HashMap.has(observation.links, key)
        ? Effect.succeed([])
        : fs.readDirectory(source);
    };
    const pending = [{ source: src, target: dest, key: "" }];
    const directories: Array<string> = [];
    const files: Array<{ source: string; target: string; mode: number }> = [];
    const links: Array<{ source: string; target: string; value: string }> = [];
    let entries = 0;
    let bytes = 0;

    while (pending.length > 0) {
      const next = pending.pop();
      if (next === undefined) break;
      // The selected source root may itself be an alias. Preserve links within
      // its payload without traversing them, including links back to the root.
      const link =
        next.source === src ? Option.none<string>() : yield* readLink(next.source, next.key);
      if (Option.isSome(link)) {
        yield* validateContainedLink(src, next.source, link.value);
        bytes += new TextEncoder().encode(link.value).byteLength;
        if (bytes > maxBytes)
          return yield* new DirectoryCopyLimitExceeded({ resource: "bytes", limit: maxBytes });
        links.push({ ...next, value: link.value });
        continue;
      }
      const info = yield* fs.stat(next.source);
      if (info.type === "Directory") {
        directories.push(next.target);
        const children = (yield* readDirectory(next.source, next.key)).filter(
          (name) => !isExcluded(name, forAgentArtifact),
        );
        entries += children.length;
        if (entries > maxEntries) {
          return yield* new DirectoryCopyLimitExceeded({ resource: "entries", limit: maxEntries });
        }
        for (const name of children) {
          pending.push({
            source: path.join(next.source, name),
            target: path.join(next.target, name),
            key: next.key === "" ? name : path.join(next.key, name),
          });
        }
      } else if (info.type === "File") {
        bytes += Number(info.size);
        if (bytes > maxBytes) {
          return yield* new DirectoryCopyLimitExceeded({ resource: "bytes", limit: maxBytes });
        }
        files.push({ ...next, mode: info.mode & 0o777 });
      } else
        return yield* new NativeLocationError({
          target: next.source,
          reason: "unreadable",
          cause: "unsupported-payload-entry",
        });
    }

    return { directories, files, links };
  });

/**
 * Options for {@link copyExtensionDirectory}.
 */
export type CopyExtensionDirectoryOptions = {
  /**
   * When true, omit entries that should not appear in a fanned-out agent
   * artifact: `README.md`, `metadata.json`, and `_`-prefixed names (`.git` is
   * always omitted).
   *
   * Defaults to `false` — a faithful copy of the source, matching what
   * `publish` packages into the archive. Canonical materialization must use
   * the faithful copy so realigning a lockfile does not strip authored files
   * (e.g. `README.md`) that the published package contains.
   */
  readonly forAgentArtifact?: boolean;
  readonly maxBytes?: number;
  readonly maxEntries?: number;
  /**
   * A walk of `src` from {@link observeCopySource}, valid only for a copy that
   * immediately follows that walk with no write in between. The scan takes
   * link values and directory listings from it instead of reading them again;
   * every other read and check stays live. Ignored for a different `src`.
   */
  readonly sourceObservation?: CopySourceObservation;
};

/**
 * Recursively copies an extension directory from `src` to `dest`.
 *
 * By default this is a faithful copy of every entry except `.git`, used to
 * materialize the canonical extension store from a package archive or local
 * source. Pass `{ forAgentArtifact: true }` to also omit non-artifact entries
 * when fanning the canonical copy out to an agent directory (see
 * {@link CopyExtensionDirectoryOptions}).
 *
 * Relative symlinks contained within the source package are preserved.
 * Source content is scanned before any target write. Files are streamed one at
 * a time so a failed or cancelled copy leaves no queued filesystem work.
 */
export const copyExtensionDirectory = (
  src: string,
  dest: string,
  options?: CopyExtensionDirectoryOptions,
): Effect.Effect<
  void,
  PlatformError | DirectoryCopyLimitExceeded | NativeLocationError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    // The source root's resolution here serves every overlap check of this copy:
    // nothing is written before the last of them.
    const srcAddress = yield* resolveNativeEntry(src);
    yield* assertResolvedNoPhysicalOverlap(dest, srcAddress, yield* resolveNativeEntry(dest));
    const maxBytes = Math.min(
      options?.maxBytes ?? MAX_COPIED_EXTENSION_BYTES,
      MAX_COPIED_EXTENSION_BYTES,
    );
    const maxEntries = Math.min(
      options?.maxEntries ?? MAX_COPIED_EXTENSION_ENTRIES,
      MAX_COPIED_EXTENSION_ENTRIES,
    );
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      return yield* new DirectoryCopyLimitExceeded({ resource: "bytes", limit: maxBytes });
    }
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      return yield* new DirectoryCopyLimitExceeded({ resource: "entries", limit: maxEntries });
    }
    const { directories, files, links } = yield* scanCopy(
      src,
      dest,
      fs,
      path,
      options?.forAgentArtifact ?? false,
      maxBytes,
      maxEntries,
      options?.sourceObservation?.root === src ? options.sourceObservation : undefined,
    );
    // A destination may alias any source member, not only its corresponding
    // filename. Capture the complete read set before authorizing any write.
    const sources = yield* Effect.forEach(files, (file) =>
      Effect.map(resolveNativeEntry(file.source), (address) => ({ ...file, address })),
    );
    const sourceIdentityUnavailable = sources.some(({ address }) => address.inode === undefined);
    const sourcePaths = new Set(
      sources.map(({ address }) => address.referentPath ?? address.entryPath),
    );
    const sourceIdentities = new Set(
      sources.flatMap(({ address }) =>
        address.inode === undefined ? [] : [JSON.stringify([address.device, address.inode])],
      ),
    );
    // Each destination is resolved once, where its first overlap check needs it.
    for (const { address, target } of sources) {
      const destination = yield* resolveNativeEntry(target);
      yield* assertResolvedNoPhysicalOverlap(target, srcAddress, destination);
      yield* assertResolvedNoPhysicalOverlap(target, address, destination);
      if (destination.kind === "absent") continue;
      if (destination.inode === undefined || sourceIdentityUnavailable)
        return yield* new NativeLocationError({
          target,
          reason: "unreadable",
          cause: "source-or-target-identity-unavailable",
        });
      if (
        sourcePaths.has(destination.referentPath ?? destination.entryPath) ||
        sourceIdentities.has(JSON.stringify([destination.device, destination.inode]))
      )
        return yield* new NativeLocationError({ target, reason: "source-overlap" });
      // Excluded package members are still source-owned bytes. An existing
      // hardlink could reach one of them without appearing in the read set.
      if (BigInt(destination.links ?? "1") > 1n)
        return yield* new NativeLocationError({ target, reason: "hardlink" });
    }
    for (const { target } of links) {
      const destination = yield* resolveNativeEntry(target);
      yield* assertResolvedNoPhysicalOverlap(target, srcAddress, destination);
      if (destination.kind !== "absent")
        return yield* new NativeLocationError({ target, reason: "workspace-conflict" });
    }
    yield* Effect.forEach(
      directories,
      (directory) => fs.makeDirectory(directory, { recursive: true }),
      {
        concurrency: 1,
        discard: true,
      },
    );
    const copiedBytes = yield* Ref.make(0);
    yield* Effect.forEach(
      files,
      ({ source, target, mode }) =>
        fs.stream(source, { chunkSize: 64 * 1024 }).pipe(
          Stream.mapEffect((chunk) =>
            Effect.gen(function* () {
              const total = yield* Ref.updateAndGet(
                copiedBytes,
                (count) => count + chunk.byteLength,
              );
              if (total > maxBytes) {
                return yield* new DirectoryCopyLimitExceeded({
                  resource: "bytes",
                  limit: maxBytes,
                });
              }
              return chunk;
            }),
          ),
          Stream.run(fs.sink(target, { mode })),
          // Restore source permissions after creation so the umask does not
          // strip executable or access bits; special bits are never copied.
          Effect.andThen(fs.chmod(target, mode)),
        ),
      { concurrency: 1, discard: true },
    );
    yield* Effect.forEach(links, ({ target, value }) => fs.symlink(value, target), {
      concurrency: 1,
      discard: true,
    });
  });
