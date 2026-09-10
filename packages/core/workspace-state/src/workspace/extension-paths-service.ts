/**
 * Extension paths: where the selected scope keeps a skill's or Pack's
 * canonical content. Skill directories for Registry sources follow the
 * immutable Registry name, resolved from the accepted lock entry, then the
 * configured source, then the name given; every other source uses the shared
 * acquired-extensions directory.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";

import { parseSourceQualifiedRegistrySourcePatternParts } from "@agentxm/extension-model/unstable/extensions";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { LockedSkillMissing } from "./errors.js";
import { sanitizeName } from "./extension-name.js";
import { LockfileReader, type LockfileReaderService } from "./lockfile-reader.js";
import { WorkspaceLocation, type WorkspaceLocationService } from "./location.js";
import { computePackPathsForLayout } from "./pack-paths.js";
import type {
  PackDirPath,
  SkillDirPaths,
  SkillPathSource,
  WorkspaceStateReadFailure,
} from "./service-interface.js";
import { SettingsReader, type SettingsReaderService } from "./settings-reader.js";
import { computeSkillPathsForLayout } from "./skill-paths.js";

export interface ExtensionPathsService {
  /** Skill directory paths. Without a source, the accepted lock entry decides the layout. */
  readonly skillDir: (
    name: string,
    source?: SkillPathSource,
  ) => Effect.Effect<
    SkillDirPaths,
    WorkspaceStateReadFailure | LockedSkillMissing,
    FileSystem.FileSystem | Path.Path
  >;
  /** The Pack directory path. Packs are always registry-sourced. */
  readonly packDir: (
    name: string,
    owner: Handle,
    sourceName: string,
  ) => Effect.Effect<PackDirPath, never, Path.Path>;
}

export class ExtensionPaths extends ServiceMap.Service<ExtensionPaths, ExtensionPathsService>()(
  "@agentxm/workspace-state/ExtensionPaths",
) {}

export const makeExtensionPaths = (
  location: WorkspaceLocationService,
  settings: SettingsReaderService,
  lockfile: LockfileReaderService,
): ExtensionPathsService => {
  /**
   * Resolve the immutable registry name for a skill's directory: the lockfile
   * first, then the configured source string, then the given name (correct
   * for fresh installs).
   */
  const resolveRegistryDirName = (name: string) =>
    Effect.gen(function* () {
      const lockEntry = yield* lockfile.entry("skill", name);
      if (Option.isSome(lockEntry) && lockEntry.value.type === "registry") {
        return lockEntry.value.name;
      }
      const entry = (yield* settings.entries("skill"))[name];
      if (entry !== undefined) {
        const parsed = parseSourceQualifiedRegistrySourcePatternParts(entry.source);
        if (parsed?.name !== undefined) return parsed.name;
      }
      return name;
    });

  return {
    skillDir: (name, source) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const layout = yield* Ref.get(location.layout);
        if (source !== undefined) {
          const dirName =
            source.refType === "registry" ? yield* resolveRegistryDirName(name) : name;
          return computeSkillPathsForLayout(path.join, layout, source, sanitizeName(dirName));
        }
        const lockEntry = yield* lockfile.entry("skill", name);
        if (Option.isNone(lockEntry)) {
          return yield* new LockedSkillMissing({ name });
        }
        const entry = lockEntry.value;
        const entrySource: SkillPathSource = (() => {
          switch (entry.type) {
            case "registry":
              return {
                refType: "registry",
                owner: entry.owner,
                source: {
                  type: "registry",
                  name: entry.sourceName,
                  location: entry.endpoint,
                  owner: Option.some(entry.owner),
                },
              };
            case "local":
              return {
                refType: "local",
                source: { type: "local", path: entry.path },
                sourcePath: entry.path,
              };
            case "github":
            case "gitlab":
            case "bitbucket":
              return {
                refType: "git-hosted",
                source: {
                  type: entry.type,
                  name: entry.sourceName,
                  url: entry.endpoint,
                  owner: entry.owner,
                  repo: entry.repo,
                  ref: Option.fromUndefinedOr(entry.ref),
                  subPath: Option.fromUndefinedOr(entry.path),
                },
                ...(entry.path === undefined ? {} : { sourcePath: entry.path }),
              };
            case "azurerepos":
              return {
                refType: "git-hosted",
                source: {
                  type: "azurerepos",
                  name: entry.sourceName,
                  url: entry.endpoint,
                  organization: entry.organization,
                  project: entry.project,
                  repo: entry.repo,
                  ref: Option.fromUndefinedOr(entry.ref),
                  subPath: Option.fromUndefinedOr(entry.path),
                },
                ...(entry.path === undefined ? {} : { sourcePath: entry.path }),
              };
            case "git":
              return {
                refType: "git-hosted",
                source: {
                  type: "git",
                  url: new URL(entry.url),
                  ref: Option.fromUndefinedOr(entry.ref),
                },
                ...(entry.path === undefined ? {} : { sourcePath: entry.path }),
              };
          }
        })();
        const dirName = entry.type === "registry" ? entry.name : entry.packageName;
        return computeSkillPathsForLayout(path.join, layout, entrySource, sanitizeName(dirName));
      }),
    packDir: (name, owner, sourceName) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const layout = yield* Ref.get(location.layout);
        return computePackPathsForLayout(path.join, layout, sourceName, owner, name);
      }),
  };
};

export const ExtensionPathsLive: Layer.Layer<
  ExtensionPaths,
  never,
  WorkspaceLocation | SettingsReader | LockfileReader
> = Layer.effect(
  ExtensionPaths,
  Effect.gen(function* () {
    return makeExtensionPaths(
      yield* WorkspaceLocation,
      yield* SettingsReader,
      yield* LockfileReader,
    );
  }),
);
