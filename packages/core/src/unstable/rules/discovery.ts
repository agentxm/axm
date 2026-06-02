/**
 * Rule package discovery for local and git sources.
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
  RULE_MANIFEST_FILENAME,
  RuleManifestSchema,
  type RuleManifest,
} from "./manifest-schema.js";

export interface DiscoveredRulePackage {
  readonly type: "rule";
  readonly manifest: RuleManifest;
  readonly location: string;
}

export interface RulePackageDiscoveryOptions {
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

const tryParseRulePackageInDir = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifestPath = path.join(dir, RULE_MANIFEST_FILENAME);
    const exists = yield* fs.exists(manifestPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return Option.none<DiscoveredRulePackage>();
    const raw = yield* fs.readFileString(manifestPath).pipe(Effect.option);
    if (Option.isNone(raw)) return Option.none<DiscoveredRulePackage>();
    const json = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(raw.value).pipe(
      Effect.option,
    );
    if (Option.isNone(json)) return Option.none<DiscoveredRulePackage>();
    const manifest = yield* Schema.decodeUnknownEffect(RuleManifestSchema)(json.value).pipe(
      Effect.option,
    );
    if (Option.isNone(manifest)) return Option.none<DiscoveredRulePackage>();
    return Option.some({
      type: "rule" as const,
      manifest: manifest.value,
      location: `file://${dir}`,
    });
  });

const scanChildren = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
    if (Option.isNone(entries)) return [] satisfies ReadonlyArray<DiscoveredRulePackage>;
    return yield* Effect.forEach(
      entries.value,
      (entry) =>
        Effect.gen(function* () {
          const fullPath = path.join(dir, entry);
          const stat = yield* fs.stat(fullPath).pipe(Effect.option);
          if (Option.isNone(stat) || stat.value.type !== "Directory") {
            return [] satisfies ReadonlyArray<DiscoveredRulePackage>;
          }
          const discovered = yield* tryParseRulePackageInDir(fullPath);
          return Option.isSome(discovered) ? [discovered.value] : [];
        }),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((results) => Array.flatten(results)));
  });

const recursiveScan = (
  dir: string,
  depth: number,
): Effect.Effect<ReadonlyArray<DiscoveredRulePackage>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    if (depth > MAX_DEPTH) return [] satisfies ReadonlyArray<DiscoveredRulePackage>;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(dir).pipe(Effect.option);
    if (Option.isNone(entries)) return [] satisfies ReadonlyArray<DiscoveredRulePackage>;
    return yield* Effect.forEach(
      entries.value,
      (entry) =>
        Effect.gen(function* () {
          if (SKIPPED_DIRECTORIES.has(entry))
            return [] satisfies ReadonlyArray<DiscoveredRulePackage>;
          const fullPath = path.join(dir, entry);
          const stat = yield* fs.stat(fullPath).pipe(Effect.option);
          if (Option.isNone(stat) || stat.value.type !== "Directory") {
            return [] satisfies ReadonlyArray<DiscoveredRulePackage>;
          }
          const discovered = yield* tryParseRulePackageInDir(fullPath);
          const current = Option.isSome(discovered) ? [discovered.value] : [];
          const nested = yield* recursiveScan(fullPath, depth + 1);
          return [...current, ...nested];
        }),
      { concurrency: "unbounded" },
    ).pipe(Effect.map((results) => Array.flatten(results)));
  });

export const rulePackagesInDir = (
  searchPath: string,
  options: RulePackageDiscoveryOptions,
): Effect.Effect<ReadonlyArray<DiscoveredRulePackage>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const direct = yield* tryParseRulePackageInDir(searchPath);
    const directRules = Option.isSome(direct) ? [direct.value] : [];
    if (directRules.length > 0 && !options.fullDepth) return directRules;
    const childRules = yield* scanChildren(searchPath);
    if ((directRules.length > 0 || childRules.length > 0) && !options.fullDepth) {
      return [...directRules, ...childRules];
    }
    const recursiveRules = yield* recursiveScan(searchPath, 0);
    const all = [...directRules, ...childRules, ...recursiveRules];
    const seen = new Set<string>();
    return all.filter((rule) => {
      if (seen.has(rule.manifest.name)) return false;
      seen.add(rule.manifest.name);
      return true;
    });
  });
