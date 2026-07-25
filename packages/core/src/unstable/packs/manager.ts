/**
 * Pack manager service.
 *
 * Implements ExtensionManager<PackRef>. Delegates to existing
 * pack materialization functions and workspace service methods.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeAppError } from "../app-error/index.js";
import { REGISTRY_EXTENSIONS_DIR } from "../extensions/index.js";
import { configuredPacksToDiskRefs } from "../extensions/materializable-from-disk.js";
import type { PackRef, RegistryPackRef, WorkspacePackRef } from "./refs.js";
import {
  SourceHostProviders,
  type SourceHostProvidersService,
} from "../source-resolution/index.js";
import type { ExtensionManager, PackExtensionTarget } from "../workspace/service-interface.js";
import { WorkspaceMutations, type SetPackArgs } from "../workspace/service-interface.js";
import { copyExtensionDirectory } from "../extensions/utils.js";
import { sanitizeName } from "../extensions/utils.js";
import { computePackPaths } from "./paths.js";
import { removeIfExists } from "../utils/index.js";
import { validateExactResolvedVersion } from "../lockfile/index.js";
import type { AppError } from "../app-error/index.js";
import { resolvePackDependencies } from "./dependency-resolution.js";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import type { RegistrySource } from "../sources/index.js";

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class PackManager extends ServiceMap.Service<PackManager, ExtensionManager<PackRef>>()(
  "@agentxm/client-core/unstable/packs/manager/PackManager",
) {}

// Build pack SetPackArgs from a registry ref
const buildSetPackArgs = (
  ref: RegistryPackRef,
  versionRange: Option.Option<string>,
  sources: SourceHostProvidersService,
): Effect.Effect<SetPackArgs, AppError> =>
  Effect.gen(function* () {
    const resolved = yield* resolvePackDependencies(ref, sources);

    return {
      type: "registry",
      owner: ref.owner,
      name: ref.pack.name,
      resolvedVersion: decodeVersionSync(ref.version),
      integrity: Option.getOrElse(ref.integrity, () => ""),
      sourceName: "default",
      publisherBindingId: ref.publisherBindingId,
      installedAt: new Date(),
      updatedAt: new Date(),
      resolvedSkills: resolved.resolvedSkills,
      resolvedCommands: resolved.resolvedCommands,
      resolvedMcpServers: resolved.resolvedMcpServers,
      resolvedSubagents: resolved.resolvedSubagents,
      resolvedFiles: resolved.resolvedFiles,
      resolvedRules: resolved.resolvedRules,
      resolvedHooks: resolved.resolvedHooks,
      versionRange,
    } satisfies SetPackArgs;
  });

const buildWorkspaceSetPackArgs = (
  ref: WorkspacePackRef,
  versionRange: Option.Option<string>,
  sources: SourceHostProvidersService,
  registrySource: RegistrySource,
) =>
  Effect.gen(function* () {
    const resolved = yield* resolvePackDependencies(ref, sources, undefined, registrySource);
    return {
      type: "workspace",
      owner: ref.owner,
      extensionType: "pack",
      name: ref.name,
      version: ref.version,
      sourceHash: ref.sourceHash,
      installedAt: new Date(),
      updatedAt: new Date(),
      resolvedSkills: resolved.resolvedSkills,
      resolvedCommands: resolved.resolvedCommands,
      resolvedMcpServers: resolved.resolvedMcpServers,
      resolvedSubagents: resolved.resolvedSubagents,
      resolvedFiles: resolved.resolvedFiles,
      resolvedRules: resolved.resolvedRules,
      resolvedHooks: resolved.resolvedHooks,
      versionRange,
    } satisfies SetPackArgs;
  });

const checkInstalledOnDisk = (
  fsService: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  packName: string,
) =>
  Effect.gen(function* () {
    const extensionsDir = pathService.join(baseDir, REGISTRY_EXTENSIONS_DIR);
    const extensionsDirExists = yield* fsService
      .exists(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed(false)));
    if (!extensionsDirExists) return false;

    const candidateNames = [packName];
    const sanitizedName = sanitizeName(packName);
    if (sanitizedName !== packName) {
      candidateNames.push(sanitizedName);
    }

    const scopeDirs = yield* fsService
      .readDirectory(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));

    const results = yield* Effect.forEach(
      scopeDirs,
      (scopeDir) => {
        if (!scopeDir.startsWith("@")) return Effect.succeed(false);
        return Effect.forEach(
          candidateNames,
          (candidateName) => {
            const packPath = pathService.join(extensionsDir, scopeDir, "packs", candidateName);
            return fsService.exists(packPath).pipe(Effect.catch(() => Effect.succeed(false)));
          },
          { concurrency: "unbounded" },
        ).pipe(Effect.map((candidates) => candidates.some((exists) => exists)));
      },
      { concurrency: "unbounded" },
    );

    return results.some((exists) => exists);
  });

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

export const PackManagerLive = Layer.effect(
  PackManager,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sources = yield* SourceHostProviders;
    const baseDir = ws.baseDir;

    // Build a layer to provide FileSystem + Path to inner effects
    const fsPathLayer = Layer.merge(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
    );

    const provide = <A, E>(
      effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
    ): Effect.Effect<A, E, never> => Effect.provide(effect, fsPathLayer);
    const materializeInstall: ExtensionManager<PackRef>["materializeInstall"] = Effect.fn(
      "PackManager.materializeInstall",
    )(function* ({ ref }: { readonly ref: PackRef }) {
      if (ref.refType === "registry") {
        yield* validateExactResolvedVersion(`packs.${ref.pack.name}.resolvedVersion`, ref.version);
      }

      const packDir = computePackPaths(path.join, baseDir, ref.owner, ref.pack.name).canonicalPath;
      const canonicalExists = yield* fs.exists(packDir).pipe(Effect.orElseSucceed(() => false));
      if (ref.refType === "workspace") {
        if (ref.scope !== ws.scope || path.resolve(ref.location) !== path.resolve(packDir)) {
          return yield* makeAppError({
            code: "validation",
            detail: `Invalid workspace pack source location: ${ref.location}`,
          });
        }
        if (!canonicalExists) {
          return yield* makeAppError({
            code: "validation",
            detail: `Workspace pack package is missing: ${packDir}`,
          });
        }
        return;
      }
      if (Option.isNone(ref.integrity) && canonicalExists) return;

      yield* Effect.scoped(
        Effect.gen(function* () {
          const fetched = yield* sources.fetch(ref).pipe(
            Effect.mapError((e: Error) =>
              makeAppError({
                code: "network",
                detail: `Failed to fetch pack archive: ${e.message}`,
                cause: e,
              }),
            ),
          );
          yield* provide(
            copyExtensionDirectory(fetched.directory, packDir).pipe(
              Effect.mapError((e) =>
                makeAppError({
                  code: "internal",
                  detail: `Failed to extract pack to ${packDir}`,
                  cause: e,
                }),
              ),
            ),
          );
        }),
      );
    });
    const materializeUninstall: ExtensionManager<PackRef>["materializeUninstall"] = Effect.fn(
      "PackManager.materializeUninstall",
    )(function* ({ target, preserveSource }) {
      const packDir = computePackPaths(path.join, baseDir, target.owner, target.name).canonicalPath;
      if (preserveSource !== true) yield* removeIfExists(fs, packDir);
    });

    return {
      type: "pack",
      isInstalled: Effect.fn("PackManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: PackExtensionTarget;
      }) {
        const installedPacks = yield* ws.records.getInstalledPacks();
        if (target.name in installedPacks) {
          return true;
        }

        return yield* checkInstalledOnDisk(fs, path, baseDir, target.name);
      }),
      materializeInstall,
      getConfiguredSource: Effect.fn("PackManager.getConfiguredSource")(function* ({ target }) {
        const configured = yield* ws.records.getConfiguredPacks();
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),
      listMaterializable: Effect.fn("PackManager.listMaterializable")(function* () {
        const configured = yield* ws.records.getConfiguredPacks();
        return yield* configuredPacksToDiskRefs({ fs, path, baseDir, scope: ws.scope }, configured);
      }),
      materializeUninstall,

      upsertSettingsEntry: Effect.fn("PackManager.upsertSettingsEntry")(function* ({
        ref,
        versionRange,
      }: {
        readonly ref: PackRef;
        readonly versionRange: Option.Option<string>;
      }) {
        if (ref.refType !== "workspace") {
          const args = yield* buildSetPackArgs(ref, versionRange, sources);
          return yield* ws.setPack(args);
        }

        if (Object.keys(ref.pack.dependencies).length === 0) {
          return yield* ws.setPack({
            type: "workspace",
            owner: ref.owner,
            extensionType: "pack",
            name: ref.name,
            version: ref.version,
            sourceHash: ref.sourceHash,
            installedAt: new Date(),
            updatedAt: new Date(),
            resolvedSkills: {},
            resolvedCommands: {},
            resolvedMcpServers: {},
            resolvedSubagents: {},
            resolvedFiles: {},
            resolvedRules: {},
            resolvedHooks: {},
            versionRange,
          });
        }

        const configured = yield* ws.getConfiguredSourceByName("default");
        if (Option.isNone(configured) || configured.value.type !== "registry") {
          return yield* makeAppError({
            code: "not_found",
            detail: 'Workspace pack dependencies require the "default" registry source',
          });
        }
        const args = yield* buildWorkspaceSetPackArgs(ref, versionRange, sources, {
          type: "registry",
          location: configured.value.location,
          owner: Option.none(),
        });
        return yield* ws.setPack(args);
      }),

      removeSettingsEntry: ({ target }: { readonly target: PackExtensionTarget }) =>
        ws.removePackSettings(target.name).pipe(Effect.withSpan("PackManager.removeSettingsEntry")),

      // Pack lockfile entries are written by upsertSettingsEntry via buildSetPackArgs;
      // this method satisfies the ExtensionManager interface but performs no additional work.
      upsertLockfileEntry: ({ ref }: { readonly ref: PackRef }) => {
        void ref;
        return Effect.void.pipe(Effect.withSpan("PackManager.upsertLockfileEntry"));
      },

      removeLockfileEntry: ({ target }: { readonly target: PackExtensionTarget }) =>
        ws.removePackLock(target.name).pipe(Effect.withSpan("PackManager.removeLockfileEntry")),
    } satisfies ExtensionManager<PackRef>;
  }),
);
