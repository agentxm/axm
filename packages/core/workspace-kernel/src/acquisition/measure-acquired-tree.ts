import { MAX_ACQUIRED_TREE_BYTES } from "./scratch-budget.js";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as HashMap from "effect/HashMap";
import * as Option from "effect/Option";
import { validateContainedLink } from "../locations/index.js";
import * as Path from "effect/Path";

export const MAX_ACQUIRED_TREE_ENTRIES = 10_000;

export class AcquiredTreeLimitExceeded extends Data.TaggedError("AcquiredTreeLimitExceeded")<{
  readonly resource: "bytes" | "entries";
  readonly limit: number;
}> {}

/** What a completed measure observed of one entry beneath the measured root. */
type AcquiredTreeEntry =
  { readonly link: true } | { readonly link: false; readonly type: FileSystem.File.Type };

/**
 * What one completed measure of an acquired tree observed, without following
 * links: the listing of every directory it listed and the kind of every entry
 * beneath the root it visited. Paths are absolute and resolved; a path the
 * measure did not observe answers none. Each listing is a fresh copy.
 */
export interface AcquiredTreeObservation {
  /** The measured root, which the measure observed to exist. */
  readonly root: string;
  readonly listing: (directory: string) => Option.Option<ReadonlyArray<string>>;
  readonly entry: (entry: string) => Option.Option<AcquiredTreeEntry>;
}

/** Count a staged tree before it is admitted to the operation's retained scratch. */
export const measureAcquiredTree = (
  directory: string,
  options?: { readonly maxBytes?: number; readonly maxEntries?: number },
) =>
  observeAcquiredTree(directory, options).pipe(
    Effect.map(({ bytes, entries }) => ({ bytes, entries })),
  );

/**
 * Measure a staged tree exactly as `measureAcquiredTree` does, with the same
 * limits and failures in the same order, and return what the measure observed
 * of the tree alongside its counts.
 */
export const observeAcquiredTree = (
  directory: string,
  options?: { readonly maxBytes?: number; readonly maxEntries?: number },
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const maxBytes = Math.min(
      options?.maxBytes ?? MAX_ACQUIRED_TREE_BYTES,
      MAX_ACQUIRED_TREE_BYTES,
    );
    const maxEntries = Math.min(
      options?.maxEntries ?? MAX_ACQUIRED_TREE_ENTRIES,
      MAX_ACQUIRED_TREE_ENTRIES,
    );
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      return yield* new AcquiredTreeLimitExceeded({ resource: "bytes", limit: maxBytes });
    }
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      return yield* new AcquiredTreeLimitExceeded({ resource: "entries", limit: maxEntries });
    }
    const pending = [directory];
    let entries = 0;
    let bytes = 0;
    const listings: Array<readonly [string, ReadonlyArray<string>]> = [];
    const visited: Array<readonly [string, AcquiredTreeEntry]> = [];

    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined) break;
      const link =
        current === directory
          ? Option.none<string>()
          : yield* fs.readLink(current).pipe(Effect.option);
      if (Option.isSome(link)) {
        yield* validateContainedLink(directory, current, link.value);
        visited.push([path.resolve(current), { link: true }]);
        bytes += new TextEncoder().encode(link.value).byteLength;
        if (bytes > maxBytes)
          return yield* new AcquiredTreeLimitExceeded({ resource: "bytes", limit: maxBytes });
        continue;
      }
      const info = yield* fs.stat(current);
      if (current !== directory)
        visited.push([path.resolve(current), { link: false, type: info.type }]);
      if (info.type === "Directory") {
        const children = yield* fs.readDirectory(current);
        listings.push([path.resolve(current), Object.freeze([...children])]);
        entries += children.length;
        if (entries > maxEntries) {
          return yield* new AcquiredTreeLimitExceeded({
            resource: "entries",
            limit: maxEntries,
          });
        }
        for (const name of children) pending.push(path.join(current, name));
      } else {
        bytes += Number(info.size);
        if (bytes > maxBytes) {
          return yield* new AcquiredTreeLimitExceeded({
            resource: "bytes",
            limit: maxBytes,
          });
        }
      }
    }
    const listed = HashMap.fromIterable(listings);
    const kinds = HashMap.fromIterable(visited);
    const observation: AcquiredTreeObservation = {
      root: path.resolve(directory),
      listing: (target) =>
        Option.map(HashMap.get(listed, path.resolve(target)), (children) => [...children]),
      entry: (target) => HashMap.get(kinds, path.resolve(target)),
    };
    return { bytes, entries, observation };
  });
