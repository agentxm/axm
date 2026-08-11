/**
 * Shared manifest package discovery for local and git sources.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { DISCOVERY_MAX_DEPTH, DISCOVERY_SKIPPED_DIRECTORIES } from "./discovery-walk.js";

interface ManifestWithName {
  readonly name: string;
}

export interface DiscoveredManifestPackage<Type extends string, Manifest extends ManifestWithName> {
  readonly type: Type;
  readonly manifest: Manifest;
  readonly location: string;
}

export interface ManifestPackageDiscoveryOptions {
  readonly fullDepth: boolean;
}

export interface ManifestPackageDiscoveryConfig<
  Type extends string,
  Manifest extends ManifestWithName,
> {
  readonly type: Type;
  readonly manifestFilename: string;
  readonly manifestSchema: Schema.Decoder<Manifest>;
}

export const discoverManifestPackagesInDir =
  <Type extends string, Manifest extends ManifestWithName>(
    config: ManifestPackageDiscoveryConfig<Type, Manifest>,
  ) =>
  (
    searchPath: string,
    options: ManifestPackageDiscoveryOptions,
  ): Effect.Effect<
    ReadonlyArray<DiscoveredManifestPackage<Type, Manifest>>,
    never,
    FileSystem.FileSystem | Path.Path
  > => {
    const tryParsePackageInDir = (
      dir: string,
    ): Effect.Effect<
      Option.Option<DiscoveredManifestPackage<Type, Manifest>>,
      never,
      FileSystem.FileSystem | Path.Path
    > =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const manifestPath = path.join(dir, config.manifestFilename);
        const exists = yield* fs
          .exists(manifestPath)
          .pipe(Effect.catch(() => Effect.succeed(false)));
        if (!exists) return Option.none<DiscoveredManifestPackage<Type, Manifest>>();
        const raw = yield* fs.readFileString(manifestPath).pipe(Effect.option);
        if (Option.isNone(raw)) return Option.none<DiscoveredManifestPackage<Type, Manifest>>();
        const json = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(
          raw.value,
        ).pipe(Effect.option);
        if (Option.isNone(json)) return Option.none<DiscoveredManifestPackage<Type, Manifest>>();
        const manifest = yield* Schema.decodeUnknownEffect(config.manifestSchema)(json.value).pipe(
          Effect.option,
        );
        if (Option.isNone(manifest))
          return Option.none<DiscoveredManifestPackage<Type, Manifest>>();
        return Option.some({
          type: config.type,
          manifest: manifest.value,
          location: `file://${dir}`,
        });
      });

    const scanChildren = (
      dir: string,
    ): Effect.Effect<
      ReadonlyArray<DiscoveredManifestPackage<Type, Manifest>>,
      never,
      FileSystem.FileSystem | Path.Path
    > =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
        if (Option.isNone(entries))
          return [] satisfies ReadonlyArray<DiscoveredManifestPackage<Type, Manifest>>;
        return yield* Effect.forEach(
          entries.value,
          (entry) =>
            Effect.gen(function* () {
              const fullPath = path.join(dir, entry);
              const stat = yield* fs.stat(fullPath).pipe(Effect.option);
              if (Option.isNone(stat) || stat.value.type !== "Directory") {
                return [] satisfies ReadonlyArray<DiscoveredManifestPackage<Type, Manifest>>;
              }
              const discovered = yield* tryParsePackageInDir(fullPath);
              return Option.isSome(discovered) ? [discovered.value] : [];
            }),
          { concurrency: "unbounded" },
        ).pipe(Effect.map((results) => Array.flatten(results)));
      });

    const recursiveScan = (
      dir: string,
      depth: number,
    ): Effect.Effect<
      ReadonlyArray<DiscoveredManifestPackage<Type, Manifest>>,
      never,
      FileSystem.FileSystem | Path.Path
    > =>
      Effect.gen(function* () {
        if (depth > DISCOVERY_MAX_DEPTH)
          return [] satisfies ReadonlyArray<DiscoveredManifestPackage<Type, Manifest>>;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
        if (Option.isNone(entries))
          return [] satisfies ReadonlyArray<DiscoveredManifestPackage<Type, Manifest>>;
        return yield* Effect.forEach(
          entries.value,
          (entry) =>
            Effect.gen(function* () {
              if (DISCOVERY_SKIPPED_DIRECTORIES.has(entry))
                return [] satisfies ReadonlyArray<DiscoveredManifestPackage<Type, Manifest>>;
              const fullPath = path.join(dir, entry);
              const stat = yield* fs.stat(fullPath).pipe(Effect.option);
              if (Option.isNone(stat) || stat.value.type !== "Directory") {
                return [] satisfies ReadonlyArray<DiscoveredManifestPackage<Type, Manifest>>;
              }
              const discovered = yield* tryParsePackageInDir(fullPath);
              const current = Option.isSome(discovered) ? [discovered.value] : [];
              const nested = yield* recursiveScan(fullPath, depth + 1);
              return [...current, ...nested];
            }),
          { concurrency: "unbounded" },
        ).pipe(Effect.map((results) => Array.flatten(results)));
      });

    return Effect.gen(function* () {
      const direct = yield* tryParsePackageInDir(searchPath);
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
  };
