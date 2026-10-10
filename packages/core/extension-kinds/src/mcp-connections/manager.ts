/**
 * MCP server extension manager service.
 *
 * Implements McpServer materialization. Delegates to existing
 * MCP server materialization functions and workspace service methods.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import {
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
  type McpServerLockEntry,
  type McpServerExtensionTarget,
  mcpRegistryResolutionKey,
  computeExtensionPathsForLayout,
  acquiredPackageRelativePath,
  validateExactResolvedVersion,
  acceptedCanonicalObservation,
  acceptedLockedResolutionRef,
  removableAcceptedCanonicalPath,
  type TreeIntegrity,
  acceptedRowKey,
  desiredMcpSourceKey,
  mcpResolutionKey,
  registrySourceLockFields,
} from "@agentxm/workspace-kernel/workspace-state";

import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import {
  McpAgentSyncRefused,
  McpInstallStateMissing,
  McpCanonicalPathUnsafe,
  McpWorkspacePackageInvalid,
} from "./errors.js";
import { installMcpServer } from "./install/install-operation.js";
import {
  inspectDesiredMcpServer,
  nativePackageReferences,
} from "@agentxm/workspace-kernel/projection";
import {
  McpConfigIoFailed,
  McpConfigInvalid,
  McpSharedTargetConflict,
  removeMcpServerFromAgents,
} from "@agentxm/workspace-kernel/agent-adapters";
import {
  NO_MATERIALIZATION_OBSERVATION,
  McpServerManager,
  type McpServerManagerService,
  type McpServerMaterializationFacts,
  acquireCanonicalForRef,
  makeBaseManagerMembers,
  listMaterializableFromDisk,
} from "@agentxm/workspace-kernel/materialization";
import type {
  McpServerExtensionRef,
  RegistryMcpServerRef,
} from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { combineNativeLocationOutcomes } from "@agentxm/workspace-kernel/locations";
import { fromFileLocation } from "@agentxm/host-primitives";
import {
  isPathSafe,
  makeWorkspaceRelativeSourcePath,
} from "@agentxm/extension-model/unstable/path-types";
import { buildExternalMcpServerLockEntry } from "./lock-entry-builder.js";
import {
  retireCanonicalDirectory,
  configuredMcpServersToDiskRefs,
  sourceRefContentKey,
} from "@agentxm/workspace-kernel/acquisition";

// Build lock entry from registry ref
const buildMcpServerLockEntry = (
  ref: RegistryMcpServerRef,
  treeIntegrity: TreeIntegrity,
): McpServerLockEntry =>
  registrySourceLockFields(
    ref.source,
    ref.owner,
    ref.name,
    decodeVersionSync(ref.version),
    Option.getOrElse(ref.integrity, () => ""),
    ref.publisherBindingId,
    treeIntegrity,
  );

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

export const McpServerManagerLive = Layer.effect(
  McpServerManager,
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const settings = yield* SettingsReader;
    const lockfile = yield* LockfileReader;
    const desiredState = yield* DesiredStateReader;
    const records = yield* WorkspaceRecords;
    const currentLayout = () => Ref.getUnsafe(location.layout);
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const baseDir = location.baseDir;

    const acquired = (
      treeIntegrity: Option.Option<TreeIntegrity>,
    ): McpServerMaterializationFacts => ({
      observation: NO_MATERIALIZATION_OBSERVATION,
      treeIntegrity,
      removal: Option.none(),
    });

    const materializeInstall: McpServerManagerService["materializeInstall"] = Effect.fn(
      "McpServerManager.materializeInstall",
    )(function* ({ ref, force, nativeInsertionEligible }) {
      if (ref.refType === "workspace") {
        const expected = computeExtensionPathsForLayout(
          path.join,
          currentLayout(),
          ref,
          "mcps",
          ref.name,
        ).canonicalPath;
        if (ref.scope !== location.scope || path.resolve(ref.location) !== path.resolve(expected)) {
          return yield* new McpWorkspacePackageInvalid({
            serverName: ref.server.name,
            location: ref.location,
            fault: "outside-workspace",
          });
        }
        const exists = yield* fs.exists(ref.location).pipe(
          Effect.mapError(
            (cause) =>
              new McpWorkspacePackageInvalid({
                serverName: ref.server.name,
                location: ref.location,
                fault: "unreadable",
                cause,
              }),
          ),
        );
        if (!exists) {
          return yield* new McpWorkspacePackageInvalid({
            serverName: ref.server.name,
            location: ref.location,
            fault: "missing",
          });
        }
        return acquired(Option.none());
      }
      if (ref.refType !== "registry") {
        if (force !== true) {
          const target = { type: "mcp-server" as const, name: ref.server.name };
          const canonical = yield* acceptedCanonicalObservation(target);
          const accepted = yield* acceptedLockedResolutionRef(target);
          if (
            Option.isSome(canonical) &&
            canonical.value.accepted !== undefined &&
            canonical.value.observation.status === "usable" &&
            Option.isSome(accepted) &&
            sourceRefContentKey(accepted.value) === sourceRefContentKey(ref)
          )
            return acquired(Option.some(canonical.value.accepted.treeIntegrity));
        }
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const canonicalPath = computeExtensionPathsForLayout(
              path.join,
              currentLayout(),
              ref,
              "mcps",
              ref.name,
            ).canonicalPath;
            const materialized = yield* acquireCanonicalForRef({
              ref,
              type: "mcp-server",
              baseDir,
              canonicalPath,
              accepted: Option.none(),
              force: force === true,
              nativeInsertionEligible: nativeInsertionEligible === true,
              copyFailure: {
                code: "internal",
                detail: (target) => `Failed to retain MCP package at ${target}`,
              },
            }).pipe(
              Effect.mapError(
                (cause) =>
                  new McpWorkspacePackageInvalid({
                    serverName: ref.server.name,
                    location: ref.location,
                    fault: "unreadable",
                    cause,
                  }),
              ),
            );
            return acquired(Option.some(materialized.treeIntegrity));
          }),
        );
      }

      const registryRef = ref;
      yield* validateExactResolvedVersion(
        `mcpServers.${registryRef.server.name}.resolvedVersion`,
        registryRef.version,
      );
      yield* Effect.fromResult(
        acquiredPackageRelativePath(registryRef, "mcps", registryRef.name),
      ).pipe(
        Effect.mapError(
          () =>
            new McpCanonicalPathUnsafe({
              serverName: registryRef.name,
              canonicalPath: path.join(
                currentLayout().acquiredRoot,
                registryRef.owner,
                "mcps",
                registryRef.name,
              ),
            }),
        ),
      );
      const canonicalPath = computeExtensionPathsForLayout(
        path.join,
        currentLayout(),
        registryRef,
        "mcps",
        registryRef.name,
      ).canonicalPath;
      if (!isPathSafe(path, baseDir, canonicalPath)) {
        return yield* new McpCanonicalPathUnsafe({
          serverName: registryRef.name,
          canonicalPath,
        });
      }

      const lockedEntry = yield* lockfile.entry(
        "mcp-server",
        mcpRegistryResolutionKey({
          authority: registryRef.source.location,
          owner: registryRef.owner,
          name: registryRef.server.name,
        }),
      );
      const packageContent = yield* acquireCanonicalForRef({
        ref: registryRef,
        type: "mcp-server",
        baseDir,
        canonicalPath,
        accepted: lockedEntry,
        force: force === true,
        nativeInsertionEligible: nativeInsertionEligible === true,
        copyFailure: {
          code: "internal",
          detail: (target) => `Failed to copy MCP server package files to ${target}`,
        },
      });
      return acquired(Option.some(packageContent.treeIntegrity));
    });

    const makeMaterializeRemoval = (
      retainCanonical: boolean,
    ): McpServerManagerService["materializeUninstall"] =>
      Effect.fn("McpServerManager.materializeRemoval")(function* ({ target, nativeCleanup }) {
        const graph = yield* desiredState.graph();
        const desiredNode = graph.nodes.find(
          (node) => node.type === "mcp-server" && node.name === target.name,
        );
        const closure =
          desiredNode === undefined || desiredNode.authority === "inline"
            ? undefined
            : graph.mcpSourceClosures.find(
                (candidate) => candidate.key === desiredMcpSourceKey(desiredNode.identity),
              );
        const retainShared =
          closure !== undefined && closure.localNames.some((name) => name !== target.name);
        const configuredAgents = yield* settings.configuredAgents;
        const outcomes =
          nativeCleanup === "retain"
            ? []
            : yield* removeMcpServerFromAgents(configuredAgents, {
                nativeDirectoryInputs: location.nativeDirectoryInputs,
                workspaceRoot: baseDir,
                scope: location.scope,
                serverName: target.name,
                disableOnly: retainCanonical,
              });
        if (
          !outcomes.every((outcome) => outcome._tag === "success" || outcome._tag === "unsupported")
        ) {
          return yield* new McpAgentSyncRefused({
            serverName: target.name,
            fault: "failed",
            agentIds: configuredAgents,
          });
        }
        const withdrawn: McpServerMaterializationFacts = {
          observation: {
            ...NO_MATERIALIZATION_OBSERVATION,
            nativeLocations: combineNativeLocationOutcomes(
              outcomes.flatMap((outcome) =>
                "targets" in outcome
                  ? (outcome.targets ?? []).flatMap((native) =>
                      native.nativeLocation === undefined ? [] : [native.nativeLocation],
                    )
                  : [],
              ),
            ),
          },
          treeIntegrity: Option.none(),
          removal: Option.some({
            resolutionKey:
              desiredNode === undefined ? Option.none<string>() : acceptedRowKey(desiredNode),
            retainShared,
          }),
        };

        if (retainCanonical || retainShared) return withdrawn;
        const canonical = yield* acceptedCanonicalObservation({
          type: "mcp-server",
          name: target.name,
        });
        const serverPath = removableAcceptedCanonicalPath(canonical);
        if (Option.isSome(serverPath)) {
          const retained = yield* nativePackageReferences({
            workspaceRoot: baseDir,
            nativeDirectoryInputs: location.nativeDirectoryInputs,
            scope: location.scope,
            packageRoot: serverPath.value,
          });
          if (retained.length > 0)
            return yield* new McpConfigInvalid({
              detail: `Cannot remove MCP package while native registrations still reference it at ${retained.join(", ")}. Remove those exact registrations explicitly, then retry uninstall.`,
            });
          yield* retireCanonicalDirectory(serverPath.value).pipe(
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

    /**
     * Every desired MCP connection's per-agent outcome, judged from the
     * desired-state graph: a Pack-supplied member is judged exactly as a
     * settings-declared one, and the presence of a raw settings entry decides
     * nothing.
     */
    const configuredAgentOutcomes: McpServerManagerService["configuredAgentOutcomes"] = (
      state,
      proposedGraph,
      selection,
    ) =>
      Effect.gen(function* () {
        const configuredAgentIds = yield* settings.configuredAgents;
        const entries = yield* settings.entries("mcp-server");
        const graph = proposedGraph ?? (yield* desiredState.graph());
        const nodes = graph.nodes.filter(
          (node) =>
            node.type === "mcp-server" &&
            (state === "projected" || node.enabled) &&
            (selection === undefined || selection.names.includes(node.name)),
        );
        return (yield* Effect.forEach(
          nodes,
          (node) =>
            Effect.gen(function* () {
              const canonical =
                node.authority === "inline"
                  ? Option.none<string>()
                  : (yield* acceptedCanonicalObservation({
                      type: "mcp-server",
                      name: node.name,
                      desired: node,
                    })).pipe(
                      Option.flatMap(({ observation }) => Option.fromUndefinedOr(observation.path)),
                    );
              const { outcomes, conflict } = yield* inspectDesiredMcpServer({
                nativeDirectoryInputs: location.nativeDirectoryInputs,
                workspaceRoot: baseDir,
                scope: location.scope,
                agentIds: configuredAgentIds,
                node,
                entry: entries[node.name],
                canonicalPaths: Option.match(canonical, {
                  onNone: () => [],
                  onSome: (value) => [value],
                }),
                state,
              });
              // No write can make a conflicting shared target current, so the
              // outcome is a refusal, not a projection to plan.
              if (Option.isSome(conflict)) {
                return yield* new McpSharedTargetConflict({ reason: conflict.value });
              }
              return outcomes;
            }),
          { concurrency: 16 },
        )).flat();
      });

    const service: McpServerManagerService = {
      ...makeBaseManagerMembers({
        type: "mcp-server",
        spanPrefix: "McpServerManager",
        records,
        settings,
        refName: (ref) => ref.server.name,
        materializeInstall,
      }),
      materializeInstall,
      acquireCanonical: materializeInstall,
      isConfigured: Effect.fn("McpServerManager.isConfigured")(function* ({ target }) {
        const configured = yield* settings.entries("mcp-server");
        return configured[target.name] !== undefined;
      }),
      listMaterializable: () =>
        listMaterializableFromDisk({
          type: "mcp-server",
          records,
          toDiskRefs: configuredMcpServersToDiskRefs,
          env: { fs, path, baseDir, scope: location.scope, layout: currentLayout() },
        }),
      materializeUninstall,
      materializeDeactivate,
      configuredAgentOutcomes,

      acceptedResolution: Effect.fn("McpServerManager.acceptedResolution")(function* ({
        ref,
        materialization,
      }: {
        readonly ref: McpServerExtensionRef;
        readonly materialization: Option.Option<McpServerMaterializationFacts>;
      }) {
        if (ref.refType === "workspace") return Option.none();
        const treeIntegrity = materialization.pipe(Option.flatMap((facts) => facts.treeIntegrity));
        if (Option.isNone(treeIntegrity)) {
          return yield* new McpInstallStateMissing({ name: ref.server.name });
        }
        if (ref.refType === "registry") {
          const entry = buildMcpServerLockEntry(ref, treeIntegrity.value);
          return Option.some({
            key: mcpRegistryResolutionKey({
              authority: ref.source.location,
              owner: ref.owner,
              name: ref.server.name,
            }),
            entry,
          });
        }
        const entry = buildExternalMcpServerLockEntry({
          ref,
          treeIntegrity: treeIntegrity.value,
          localPath:
            ref.refType === "local"
              ? makeWorkspaceRelativeSourcePath(path, baseDir, fromFileLocation(ref.location))
              : Option.none(),
        });
        return Option.some({ key: mcpResolutionKey(entry), entry });
      }),

      withdrawnResolutionKeys: ({
        materialization,
      }: {
        readonly target: McpServerExtensionTarget;
        readonly materialization: Option.Option<McpServerMaterializationFacts>;
      }) => {
        const removal = materialization.pipe(Option.flatMap((facts) => facts.removal));
        if (Option.isNone(removal)) {
          return Effect.succeed([]);
        }
        if (removal.value.retainShared || Option.isNone(removal.value.resolutionKey)) {
          return Effect.succeed([]);
        }
        return Effect.succeed([removal.value.resolutionKey.value]);
      },

      // The install operation acquires through this same manager.
      installConnection: (op) =>
        installMcpServer(op).pipe(Effect.provideService(McpServerManager, service)),
    };
    return service;
  }),
);
