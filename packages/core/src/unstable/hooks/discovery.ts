/**
 * Hook package discovery for local and git sources.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import {
  HOOK_MANIFEST_FILENAME,
  HookManifestSchema,
  type HookManifest,
} from "./manifest-schema.js";

export interface DiscoveredHookPackage {
  readonly type: "hook";
  readonly manifest: HookManifest;
  readonly location: string;
}

export interface HookPackageDiscoveryOptions {
  readonly fullDepth: boolean;
}

const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".axm",
  "dist",
  "build",
  "__pycache__",
]);
const MAX_DEPTH = 5;

const tryParseHookPackageInDir = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifestPath = path.join(dir, HOOK_MANIFEST_FILENAME);
    const exists = yield* fs.exists(manifestPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return Option.none<DiscoveredHookPackage>();
    const raw = yield* fs.readFileString(manifestPath).pipe(Effect.option);
    if (Option.isNone(raw)) return Option.none<DiscoveredHookPackage>();
    const json = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(raw.value).pipe(
      Effect.option,
    );
    if (Option.isNone(json)) return Option.none<DiscoveredHookPackage>();
    const manifest = yield* Schema.decodeUnknownEffect(HookManifestSchema)(json.value).pipe(
      Effect.option,
    );
    if (Option.isNone(manifest)) return Option.none<DiscoveredHookPackage>();
    return Option.some({
      type: "hook" as const,
      manifest: manifest.value,
      location: `file://${dir}`,
    });
  });

const scanChildren = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
    if (Option.isNone(entries)) return [] satisfies ReadonlyArray<DiscoveredHookPackage>;
    return yield* Effect.forEach(
      entries.value,
      (entry) =>
        Effect.gen(function* () {
          const fullPath = path.join(dir, entry);
          const stat = yield* fs.stat(fullPath).pipe(Effect.option);
          if (Option.isNone(stat) || stat.value.type !== "Directory") {
            return [] satisfies ReadonlyArray<DiscoveredHookPackage>;
          }
          const discovered = yield* tryParseHookPackageInDir(fullPath);
          return Option.isSome(discovered) ? [discovered.value] : [];
        }),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((results) => Array.flatten(results)));
  });

const recursiveScan = (
  dir: string,
  depth: number,
): Effect.Effect<ReadonlyArray<DiscoveredHookPackage>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (depth > MAX_DEPTH) return [] satisfies ReadonlyArray<DiscoveredHookPackage>;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
    if (Option.isNone(entries)) return [] satisfies ReadonlyArray<DiscoveredHookPackage>;
    return yield* Effect.forEach(
      entries.value,
      (entry) =>
        Effect.gen(function* () {
          if (SKIPPED_DIRECTORIES.has(entry))
            return [] satisfies ReadonlyArray<DiscoveredHookPackage>;
          const fullPath = path.join(dir, entry);
          const stat = yield* fs.stat(fullPath).pipe(Effect.option);
          if (Option.isNone(stat) || stat.value.type !== "Directory") {
            return [] satisfies ReadonlyArray<DiscoveredHookPackage>;
          }
          const discovered = yield* tryParseHookPackageInDir(fullPath);
          const current = Option.isSome(discovered) ? [discovered.value] : [];
          const nested = yield* recursiveScan(fullPath, depth + 1);
          return [...current, ...nested];
        }),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((results) => Array.flatten(results)));
  });

export const hookPackagesInDir = (
  searchPath: string,
  options: HookPackageDiscoveryOptions,
): Effect.Effect<ReadonlyArray<DiscoveredHookPackage>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const direct = yield* tryParseHookPackageInDir(searchPath);
    const directHooks = Option.isSome(direct) ? [direct.value] : [];
    if (directHooks.length > 0 && !options.fullDepth) return directHooks;
    const childHooks = yield* scanChildren(searchPath);
    if ((directHooks.length > 0 || childHooks.length > 0) && !options.fullDepth) {
      return [...directHooks, ...childHooks];
    }
    const recursiveHooks = yield* recursiveScan(searchPath, 0);
    const all = [...directHooks, ...childHooks, ...recursiveHooks];
    const seen = new Set<string>();
    return all.filter((hook) => {
      if (seen.has(hook.manifest.name)) return false;
      seen.add(hook.manifest.name);
      return true;
    });
  });
