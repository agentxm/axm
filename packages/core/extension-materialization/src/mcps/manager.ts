/**
 * MCP server extension manager service.
 *
 * Implements ExtensionManager<McpServerExtensionRef>. Delegates to existing
 * MCP server materialization functions and workspace service methods.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { McpInstallStateMissing, McpRegistryOnlyInstall } from "./errors.js";
import {
  applyProjectionPlans,
  inspectMcpServerAcrossAgents,
  planSingletonProjection,
} from "@agentxm/workspace-projection";
import { McpConfigIoFailed, removeMcpServerFromManifest } from "@agentxm/agent-integration";
import type { ExtensionManagerFailure } from "../errors.js";
import type { ExtensionManager, ManagerRequirements } from "../manager-contract.js";
import { NO_MATERIALIZATION_OBSERVATION } from "../manager-contract.js";
import {
  McpServerManager,
  type McpServerManagerService,
  type McpServerMaterializationFacts,
} from "../managers.js";
import { configuredMcpServersToDiskRefs } from "../extensions/materializable-from-disk.js";
import type {
  McpServerExtensionRef,
  RegistryMcpServerRef,
} from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { ConfiguredAgentOutcome, McpServerLockEntry } from "@agentxm/workspace-state";
import type { ExtensionTarget, McpServerExtensionTarget } from "@agentxm/workspace-state";
import { mcpRegistryResolutionKey, WorkspaceMutations } from "@agentxm/workspace-state";
import { canReuseInstalledPackage } from "../extensions/canonical-directory.js";
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
import { protectWorkspacePath } from "@agentxm/workspace-transactions";
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
    const path = yield* Path.Path;
    const baseDir = ws.baseDir;

    const acquired = (
      treeIntegrity: Option.Option<TreeIntegrity>,
    ): McpServerMaterializationFacts => ({
      observation: NO_MATERIALIZATION_OBSERVATION,
      treeIntegrity,
      removal: Option.none(),
    });

    const materializeInstall: ExtensionManager<
      McpServerExtensionRef,
      McpServerMaterializationFacts,
      ManagerRequirements
    >["materializeInstall"] = Effect.fn("McpServerManager.materializeInstall")(function* ({
      ref,
      force,
    }) {
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
      const useExisting = yield* canReuseInstalledPackage({
        installedPath: canonicalPath,
        force: force === true,
        refVersion: registryRef.version,
        hasIntegrity: Option.isSome(registryRef.integrity),
        ...(lockedVersion === undefined ? {} : { lockedVersion }),
        existsFailureDetail: (target) => `Failed to check if canonical path exists: ${target}`,
      });

      if (useExisting && Option.isSome(lockedEntry)) {
        const observedTree = yield* computeMaterializedTreeIntegrity(canonicalPath);
        if (observedTree === lockedEntry.value.treeIntegrity) {
          return acquired(Option.some(lockedEntry.value.treeIntegrity));
        }
      }
      const materialized = yield* materializeRegistryPackageWithTreeIntegrity({
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
      });
      return acquired(Option.some(materialized.treeIntegrity));
    });

    const makeMaterializeRemoval = (
      retainCanonical: boolean,
    ): ExtensionManager<
      McpServerExtensionRef,
      McpServerMaterializationFacts,
      ManagerRequirements
    >["materializeUninstall"] =>
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
        const withdrawn: McpServerMaterializationFacts = {
          observation: NO_MATERIALIZATION_OBSERVATION,
          treeIntegrity: Option.none(),
          removal: Option.some({
            resolutionKey:
              desiredNode === undefined || desiredNode.authority === "inline"
                ? Option.none<string>()
                : Option.some(desiredNode.identity),
            retainShared,
          }),
        };
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
                  removeMcpServerFromManifest(agentId, {
                    workspaceRoot: baseDir,
                    scope: ws.scope,
                    serverName: target.name,
                  }).pipe(Effect.asVoid),
              },
            }),
          ),
        );

        if (retainCanonical || retainShared) return withdrawn;
        const canonical = yield* acceptedCanonicalObservation({
          workspace: ws,
          type: "mcp-server",
          name: target.name,
        });
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
        return withdrawn;
      });
    const materializeUninstall = makeMaterializeRemoval(false);
    const materializeDeactivate = makeMaterializeRemoval(true);

    const configuredAgentOutcomesForEntry: McpServerManagerService["configuredAgentOutcomesForEntry"] =
      Effect.fn("McpServerManager.configuredAgentOutcomesForEntry")(function* ({
        name,
        entry,
        state,
      }) {
        const configuredAgentIds = yield* ws.getConfiguredAgents();
        const canonical =
          entry.kind === "inline"
            ? Option.none<string>()
            : (yield* acceptedCanonicalObservation({
                workspace: ws,
                type: "mcp-server",
                name,
              })).pipe(
                Option.flatMap(({ observation }) => Option.fromUndefinedOr(observation.path)),
              );
        const inspections = yield* inspectMcpServerAcrossAgents({
          workspaceRoot: baseDir,
          scope: ws.scope,
          agentIds: configuredAgentIds,
          serverName: name,
          entry: { ...entry, enabled: true },
          canonicalPaths: Option.match(canonical, { onNone: () => [], onSome: (value) => [value] }),
          state,
        });
        return inspections.map((inspection): ConfiguredAgentOutcome => ({
          extensionType: "mcp-server",
          name,
          agentId: inspection.agentId,
          outcome:
            inspection.status === "match"
              ? state
              : inspection.status === "unsupported"
                ? "unsupported"
                : inspection.status === "blocked"
                  ? "blocked"
                  : "failed",
          reasonCode:
            inspection.status === "match"
              ? "supported"
              : inspection.status === "absent"
                ? "projection-missing"
                : inspection.status === "drift"
                  ? "stale-projection"
                  : `mcp-${inspection.status}`,
          reason:
            inspection.reason ??
            (inspection.status === "match"
              ? `${inspection.agentId} has a matching MCP projection.`
              : inspection.status === "absent"
                ? `The expected ${inspection.agentId} projection is missing.`
                : inspection.status === "drift"
                  ? `The expected ${inspection.agentId} projection is stale.`
                  : `MCP projection status is ${inspection.status}.`),
          ...(inspection.path.length === 0 ? {} : { path: inspection.path }),
        }));
      });

    const configuredAgentOutcomes: McpServerManagerService["configuredAgentOutcomes"] = (state) =>
      Effect.gen(function* () {
        const entries = yield* ws.getConfiguredMcpServerEntries();
        return (yield* Effect.forEach(
          Object.entries(entries).filter(([, entry]) => state === "projected" || entry.enabled),
          ([name, entry]) => configuredAgentOutcomesForEntry({ name, entry, state }),
          { concurrency: "unbounded" },
        )).flat();
      });

    return {
      type: "mcp-server",
      isInstalled: Effect.fn("McpServerManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: ExtensionTarget;
      }) {
        return yield* isObservedInstalled(ws, "mcp-server", target.name);
      }),

      materializeInstall,
      prepareSourceTransition: ({ ref }) =>
        prepareAcceptedCanonicalTransition({
          workspace: ws,
          type: "mcp-server",
          name: ref.server.name,
          ref,
        }),
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
      configuredAgentOutcomes,
      configuredAgentOutcomesForEntry,

      upsertSettingsEntry: ({
        ref,
        versionRange,
        materialization,
      }: {
        readonly ref: McpServerExtensionRef;
        readonly versionRange: Option.Option<string>;
        readonly materialization: Option.Option<McpServerMaterializationFacts>;
      }) => {
        if (ref.refType !== "registry")
          return Effect.void.pipe(Effect.withSpan("McpServerManager.upsertSettingsEntry"));
        const registryRef = ref;
        return validateExactResolvedVersion(
          `mcpServers.${ref.server.name}.resolvedVersion`,
          registryRef.version,
        ).pipe(
          Effect.flatMap((): Effect.Effect<void, ExtensionManagerFailure> => {
            const treeIntegrity = materialization.pipe(
              Option.flatMap((facts) => facts.treeIntegrity),
            );
            if (Option.isNone(treeIntegrity)) {
              return Effect.fail(new McpInstallStateMissing({ name: registryRef.server.name }));
            }
            const lockEntry = buildMcpServerLockEntry(registryRef, treeIntegrity.value);
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

      upsertLockfileEntry: ({
        ref,
        materialization,
      }: {
        readonly ref: McpServerExtensionRef;
        readonly materialization: Option.Option<McpServerMaterializationFacts>;
      }) => {
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
            const treeIntegrity = materialization.pipe(
              Option.flatMap((facts) => facts.treeIntegrity),
            );
            if (Option.isNone(treeIntegrity)) {
              return Effect.fail(new McpInstallStateMissing({ name: registryRef.server.name }));
            }
            const lockEntry = buildMcpServerLockEntry(registryRef, treeIntegrity.value);
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

      removeLockfileEntry: ({
        materialization,
      }: {
        readonly target: McpServerExtensionTarget;
        readonly materialization: Option.Option<McpServerMaterializationFacts>;
      }) => {
        const removal = materialization.pipe(Option.flatMap((facts) => facts.removal));
        if (Option.isNone(removal)) {
          return Effect.void.pipe(Effect.withSpan("McpServerManager.removeLockfileEntry"));
        }
        if (removal.value.retainShared || Option.isNone(removal.value.resolutionKey)) {
          return Effect.void.pipe(Effect.withSpan("McpServerManager.removeLockfileEntry"));
        }
        return ws
          .removeMcpServerLock(removal.value.resolutionKey.value)
          .pipe(Effect.withSpan("McpServerManager.removeLockfileEntry"));
      },
    } satisfies McpServerManagerService;
  }),
);
