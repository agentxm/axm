/**
 * Shared scan defaults for extension discovery.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { AXM_DIR_NAME } from "../workspace/constants.js";

export const EXTENSION_DISCOVERY_SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  AXM_DIR_NAME,
  "dist",
  "build",
  "__pycache__",
]);

export const EXTENSION_DISCOVERY_MAX_DEPTH = 5;

export interface ManifestPackageDiscoveryOptions {
  readonly fullDepth: boolean;
}

export interface DiscoveredManifestPackage<TType extends string, TManifest> {
  readonly type: TType;
  readonly manifest: TManifest;
  readonly location: string;
}

export interface DiscoverManifestPackagesArgs<TType extends string, TManifest> {
  readonly type: TType;
  readonly manifestFilename: string;
  readonly decodeManifest: (value: unknown) => Effect.Effect<TManifest, unknown, never>;
  readonly manifestName: (manifest: TManifest) => string;
}

const tryParseManifestPackageInDir = <const TType extends string, TManifest>(
  args: DiscoverManifestPackagesArgs<TType, TManifest>,
  dir: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifestPath = path.join(dir, args.manifestFilename);
    const exists = yield* fs.exists(manifestPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return Option.none<DiscoveredManifestPackage<TType, TManifest>>();
    const raw = yield* fs.readFileString(manifestPath).pipe(Effect.option);
    if (Option.isNone(raw)) return Option.none<DiscoveredManifestPackage<TType, TManifest>>();
    const json = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(raw.value).pipe(
      Effect.option,
    );
    if (Option.isNone(json)) return Option.none<DiscoveredManifestPackage<TType, TManifest>>();
    const manifest = yield* args.decodeManifest(json.value).pipe(Effect.option);
    if (Option.isNone(manifest)) return Option.none<DiscoveredManifestPackage<TType, TManifest>>();
    return Option.some<DiscoveredManifestPackage<TType, TManifest>>({
      type: args.type,
      manifest: manifest.value,
      location: `file://${dir}`,
    });
  });

const scanChildren = <const TType extends string, TManifest>(
  args: DiscoverManifestPackagesArgs<TType, TManifest>,
  dir: string,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
    if (Option.isNone(entries))
      return [] satisfies ReadonlyArray<DiscoveredManifestPackage<TType, TManifest>>;
    return yield* Effect.forEach(
      entries.value,
      (entry) =>
        Effect.gen(function* () {
          const fullPath = path.join(dir, entry);
          const stat = yield* fs.stat(fullPath).pipe(Effect.option);
          if (Option.isNone(stat) || stat.value.type !== "Directory") {
            return [] satisfies ReadonlyArray<DiscoveredManifestPackage<TType, TManifest>>;
          }
          const discovered = yield* tryParseManifestPackageInDir(args, fullPath);
          return Option.isSome(discovered) ? [discovered.value] : [];
        }),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((results) => Array.flatten(results)));
  });

const recursiveScan = <const TType extends string, TManifest>(
  args: DiscoverManifestPackagesArgs<TType, TManifest>,
  dir: string,
  depth: number,
): Effect.Effect<
  ReadonlyArray<DiscoveredManifestPackage<TType, TManifest>>,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    if (depth > EXTENSION_DISCOVERY_MAX_DEPTH)
      return [] satisfies ReadonlyArray<DiscoveredManifestPackage<TType, TManifest>>;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
    if (Option.isNone(entries))
      return [] satisfies ReadonlyArray<DiscoveredManifestPackage<TType, TManifest>>;
    return yield* Effect.forEach(
      entries.value,
      (entry) =>
        Effect.gen(function* () {
          if (EXTENSION_DISCOVERY_SKIPPED_DIRECTORIES.has(entry))
            return [] satisfies ReadonlyArray<DiscoveredManifestPackage<TType, TManifest>>;
          const fullPath = path.join(dir, entry);
          const stat = yield* fs.stat(fullPath).pipe(Effect.option);
          if (Option.isNone(stat) || stat.value.type !== "Directory") {
            return [] satisfies ReadonlyArray<DiscoveredManifestPackage<TType, TManifest>>;
          }
          const discovered = yield* tryParseManifestPackageInDir(args, fullPath);
          const current = Option.isSome(discovered) ? [discovered.value] : [];
          const nested = yield* recursiveScan(args, fullPath, depth + 1);
          return [...current, ...nested];
        }),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((results) => Array.flatten(results)));
  });

export const discoverManifestPackagesInDir = <const TType extends string, TManifest>(
  args: DiscoverManifestPackagesArgs<TType, TManifest>,
  searchPath: string,
  options: ManifestPackageDiscoveryOptions,
): Effect.Effect<
  ReadonlyArray<DiscoveredManifestPackage<TType, TManifest>>,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const direct = yield* tryParseManifestPackageInDir(args, searchPath);
    const directPackages = Option.isSome(direct) ? [direct.value] : [];
    if (directPackages.length > 0 && !options.fullDepth) return directPackages;
    const childPackages = yield* scanChildren(args, searchPath);
    if ((directPackages.length > 0 || childPackages.length > 0) && !options.fullDepth) {
      return [...directPackages, ...childPackages];
    }
    const recursivePackages = yield* recursiveScan(args, searchPath, 0);
    const all = [...directPackages, ...childPackages, ...recursivePackages];
    const seen = new Set<string>();
    return all.filter((pkg) => {
      const name = args.manifestName(pkg.manifest);
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
  });
