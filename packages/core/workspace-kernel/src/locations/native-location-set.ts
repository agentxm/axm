/** Finite physical observations for one read phase, never mutation authority. */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import type * as PlatformError from "effect/PlatformError";
import {
  NativeLocationError,
  resolveNativeEntry,
  resolveNativeReferent,
  type NativeEntryAddress,
} from "./native-address.js";

export interface NativeLocationSet {
  readonly entry: (target: string) => Effect.Effect<NativeEntryAddress, NativeLocationError>;
  readonly referent: (target: string) => Effect.Effect<string, NativeLocationError>;
}

/**
 * Resolve a finite requested set and its direct link targets. Identical filesystem
 * reads are shared only while capturing this set, including failed observations.
 * Neither the filesystem adapter nor its cache escapes. A new read phase must
 * capture a new set; settlement and write admission keep using live resolution.
 */
export const captureNativeLocationSet = (targets: {
  readonly entries?: ReadonlyArray<string>;
  readonly referents?: ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const shareRead = <A>(
      read: (target: string) => Effect.Effect<A, PlatformError.PlatformError>,
    ) => {
      const reads = new Map<string, Effect.Effect<A, PlatformError.PlatformError>>();
      return (target: string) =>
        Effect.gen(function* () {
          const key = path.resolve(target);
          const previous = reads.get(key);
          if (previous !== undefined) return yield* previous;
          const observed = yield* Effect.cached(read(key));
          reads.set(key, observed);
          return yield* observed;
        });
    };
    const readDirectory = shareRead((target) => fs.readDirectory(target));
    const capturedFileSystem = {
      ...fs,
      readDirectory: (target, options) =>
        options === undefined ? readDirectory(target) : fs.readDirectory(target, options),
      readLink: shareRead((target) => fs.readLink(target)),
      stat: shareRead((target) => fs.stat(target)),
      realPath: shareRead((target) => fs.realPath(target)),
    } satisfies FileSystem.FileSystem;
    const entries = new Map<string, Result.Result<NativeEntryAddress, NativeLocationError>>();
    const requestedEntries = [
      ...new Set((targets.entries ?? []).map((target) => path.resolve(target))),
    ];
    for (const target of requestedEntries) {
      const result = yield* resolveNativeEntry(target).pipe(
        Effect.provideService(FileSystem.FileSystem, capturedFileSystem),
        Effect.result,
      );
      entries.set(target, result);
      if (Result.isSuccess(result) && !entries.has(result.success.entryPath))
        entries.set(result.success.entryPath, result);
    }
    // Ownership can inspect the immediate target without following a foreign chain.
    for (const target of requestedEntries) {
      const result = entries.get(target);
      if (result === undefined || Result.isFailure(result)) continue;
      const address = result.success;
      if (address.kind !== "symlink" || address.linkTarget === undefined) continue;
      const immediate = path.resolve(path.dirname(address.entryPath), address.linkTarget);
      if (entries.has(immediate)) continue;
      entries.set(
        immediate,
        yield* resolveNativeEntry(immediate).pipe(
          Effect.provideService(FileSystem.FileSystem, capturedFileSystem),
          Effect.result,
        ),
      );
    }
    const referents = new Map<string, Result.Result<string, NativeLocationError>>();
    for (const target of new Set((targets.referents ?? []).map((target) => path.resolve(target)))) {
      referents.set(
        target,
        yield* resolveNativeReferent(target).pipe(
          Effect.provideService(FileSystem.FileSystem, capturedFileSystem),
          Effect.result,
        ),
      );
    }
    const missing = (target: string) =>
      Effect.fail(
        new NativeLocationError({
          target,
          reason: "unreadable",
          cause: "The path was not included in this native observation phase",
        }),
      );
    return {
      entry: (target) => {
        const observed = entries.get(path.resolve(target));
        return observed === undefined ? missing(target) : Effect.fromResult(observed);
      },
      referent: (target) => {
        const observed = referents.get(path.resolve(target));
        return observed === undefined ? missing(target) : Effect.fromResult(observed);
      },
    } satisfies NativeLocationSet;
  });
