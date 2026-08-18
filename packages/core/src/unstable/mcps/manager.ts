/**
 * MCP server extension manager service.
 *
 * Implements ExtensionManager<McpServerExtensionRef>. Delegates to existing
 * MCP server materialization functions and workspace service methods.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeAppError } from "../app-error/index.js";
import { configuredMcpServersToDiskRefs } from "../extensions/materializable-from-disk.js";
import type { McpServerExtensionRef, RegistryMcpServerRef } from "./refs.js";
import type { McpServerLockEntry } from "../lockfile/index.js";
import type {
  ExtensionManager,
  ExtensionTarget,
  McpServerExtensionTarget,
} from "../workspace/service-interface.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import {
  canReuseInstalledPackage,
  materializeRegistryPackage,
  REGISTRY_EXTENSIONS_DIR,
} from "../extensions/index.js";
import { acceptedRegistryVersionForRef, validateExactResolvedVersion } from "../lockfile/index.js";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import { removeMcpServerFromManifest } from "../agents/mcp-sync.js";
import { configuredRowsByName } from "../workspace/read-model-record-rows.js";
import { isObservedInstalled } from "../workspace/observed-installed.js";
import { protectWorkspacePath } from "../workspace/transaction.js";

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class McpServerManager extends ServiceMap.Service<
  McpServerManager,
  ExtensionManager<McpServerExtensionRef>
>()("@agentxm/client-core/unstable/mcps/manager/McpServerManager") {}

// Build lock entry from registry ref
const buildMcpServerLockEntry = (ref: RegistryMcpServerRef): McpServerLockEntry => ({
  type: "registry",
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: "default",
  publisherBindingId: ref.publisherBindingId,
});

const checkInstalledOnDisk = (
  fsService: FileSystem.FileSystem,
  pathService: Path.Path,
  baseDir: string,
  serverName: string,
) =>
  Effect.gen(function* () {
    const extensionsDir = pathService.join(baseDir, REGISTRY_EXTENSIONS_DIR);
    const extensionsDirExists = yield* fsService
      .exists(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed(false)));
    if (!extensionsDirExists) return false;

    const scopeDirs = yield* fsService
      .readDirectory(extensionsDir)
      .pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));

    const results = yield* Effect.forEach(
      scopeDirs,
      (scopeDir) => {
        if (!scopeDir.startsWith("@")) return Effect.succeed(false);
        const serverPath = pathService.join(extensionsDir, scopeDir, "mcps", serverName);
        return fsService.exists(serverPath).pipe(Effect.catch(() => Effect.succeed(false)));
      },
      { concurrency: "unbounded" },
    );

    return results.some((exists) => exists);
  });

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

export const McpServerManagerLive = Layer.effect(
  McpServerManager,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const httpClient = yield* HttpClient.HttpClient;
    const path = yield* Path.Path;
    const baseDir = ws.baseDir;

    // Build a layer to provide FileSystem + Path to inner effects
    const fsPathLayer = Layer.mergeAll(
      Layer.succeed(FileSystem.FileSystem, fs),
      Layer.succeed(Path.Path, path),
      Layer.succeed(HttpClient.HttpClient, httpClient),
    );

    const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.provide(effect, fsPathLayer);

    const materializeInstall: ExtensionManager<McpServerExtensionRef>["materializeInstall"] =
      Effect.fn("McpServerManager.materializeInstall")(function* ({ ref, force }) {
        if (ref.refType !== "registry") {
          return yield* makeAppError({
            code: "usage",
            detail: `MCP servers materialize from a registry package, not from a ${ref.refType} source`,
            suggestions: [
              {
                description: "Install from the registry",
                cmd: `axm mcps install @owner/mcps/${ref.server.name}`,
              },
            ],
          });
        }

        const registryRef = ref;
        const canonicalPath = path.join(
          baseDir,
          REGISTRY_EXTENSIONS_DIR,
          registryRef.owner,
          "mcps",
          registryRef.name,
        );

        const lockedVersion = acceptedRegistryVersionForRef(
          yield* ws.getLockedMcpServer(registryRef.server.name),
          registryRef,
        );
        const useExisting = yield* provide(
          canReuseInstalledPackage({
            installedPath: canonicalPath,
            force: force === true,
            integrity: registryRef.integrity,
            version: registryRef.version,
            ...(lockedVersion === undefined ? {} : { lockedVersion }),
            existsFailureDetail: (target) => `Failed to check if canonical path exists: ${target}`,
          }),
        );

        if (!useExisting) {
          yield* provide(
            materializeRegistryPackage({
              baseDir,
              destinationPath: canonicalPath,
              sourceLocation: registryRef.source.location,
              owner: registryRef.owner,
              type: "mcp-server",
              name: registryRef.name,
              version: registryRef.version,
              integrity: registryRef.integrity,
              messages: {
                integrityMismatchCode: "internal",
                integrityMismatchDetail: `Integrity mismatch for ${registryRef.name}@${registryRef.version}`,
                tempDirectoryFailureDetail:
                  "Temporary directory for registry install could not be created",
                createDirectoryFailureDetail: (target) =>
                  `Failed to create canonical directory: ${target}`,
                inspectExtractedFailureDetail: "Extracted directory could not be read",
                copyEntryFailureCode: "internal",
                copyEntryFailureDetail: (entry) =>
                  `Failed to copy MCP server package entry: ${entry}`,
              },
            }),
          );
        }
      }, Effect.asVoid);

    const makeMaterializeRemoval = (
      retainCanonical: boolean,
    ): ExtensionManager<McpServerExtensionRef>["materializeUninstall"] =>
      Effect.fn("McpServerManager.materializeRemoval")(function* ({ target }) {
        const configuredAgents = yield* ws.getConfiguredAgents();

        yield* Effect.forEach(
          configuredAgents,
          (agentId) =>
            provide(
              removeMcpServerFromManifest(agentId, {
                workspaceRoot: baseDir,
                scope: ws.scope,
                serverName: target.name,
              }),
            ),
          { concurrency: "unbounded" },
        );

        if (retainCanonical) return;
        const extensionsDir = path.join(baseDir, REGISTRY_EXTENSIONS_DIR);
        const extensionsDirExists = yield* fs.exists(extensionsDir).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "internal",
              detail: `Failed to inspect registry MCP server directory: ${extensionsDir}`,
              cause: error,
            }),
          ),
        );

        if (!extensionsDirExists) return;

        const scopeDirs = yield* fs.readDirectory(extensionsDir).pipe(
          Effect.mapError((error) =>
            makeAppError({
              code: "internal",
              detail: `Failed to list registry MCP server directory: ${extensionsDir}`,
              cause: error,
            }),
          ),
        );

        yield* Effect.forEach(
          scopeDirs,
          (scopeDir) => {
            if (!scopeDir.startsWith("@")) return Effect.void;
            const serverPath = path.join(extensionsDir, scopeDir, "mcps", target.name);
            return protectWorkspacePath(serverPath).pipe(
              Effect.andThen(fs.remove(serverPath, { recursive: true, force: true })),
              Effect.mapError((error) =>
                makeAppError({
                  code: "internal",
                  detail: `Failed to remove registry MCP server source: ${serverPath}`,
                  cause: error,
                }),
              ),
            );
          },
          { concurrency: "unbounded" },
        );
      }, Effect.asVoid);
    const materializeUninstall = makeMaterializeRemoval(false);
    const materializeDeactivate = makeMaterializeRemoval(true);

    return {
      type: "mcp-server",
      runTransaction: ws.runTransaction,
      isInstalled: Effect.fn("McpServerManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: ExtensionTarget;
      }) {
        if (yield* isObservedInstalled(ws, "mcp-server", target.name)) {
          return true;
        }

        return yield* checkInstalledOnDisk(fs, path, baseDir, target.name);
      }),

      materializeInstall,
      getConfiguredSource: Effect.fn("McpServerManager.getConfiguredSource")(function* ({
        target,
      }) {
        const configured = yield* ws.getConfiguredMcpServerEntries();
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),
      listMaterializable: Effect.fn("McpServerManager.listMaterializable")(function* () {
        const configured = yield* ws.records
          .rows("mcp-server")
          .pipe(Effect.map(configuredRowsByName));
        return yield* configuredMcpServersToDiskRefs(
          { fs, path, baseDir, scope: ws.scope },
          configured,
        );
      }),
      materializeUninstall,
      materializeDeactivate,

      upsertSettingsEntry: ({
        ref,
        versionRange,
      }: {
        readonly ref: McpServerExtensionRef;
        readonly versionRange: Option.Option<string>;
      }) => {
        if (ref.refType !== "registry")
          return Effect.void.pipe(Effect.withSpan("McpServerManager.upsertSettingsEntry"));
        const registryRef = ref;
        return validateExactResolvedVersion(
          `mcpServers.${ref.server.name}.resolvedVersion`,
          registryRef.version,
        ).pipe(
          Effect.flatMap(() => {
            const lockEntry = buildMcpServerLockEntry(registryRef);
            return ws.setMcpServer({
              name: ref.server.name,
              lockEntry,
              versionRange,
            });
          }),
          Effect.withSpan("McpServerManager.upsertSettingsEntry"),
        );
      },

      removeSettingsEntry: ({ target }: { readonly target: McpServerExtensionTarget }) =>
        ws
          .removeMcpServerSettings(target.name)
          .pipe(Effect.withSpan("McpServerManager.removeSettingsEntry")),

      upsertLockfileEntry: ({ ref }: { readonly ref: McpServerExtensionRef }) => {
        if (ref.refType !== "registry")
          return ws
            .removeMcpServerLock(ref.server.name)
            .pipe(Effect.withSpan("McpServerManager.upsertLockfileEntry"));
        const registryRef = ref;
        return validateExactResolvedVersion(
          `mcpServers.${ref.server.name}.resolvedVersion`,
          registryRef.version,
        ).pipe(
          Effect.flatMap(() => {
            const lockEntry = buildMcpServerLockEntry(registryRef);
            return ws.setMcpServerLock({
              name: ref.server.name,
              lockEntry,
              versionRange: Option.none(),
            });
          }),
          Effect.withSpan("McpServerManager.upsertLockfileEntry"),
        );
      },

      removeLockfileEntry: ({ target }: { readonly target: McpServerExtensionTarget }) =>
        ws
          .removeMcpServerLock(target.name)
          .pipe(Effect.withSpan("McpServerManager.removeLockfileEntry")),
    } satisfies ExtensionManager<McpServerExtensionRef>;
  }),
);
