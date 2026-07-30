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
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { makeAppError } from "../app-error/index.js";
import {
  REGISTRY_EXTENSIONS_DIR,
  computePackageContentHash,
  shouldReuseCanonicalInstall,
  toExtensionTypePlural,
  type ExtensionRef,
  type SourceHash,
} from "../extensions/index.js";
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
import { trustedRegistryVersionForRef, validateRefTrustTransition } from "../trust/index.js";
import { isWorkspaceSourceLocator, type RegistrySource } from "../sources/index.js";
import { configuredRowsByName } from "../workspace/read-model-record-rows.js";
import { isObservedInstalled } from "../workspace/observed-installed.js";
import { usableTrustedCanonicalRef } from "../workspace/trusted-canonical-ref.js";
import type { WorkspacePackDependencyResolver } from "./dependency-resolution.js";
import { PACK_MANIFEST_FILENAME, PackManifestSchema } from "./manifest-schema.js";
import { packTrustManifest } from "./trust-manifest.js";

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
  sourceHash: SourceHash,
  workspaceResolver: WorkspacePackDependencyResolver,
): Effect.Effect<SetPackArgs, AppError> =>
  Effect.gen(function* () {
    const resolved = yield* resolvePackDependencies(
      ref,
      sources,
      undefined,
      undefined,
      workspaceResolver,
    );
    const now = yield* DateTime.now;

    return {
      type: "registry",
      owner: ref.owner,
      name: ref.pack.name,
      resolvedVersion: decodeVersionSync(ref.version),
      integrity: Option.getOrElse(ref.integrity, () => ""),
      sourceName: "default",
      publisherBindingId: ref.publisherBindingId,
      sourceHash,
      installedAt: now,
      updatedAt: now,
      resolvedSkills: resolved.resolvedSkills,
      resolvedCommands: resolved.resolvedCommands,
      resolvedMcpServers: resolved.resolvedMcpServers,
      resolvedSubagents: resolved.resolvedSubagents,
      resolvedFiles: resolved.resolvedFiles,
      resolvedRules: resolved.resolvedRules,
      resolvedHooks: resolved.resolvedHooks,
      resolvedKnowledge: resolved.resolvedKnowledge,
      versionRange,
    } satisfies SetPackArgs;
  });

const buildWorkspaceSetPackArgs = (
  ref: WorkspacePackRef,
  versionRange: Option.Option<string>,
  sources: SourceHostProvidersService,
  registrySource: RegistrySource | undefined,
  workspaceResolver: WorkspacePackDependencyResolver,
) =>
  Effect.gen(function* () {
    const resolved = yield* resolvePackDependencies(
      ref,
      sources,
      undefined,
      registrySource,
      workspaceResolver,
    );
    const now = yield* DateTime.now;
    return {
      type: "workspace",
      owner: ref.owner,
      extensionType: "pack",
      name: ref.name,
      version: ref.version,
      sourceHash: ref.sourceHash,
      installedAt: now,
      updatedAt: now,
      resolvedSkills: resolved.resolvedSkills,
      resolvedCommands: resolved.resolvedCommands,
      resolvedMcpServers: resolved.resolvedMcpServers,
      resolvedSubagents: resolved.resolvedSubagents,
      resolvedFiles: resolved.resolvedFiles,
      resolvedRules: resolved.resolvedRules,
      resolvedHooks: resolved.resolvedHooks,
      resolvedKnowledge: resolved.resolvedKnowledge,
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
    const resolveWorkspaceDependency: WorkspacePackDependencyResolver = (args) =>
      Effect.gen(function* () {
        const graph = yield* ws.getDesiredStateGraph();
        const desired = graph.nodes.find(
          (node) =>
            node.type === args.type &&
            node.name === args.name &&
            node.identity ===
              `workspace:${args.owner}/${toExtensionTypePlural(args.type)}/${args.name}` &&
            node.origins.some(
              (origin) => origin.type === "settings" && isWorkspaceSourceLocator(origin.source),
            ),
        );
        if (desired === undefined) return Option.none<ExtensionRef>();
        const resolved = yield* provide(
          usableTrustedCanonicalRef({
            workspace: ws,
            type: args.type,
            name: args.name,
          }),
        );
        if (Option.isNone(resolved)) {
          return yield* makeAppError({
            code: "conflict",
            detail: `Configured workspace dependency ${args.owner}/${args.type === "mcp-server" ? "mcps" : `${args.type}s`}/${args.name} is not usable`,
          });
        }
        return Option.some(resolved.value);
      });
    const refreshWorkspacePackState = (ref: WorkspacePackRef) =>
      Effect.gen(function* () {
        const manifestPath = path.join(ref.location, PACK_MANIFEST_FILENAME);
        const raw = yield* fs.readFileString(manifestPath).pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: "validation",
              detail: `Failed to read workspace pack manifest at ${manifestPath}`,
              cause,
            }),
          ),
        );
        const json = yield* Effect.try({
          try: (): unknown => JSON.parse(raw),
          catch: (cause) =>
            makeAppError({
              code: "validation",
              detail: `Failed to parse workspace pack manifest at ${manifestPath}`,
              cause,
            }),
        });
        const manifest = yield* Schema.decodeUnknownEffect(PackManifestSchema)(json).pipe(
          Effect.mapError((cause) =>
            makeAppError({
              code: "validation",
              detail: `Invalid workspace pack manifest at ${manifestPath}`,
              cause,
            }),
          ),
        );
        yield* ws.refreshPackContentIdentity(ref.name, ref.sourceHash, packTrustManifest(manifest));
      });
    const materializeInstall: ExtensionManager<PackRef>["materializeInstall"] = Effect.fn(
      "PackManager.materializeInstall",
    )(function* ({ ref, force }: { readonly ref: PackRef; readonly force?: boolean }) {
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
      const lockedVersion = trustedRegistryVersionForRef(yield* ws.getTrustState(), ref);
      if (
        shouldReuseCanonicalInstall({
          canonicalExists,
          force: force === true,
          hasIntegrity: Option.isSome(ref.integrity),
          refVersion: ref.refType === "registry" ? ref.version : undefined,
          lockedVersion,
        })
      ) {
        return;
      }

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
      validateTrustTransition: (args) =>
        ws
          .getTrustState()
          .pipe(Effect.flatMap((state) => validateRefTrustTransition(state, args.ref, args))),
      isInstalled: Effect.fn("PackManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: PackExtensionTarget;
      }) {
        if (yield* isObservedInstalled(ws, "pack", target.name)) {
          return true;
        }

        return yield* checkInstalledOnDisk(fs, path, baseDir, target.name);
      }),
      materializeInstall,
      getConfiguredSource: Effect.fn("PackManager.getConfiguredSource")(function* ({ target }) {
        const configured = yield* ws.getConfiguredPackEntries();
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),
      listMaterializable: Effect.fn("PackManager.listMaterializable")(function* () {
        const configured = yield* ws.records.rows("pack").pipe(Effect.map(configuredRowsByName));
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
          const packDir = computePackPaths(
            path.join,
            baseDir,
            ref.owner,
            ref.pack.name,
          ).canonicalPath;
          const sourceHash = yield* provide(computePackageContentHash(packDir));
          const args = yield* buildSetPackArgs(
            ref,
            versionRange,
            sources,
            sourceHash,
            resolveWorkspaceDependency,
          );
          return yield* ws.setPack(args);
        }

        if (Object.keys(ref.pack.dependencies).length === 0) {
          const now = yield* DateTime.now;
          yield* ws.setPack({
            type: "workspace",
            owner: ref.owner,
            extensionType: "pack",
            name: ref.name,
            version: ref.version,
            sourceHash: ref.sourceHash,
            installedAt: now,
            updatedAt: now,
            resolvedSkills: {},
            resolvedCommands: {},
            resolvedMcpServers: {},
            resolvedSubagents: {},
            resolvedFiles: {},
            resolvedRules: {},
            resolvedHooks: {},
            resolvedKnowledge: {},
            versionRange,
          });
          return yield* refreshWorkspacePackState(ref);
        }

        const configured = yield* ws.getConfiguredSourceByName("default");
        const registrySource =
          Option.isSome(configured) && configured.value.type === "registry"
            ? {
                type: "registry" as const,
                location: configured.value.location,
                owner: Option.none(),
              }
            : undefined;
        const args = yield* buildWorkspaceSetPackArgs(
          ref,
          versionRange,
          sources,
          registrySource,
          resolveWorkspaceDependency,
        );
        yield* ws.setPack(args);
        return yield* refreshWorkspacePackState(ref);
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
      removeTrustEntry: ({ target }: { readonly target: PackExtensionTarget }) =>
        ws.removeTrustRecord("pack", target.name),
    } satisfies ExtensionManager<PackRef>;
  }),
);
