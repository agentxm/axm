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
import type { McpServerExtensionRef, RegistryMcpServerRef } from "../workspace/refs/mcp-server.js";
import type { McpServerLockEntry } from "../lockfile/index.js";
import type { ExtensionManager } from "../extension-workspace/extension-manager.js";
import type { ExtensionTarget, McpServerExtensionTarget } from "../workspace/service-interface.js";
import { WorkspaceMutations } from "../workspace/service-interface.js";
import {
  canReuseInstalledPackage,
  materializeRegistryPackageWithTreeIntegrity,
} from "../extensions/index.js";
import { computeExtensionPathsForLayout } from "../workspace/extension-paths.js";
import { acceptedRegistryVersionForRef, validateExactResolvedVersion } from "../lockfile/index.js";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { removeMcpServerFromManifest } from "../agents/mcp-sync.js";
import { configuredRowsByName } from "../workspace/read-model-record-rows.js";
import { isObservedInstalled } from "../workspace/observed-installed.js";
import {
  acceptedCanonicalObservation,
  prepareAcceptedCanonicalTransition,
  removableAcceptedCanonicalPath,
} from "../workspace/accepted-canonical-ref.js";
import { protectWorkspacePath } from "../workspace/transaction.js";
import { applyProjectionPlans, planSingletonProjection } from "../projection/planning.js";
import {
  computeMaterializedTreeIntegrity,
  type TreeIntegrity,
} from "../workspace/materialized-tree.js";
import { toAppError } from "../app-error/conversions.js";

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class McpServerManager extends ServiceMap.Service<
  McpServerManager,
  ExtensionManager<McpServerExtensionRef>
>()("@agentxm/extension-management/unstable/mcps/manager/McpServerManager") {}

// Build lock entry from registry ref
const buildMcpServerLockEntry = (
  ref: RegistryMcpServerRef,
  treeIntegrity: TreeIntegrity,
): McpServerLockEntry => ({
  type: "registry",
  sourceType: "registry",
  packageFormat: "agentxm",
  endpoint: ref.source.location,
  extensionType: "mcp-server",
  workspaceName: ref.server.name,
  owner: ref.owner,
  name: ref.name,
  resolvedVersion: decodeVersionSync(ref.version),
  integrity: Option.getOrElse(ref.integrity, () => ""),
  sourceName: ref.source.name,
  publisherBindingId: ref.publisherBindingId,
  treeIntegrity,
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
    const lastTreeIntegrities = new Map<string, TreeIntegrity>();

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
        const canonicalPath = computeExtensionPathsForLayout(
          path.join,
          ws.layout,
          registryRef,
          "mcps",
          registryRef.name,
        ).canonicalPath;

        const lockedEntry = yield* ws
          .getLockedMcpServer(registryRef.server.name)
          .pipe(Effect.mapError(toAppError));
        const lockedVersion = acceptedRegistryVersionForRef(lockedEntry, registryRef);
        const useExisting = yield* provide(
          canReuseInstalledPackage({
            installedPath: canonicalPath,
            force: force === true,
            refVersion: registryRef.version,
            hasIntegrity: Option.isSome(registryRef.integrity),
            ...(lockedVersion === undefined ? {} : { lockedVersion }),
            existsFailureDetail: (target) => `Failed to check if canonical path exists: ${target}`,
          }),
        );

        if (useExisting && Option.isSome(lockedEntry)) {
          const observedTree = yield* provide(computeMaterializedTreeIntegrity(canonicalPath));
          if (observedTree === lockedEntry.value.treeIntegrity) {
            lastTreeIntegrities.set(registryRef.server.name, lockedEntry.value.treeIntegrity);
            return;
          }
        }
        const materialized = yield* provide(
          materializeRegistryPackageWithTreeIntegrity({
            baseDir,
            destinationPath: canonicalPath,
            sourceLocation: registryRef.source.location,
            owner: registryRef.owner,
            type: "mcp-server",
            name: registryRef.name,
            version: registryRef.version,
            integrity: registryRef.integrity,
            messages: {
              integrityMismatchDetail: `Integrity mismatch for ${registryRef.name}@${registryRef.version}`,
            },
          }),
        );
        lastTreeIntegrities.set(registryRef.server.name, materialized.treeIntegrity);
      }, Effect.asVoid);

    const makeMaterializeRemoval = (
      retainCanonical: boolean,
    ): ExtensionManager<McpServerExtensionRef>["materializeUninstall"] =>
      Effect.fn("McpServerManager.materializeRemoval")(function* ({ target }) {
        const configuredAgents = yield* ws.getConfiguredAgents().pipe(Effect.mapError(toAppError));

        yield* applyProjectionPlans(
          configuredAgents.map((agentId) =>
            planSingletonProjection({
              unitId: "mcp-server:native-config-entry",
              // Multiple configured agents may share one native config file.
              targetFile: `mcp:${target.name}:configured-agents`,
              contributor: target,
              adapter: {
                observe: () =>
                  Effect.succeed({
                    unitId: "mcp-server:native-config-entry",
                    path: `${agentId}:${target.name}`,
                    present: true,
                    current: false,
                    expectedContributors: [],
                    observedContributors: [target.name],
                  }),
                apply: () =>
                  provide(
                    removeMcpServerFromManifest(agentId, {
                      workspaceRoot: baseDir,
                      scope: ws.scope,
                      serverName: target.name,
                    }),
                  ).pipe(Effect.asVoid),
              },
            }),
          ),
        );

        if (retainCanonical) return;
        const canonical = yield* provide(
          acceptedCanonicalObservation({
            workspace: ws,
            type: "mcp-server",
            name: target.name,
          }),
        );
        const serverPath = removableAcceptedCanonicalPath(canonical);
        if (Option.isSome(serverPath)) {
          yield* protectWorkspacePath(serverPath.value).pipe(Effect.mapError(toAppError));
          yield* fs.remove(serverPath.value, { recursive: true, force: true }).pipe(
            Effect.mapError((cause) =>
              makeAppError({
                code: "internal",
                detail: `Failed to remove MCP server package: ${serverPath.value}`,
                cause,
              }),
            ),
          );
        }
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
        return yield* isObservedInstalled(ws, "mcp-server", target.name).pipe(
          Effect.mapError(toAppError),
        );
      }),

      materializeInstall,
      prepareSourceTransition: ({ ref }) =>
        provide(
          prepareAcceptedCanonicalTransition({
            workspace: ws,
            type: "mcp-server",
            name: ref.server.name,
            ref,
          }),
        ),
      getConfiguredSource: Effect.fn("McpServerManager.getConfiguredSource")(function* ({
        target,
      }) {
        const configured = yield* ws
          .getConfiguredMcpServerEntries()
          .pipe(Effect.mapError(toAppError));
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),
      isConfigured: Effect.fn("McpServerManager.isConfigured")(function* ({ target }) {
        const configured = yield* ws
          .getConfiguredMcpServerEntries()
          .pipe(Effect.mapError(toAppError));
        return configured[target.name] !== undefined;
      }),
      listMaterializable: Effect.fn("McpServerManager.listMaterializable")(function* () {
        const configured = yield* ws.records
          .rows("mcp-server")
          .pipe(Effect.mapError(toAppError))
          .pipe(Effect.map(configuredRowsByName));
        return yield* configuredMcpServersToDiskRefs(
          { fs, path, baseDir, scope: ws.scope, layout: ws.layout },
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
            const treeIntegrity = lastTreeIntegrities.get(registryRef.server.name);
            if (treeIntegrity === undefined) {
              return Effect.fail(
                makeAppError({
                  code: "internal",
                  detail: `MCP server ${registryRef.server.name} has no materialized tree integrity`,
                }),
              );
            }
            const lockEntry = buildMcpServerLockEntry(registryRef, treeIntegrity);
            return ws
              .setMcpServer({
                name: ref.server.name,
                lockEntry,
                versionRange,
              })
              .pipe(Effect.mapError(toAppError));
          }),
          Effect.withSpan("McpServerManager.upsertSettingsEntry"),
        );
      },

      removeSettingsEntry: ({ target }: { readonly target: McpServerExtensionTarget }) =>
        ws
          .removeMcpServerSettings(target.name)
          .pipe(Effect.mapError(toAppError))
          .pipe(Effect.withSpan("McpServerManager.removeSettingsEntry")),

      upsertLockfileEntry: ({ ref }: { readonly ref: McpServerExtensionRef }) => {
        if (ref.refType !== "registry")
          return ws
            .removeMcpServerLock(ref.server.name)
            .pipe(Effect.mapError(toAppError))
            .pipe(Effect.withSpan("McpServerManager.upsertLockfileEntry"));
        const registryRef = ref;
        return validateExactResolvedVersion(
          `mcpServers.${ref.server.name}.resolvedVersion`,
          registryRef.version,
        ).pipe(
          Effect.flatMap(() => {
            const treeIntegrity = lastTreeIntegrities.get(registryRef.server.name);
            if (treeIntegrity === undefined) {
              return Effect.fail(
                makeAppError({
                  code: "internal",
                  detail: `MCP server ${registryRef.server.name} has no materialized tree integrity`,
                }),
              );
            }
            const lockEntry = buildMcpServerLockEntry(registryRef, treeIntegrity);
            return ws
              .setMcpServerLock({
                name: ref.server.name,
                lockEntry,
                versionRange: Option.none(),
              })
              .pipe(Effect.mapError(toAppError));
          }),
          Effect.withSpan("McpServerManager.upsertLockfileEntry"),
        );
      },

      removeLockfileEntry: ({ target }: { readonly target: McpServerExtensionTarget }) =>
        ws
          .removeMcpServerLock(target.name)
          .pipe(Effect.mapError(toAppError))
          .pipe(Effect.withSpan("McpServerManager.removeLockfileEntry")),
    } satisfies ExtensionManager<McpServerExtensionRef>;
  }),
);
