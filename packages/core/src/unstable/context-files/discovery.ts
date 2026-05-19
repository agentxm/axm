/**
 * Context files package discovery for local and git sources.
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
  CONTEXT_FILES_MANIFEST_FILENAME,
  ContextFilesManifestSchema,
  type ContextFilesManifest,
} from "./manifest-schema.js";

export interface DiscoveredContextFilesPackage {
  readonly type: "file";
  readonly manifest: ContextFilesManifest;
  readonly location: string;
}

export interface ContextFilesPackageDiscoveryOptions {
  readonly fullDepth: boolean;
}

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", "__pycache__"]);
const MAX_DEPTH = 5;

const tryParseContextFilesPackageInDir = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifestPath = path.join(dir, CONTEXT_FILES_MANIFEST_FILENAME);
    const exists = yield* fs.exists(manifestPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return Option.none<DiscoveredContextFilesPackage>();
    const raw = yield* fs.readFileString(manifestPath).pipe(Effect.option);
    if (Option.isNone(raw)) return Option.none<DiscoveredContextFilesPackage>();
    const json = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(raw.value).pipe(
      Effect.option,
    );
    if (Option.isNone(json)) return Option.none<DiscoveredContextFilesPackage>();
    const manifest = yield* Schema.decodeUnknownEffect(ContextFilesManifestSchema)(json.value).pipe(
      Effect.option,
    );
    if (Option.isNone(manifest)) return Option.none<DiscoveredContextFilesPackage>();
    return Option.some({
      type: "file" as const,
      manifest: manifest.value,
      location: `file://${dir}`,
    });
  });

const scanChildren = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
    if (Option.isNone(entries)) return [] satisfies ReadonlyArray<DiscoveredContextFilesPackage>;
    return yield* Effect.forEach(
      entries.value,
      (entry) =>
        Effect.gen(function* () {
          const fullPath = path.join(dir, entry);
          const stat = yield* fs.stat(fullPath).pipe(Effect.option);
          if (Option.isNone(stat) || stat.value.type !== "Directory") {
            return [] satisfies ReadonlyArray<DiscoveredContextFilesPackage>;
          }
          const discovered = yield* tryParseContextFilesPackageInDir(fullPath);
          return Option.isSome(discovered) ? [discovered.value] : [];
        }),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((results) => Array.flatten(results)));
  });

const recursiveScan = (
  dir: string,
  depth: number,
): Effect.Effect<
  ReadonlyArray<DiscoveredContextFilesPackage>,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    if (depth > MAX_DEPTH) return [] satisfies ReadonlyArray<DiscoveredContextFilesPackage>;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
    if (Option.isNone(entries)) return [] satisfies ReadonlyArray<DiscoveredContextFilesPackage>;
    return yield* Effect.forEach(
      entries.value,
      (entry) =>
        Effect.gen(function* () {
          if (SKIPPED_DIRECTORIES.has(entry))
            return [] satisfies ReadonlyArray<DiscoveredContextFilesPackage>;
          const fullPath = path.join(dir, entry);
          const stat = yield* fs.stat(fullPath).pipe(Effect.option);
          if (Option.isNone(stat) || stat.value.type !== "Directory") {
            return [] satisfies ReadonlyArray<DiscoveredContextFilesPackage>;
          }
          const discovered = yield* tryParseContextFilesPackageInDir(fullPath);
          const current = Option.isSome(discovered) ? [discovered.value] : [];
          const nested = yield* recursiveScan(fullPath, depth + 1);
          return [...current, ...nested];
        }),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((results) => Array.flatten(results)));
  });

export const contextFilesPackagesInDir = (
  searchPath: string,
  options: ContextFilesPackageDiscoveryOptions,
): Effect.Effect<
  ReadonlyArray<DiscoveredContextFilesPackage>,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const direct = yield* tryParseContextFilesPackageInDir(searchPath);
    const directPackages = Option.isSome(direct) ? [direct.value] : [];
    if (directPackages.length > 0 && !options.fullDepth) return directPackages;
    const childPackages = yield* scanChildren(searchPath);
    if ((directPackages.length > 0 || childPackages.length > 0) && !options.fullDepth) {
      return [...directPackages, ...childPackages];
    }
    const recursivePackages = yield* recursiveScan(searchPath, 0);
    const all = [...directPackages, ...childPackages, ...recursivePackages];
    const seen = new Set<string>();
    return all.filter((pkg) => {
      if (seen.has(pkg.manifest.name)) return false;
      seen.add(pkg.manifest.name);
      return true;
    });
  });
