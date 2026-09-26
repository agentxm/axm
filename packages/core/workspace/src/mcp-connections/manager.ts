import { LifecyclePostconditionViolated } from "../transitions/planning/index.js";
import { usableAcceptedCanonical } from "../desired-state/index.js";

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
import { extensionRefLifecycleWarnings } from "../lifecycle/warnings.js";
import * as Ref from "effect/Ref";
import {
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
} from "../desired-state/index.js";

import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { McpAgentSyncRefused, McpInstallStateMissing } from "./errors.js";
import {
  applyProjectionPlans,
  inspectDesiredMcpServer,
  planSingletonProjection,
} from "../projection/index.js";
import {
  McpConfigIoFailed,
  McpSharedTargetConflict,
  removeMcpServerFromManifest,
} from "../projection/agent-adapters/index.js";
import { NO_MATERIALIZATION_OBSERVATION } from "../materialization/manager-contract.js";
import {
  McpServerManager,
  type McpServerManagerService,
  type McpServerMaterializationFacts,
} from "../materialization/managers.js";
import { configuredMcpServersToDiskRefs } from "../acquisition/materializable-from-disk.js";
import type {
  McpServerExtensionRef,
  RegistryMcpServerRef,
} from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { McpServerLockEntry } from "../desired-state/index.js";
import type { ExtensionTarget, McpServerExtensionTarget } from "../desired-state/index.js";
import { mcpRegistryResolutionKey } from "../desired-state/index.js";
import { reusableCanonicalTree } from "../acquisition/canonical-directory.js";
import { materializeRegistryPackageWithTreeIntegrity } from "../materialization/registry-materialization.js";
import { computeExtensionPathsForLayout } from "../desired-state/index.js";
import { validateExactResolvedVersion } from "../desired-state/index.js";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { configuredRowsByName } from "../desired-state/index.js";
import { isObservedInstalled } from "../desired-state/index.js";
import {
  acceptedCanonicalObservation,
  prepareAcceptedCanonicalTransition,
  removableAcceptedCanonicalPath,
} from "../desired-state/index.js";
import { protectWorkspacePath } from "../transitions/settlement/index.js";
import {
  computeMaterializedTreeIntegrity,
  type MaterializedTreeInvalid,
  type TreeIntegrity,
} from "../desired-state/index.js";
import { SourceHostProviders } from "../resolution/sources/index.js";
import { copyExtensionDirectory } from "../acquisition/copy-directory.js";
import { replaceCanonicalDirectoryWithInspection } from "../acquisition/canonical-directory.js";
import { fromFileLocation } from "@agentxm/host-primitives";
import {
  isPathSafe,
  makeWorkspaceRelativeSourcePath,
} from "@agentxm/extension-model/unstable/path-types";
import {
  acceptedRowKey,
  computePackageContentHash,
  desiredMcpSourceKey,
  mcpResolutionKey,
} from "../desired-state/index.js";
import { registrySourceLockFields } from "../desired-state/index.js";
import { buildExternalMcpServerLockEntry } from "./lock-entry-builder.js";
import { McpCanonicalPathUnsafe, McpWorkspacePackageInvalid } from "./errors.js";

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
    const sources = yield* SourceHostProviders;
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
    )(function* ({ ref, force }) {
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
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const canonicalPath = computeExtensionPathsForLayout(
              path.join,
              currentLayout(),
              ref,
              "mcps",
              ref.name,
            ).canonicalPath;
            const fetched = yield* sources.fetch(ref).pipe(
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
            const materialized = yield* replaceCanonicalDirectoryWithInspection<
              TreeIntegrity,
              McpWorkspacePackageInvalid | MaterializedTreeInvalid,
              FileSystem.FileSystem | Path.Path
            >({
              baseDir,
              canonicalPath,
              populate: (stagingPath) =>
                copyExtensionDirectory(fetched.directory, stagingPath).pipe(
                  Effect.mapError(
                    (cause) =>
                      new McpWorkspacePackageInvalid({
                        serverName: ref.server.name,
                        location: fetched.directory,
                        fault: "unreadable",
                        cause,
                      }),
                  ),
                ),
              inspect: computeMaterializedTreeIntegrity,
            }).pipe(
              Effect.mapError(
                (cause) =>
                  new McpWorkspacePackageInvalid({
                    serverName: ref.server.name,
                    location: fetched.directory,
                    fault: "unreadable",
                    cause,
                  }),
              ),
            );
            return acquired(Option.some(materialized.inspection));
          }),
        );
      }

      const registryRef = ref;
      yield* validateExactResolvedVersion(
        `mcpServers.${registryRef.server.name}.resolvedVersion`,
        registryRef.version,
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
      const reusable = yield* reusableCanonicalTree({
        canonicalPath,
        requested: {
          refType: "registry",
          owner: registryRef.owner,
          name: registryRef.name,
          version: registryRef.version,
          publisherBindingId: registryRef.publisherBindingId,
        },
        accepted: lockedEntry,
        force: force === true,
      });
      if (Option.isSome(reusable)) return acquired(Option.some(reusable.value));
      const materialized = yield* materializeRegistryPackageWithTreeIntegrity({
        baseDir,
        destinationPath: canonicalPath,
        sourceLocation: registryRef.source.location,
        owner: registryRef.owner,
        type: "mcp-server",
        name: registryRef.name,
        version: registryRef.version,
        integrity: registryRef.integrity,
        publisherBindingId: registryRef.publisherBindingId,
        lifecycleWarnings: extensionRefLifecycleWarnings(registryRef),
        messages: {
          integrityMismatchDetail: `Integrity mismatch for ${registryRef.name}@${registryRef.version}`,
        },
      });
      return acquired(Option.some(materialized.treeIntegrity));
    });

    const makeMaterializeRemoval = (
      retainCanonical: boolean,
    ): McpServerManagerService["materializeUninstall"] =>
      Effect.fn("McpServerManager.materializeRemoval")(function* ({ target }) {
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
        const withdrawn: McpServerMaterializationFacts = {
          observation: NO_MATERIALIZATION_OBSERVATION,
          treeIntegrity: Option.none(),
          removal: Option.some({
            resolutionKey:
              desiredNode === undefined ? Option.none<string>() : acceptedRowKey(desiredNode),
            retainShared,
          }),
        };
        const configuredAgents = yield* settings.configuredAgents;

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
                // A configured agent that cannot withdraw the entry fails the
                // change rather than leaving desired state ahead of its agents.
                apply: () =>
                  removeMcpServerFromManifest(agentId, {
                    workspaceRoot: baseDir,
                    scope: location.scope,
                    serverName: target.name,
                  }).pipe(
                    Effect.flatMap((outcome) =>
                      outcome._tag === "success" || outcome._tag === "unsupported"
                        ? Effect.void
                        : new McpAgentSyncRefused({
                            serverName: target.name,
                            fault: "failed",
                            agentIds: [agentId],
                          }),
                    ),
                  ),
              },
            }),
          ),
        );

        if (retainCanonical || retainShared) return withdrawn;
        const canonical = yield* acceptedCanonicalObservation({
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

    return {
      isInstalled: Effect.fn("McpServerManager.isInstalled")(function* ({
        target,
      }: {
        readonly target: ExtensionTarget;
      }) {
        return yield* isObservedInstalled(records, "mcp-server", target.name);
      }),

      materializeInstall,
      acquireCanonical: materializeInstall,
      materializeRetained: ({ target }) =>
        Effect.gen(function* () {
          const canonical = yield* usableAcceptedCanonical({
            type: "mcp-server",
            name: target.name,
          });
          if (Option.isNone(canonical) || canonical.value.ref.type !== "mcp-server") {
            return yield* new LifecyclePostconditionViolated({
              postcondition: "materialize-observable",
              targetType: "mcp-server",
              targetName: target.name,
            });
          }
          return yield* materializeInstall({ ref: canonical.value.ref });
        }),
      prepareSourceTransition: ({ ref }) =>
        prepareAcceptedCanonicalTransition({
          type: "mcp-server",
          name: ref.server.name,
          ref,
        }),
      getConfiguredSource: Effect.fn("McpServerManager.getConfiguredSource")(function* ({
        target,
      }) {
        const configured = yield* settings.entries("mcp-server");
        return Option.fromUndefinedOr(configured[target.name]?.source);
      }),
      isConfigured: Effect.fn("McpServerManager.isConfigured")(function* ({ target }) {
        const configured = yield* settings.entries("mcp-server");
        return configured[target.name] !== undefined;
      }),
      listMaterializable: Effect.fn("McpServerManager.listMaterializable")(function* () {
        const configured = yield* records
          .rows("mcp-server")

          .pipe(Effect.map(configuredRowsByName));
        return yield* configuredMcpServersToDiskRefs(
          { fs, path, baseDir, scope: location.scope, layout: currentLayout() },
          configured,
        );
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
        const canonicalPath = computeExtensionPathsForLayout(
          path.join,
          currentLayout(),
          ref,
          "mcps",
          ref.name,
        ).canonicalPath;
        const entry = buildExternalMcpServerLockEntry({
          ref,
          treeIntegrity: treeIntegrity.value,
          contentIdentity: yield* computePackageContentHash(canonicalPath),
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
    } satisfies McpServerManagerService;
  }),
);
