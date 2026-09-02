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
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import {
  McpConfigIoFailed,
  McpInstallStateMissing,
  McpRegistryOnlyInstall,
  removeMcpServerFromManifest,
  applyProjectionPlans,
  planSingletonProjection,
} from "@agentxm/extension-workspace";
import type { ExtensionManagerFailure, ExtensionManager } from "@agentxm/extension-workspace";
import { McpServerManager } from "@agentxm/extension-workspace";
import { configuredMcpServersToDiskRefs } from "@agentxm/extension-workspace";
import type {
  McpServerExtensionRef,
  RegistryMcpServerRef,
} from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { McpServerLockEntry } from "@agentxm/workspace-state";
import type { ExtensionTarget, McpServerExtensionTarget } from "@agentxm/workspace-state";
import { mcpRegistryResolutionKey, WorkspaceMutations } from "@agentxm/workspace-state";
import { canReuseInstalledPackage } from "@agentxm/extension-workspace";
import { materializeRegistryPackageWithTreeIntegrity } from "../registry-materialization.js";
import { computeExtensionPathsForLayout } from "@agentxm/workspace-state";
import {
  acceptedRegistryVersionForRef,
  validateExactResolvedVersion,
} from "@agentxm/workspace-state";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { configuredRowsByName } from "@agentxm/workspace-state";
import { isObservedInstalled } from "@agentxm/workspace-state";
import {
  acceptedCanonicalObservation,
  prepareAcceptedCanonicalTransition,
  removableAcceptedCanonicalPath,
} from "@agentxm/workspace-state";
import { protectWorkspacePath } from "@agentxm/workspace-state";
import { computeMaterializedTreeIntegrity, type TreeIntegrity } from "@agentxm/workspace-state";

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
    const pendingRemoval = new Map<
      string,
      { readonly resolutionKey?: string; readonly retainShared: boolean }
    >();

    const materializeInstall: ExtensionManager<McpServerExtensionRef>["materializeInstall"] =
      Effect.fn("McpServerManager.materializeInstall")(function* ({ ref, force }) {
        if (ref.refType !== "registry") {
          return yield* new McpRegistryOnlyInstall({
            serverName: ref.server.name,
            refType: ref.refType,
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

        const lockedEntry = yield* ws.getLockedMcpServer(
          mcpRegistryResolutionKey({
            authority: registryRef.source.location,
            owner: registryRef.owner,
            name: registryRef.server.name,
          }),
        );
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
        const graph = yield* ws.getDesiredStateGraph();
        const desiredNode = graph.nodes.find(
          (node) => node.type === "mcp-server" && node.name === target.name,
        );
        const closure =
          desiredNode === undefined || desiredNode.authority === "inline"
            ? undefined
            : graph.mcpSourceClosures.find(
                (candidate) => candidate.identity === desiredNode.identity,
              );
        const retainShared =
          closure !== undefined && closure.localNames.some((name) => name !== target.name);
        pendingRemoval.set(target.name, {
          ...(desiredNode === undefined || desiredNode.authority === "inline"
            ? {}
            : { resolutionKey: desiredNode.identity }),
          retainShared,
        });
        const configuredAgents = yield* ws.getConfiguredAgents();

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

        if (retainCanonical || retainShared) return;
        const canonical = yield* provide(
          acceptedCanonicalObservation({
            workspace: ws,
            type: "mcp-server",
            name: target.name,
          }),
        );
        const serverPath = removableAcceptedCanonicalPath(canonical);
        if (Option.isSome(serverPath)) {
          yield* protectWorkspacePath(serverPath.value);
          yield* fs.remove(serverPath.value, { recursive: true, force: true }).pipe(
            Effect.mapError(
              (cause) =>
                new McpConfigIoFailed({
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
        return yield* isObservedInstalled(ws, "mcp-server", target.name);
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
        const configured = yield* ws.getConfiguredMcpServerEntries();
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),
      isConfigured: Effect.fn("McpServerManager.isConfigured")(function* ({ target }) {
        const configured = yield* ws.getConfiguredMcpServerEntries();
        return configured[target.name] !== undefined;
      }),
      listMaterializable: Effect.fn("McpServerManager.listMaterializable")(function* () {
        const configured = yield* ws.records
          .rows("mcp-server")

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
          Effect.flatMap((): Effect.Effect<void, ExtensionManagerFailure> => {
            const treeIntegrity = lastTreeIntegrities.get(registryRef.server.name);
            if (treeIntegrity === undefined) {
              return Effect.fail(new McpInstallStateMissing({ name: registryRef.server.name }));
            }
            const lockEntry = buildMcpServerLockEntry(registryRef, treeIntegrity);
            return ws.setMcpServer({
              name: ref.server.name,
              resolutionKey: mcpRegistryResolutionKey({
                authority: registryRef.source.location,
                owner: registryRef.owner,
                name: registryRef.server.name,
              }),
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
          Effect.flatMap((): Effect.Effect<void, ExtensionManagerFailure> => {
            const treeIntegrity = lastTreeIntegrities.get(registryRef.server.name);
            if (treeIntegrity === undefined) {
              return Effect.fail(new McpInstallStateMissing({ name: registryRef.server.name }));
            }
            const lockEntry = buildMcpServerLockEntry(registryRef, treeIntegrity);
            return ws.setMcpServerLock({
              name: ref.server.name,
              resolutionKey: mcpRegistryResolutionKey({
                authority: registryRef.source.location,
                owner: registryRef.owner,
                name: registryRef.server.name,
              }),
              lockEntry,
              versionRange: Option.none(),
            });
          }),
          Effect.withSpan("McpServerManager.upsertLockfileEntry"),
        );
      },

      removeLockfileEntry: ({ target }: { readonly target: McpServerExtensionTarget }) => {
        const removal = pendingRemoval.get(target.name);
        pendingRemoval.delete(target.name);
        if (removal?.retainShared === true || removal?.resolutionKey === undefined) {
          return Effect.void.pipe(Effect.withSpan("McpServerManager.removeLockfileEntry"));
        }
        return ws
          .removeMcpServerLock(removal.resolutionKey)
          .pipe(Effect.withSpan("McpServerManager.removeLockfileEntry"));
      },
    } satisfies ExtensionManager<McpServerExtensionRef>;
  }),
);
