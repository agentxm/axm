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
import { McpInstallStateMissing } from "./errors.js";
import {
  applyProjectionPlans,
  inspectMcpServerAcrossAgents,
  planSingletonProjection,
} from "../projection/index.js";
import {
  McpConfigIoFailed,
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
import type { ConfiguredAgentOutcome, McpServerLockEntry } from "../desired-state/index.js";
import type { ExtensionTarget, McpServerExtensionTarget } from "../desired-state/index.js";
import { mcpRegistryResolutionKey } from "../desired-state/index.js";
import { canReuseInstalledPackage } from "../acquisition/canonical-directory.js";
import { materializeRegistryPackageWithTreeIntegrity } from "../materialization/registry-materialization.js";
import { computeExtensionPathsForLayout } from "../desired-state/index.js";
import {
  acceptedRegistryVersionForRef,
  validateExactResolvedVersion,
} from "../desired-state/index.js";
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
import { stripFileProtocol } from "@agentxm/registry-client";
import { makeWorkspaceRelativeSourcePath } from "@agentxm/extension-model/unstable/path-types";
import { computePackageContentHash, mcpResolutionKey } from "../desired-state/index.js";
import { registrySourceLockFields } from "../desired-state/index.js";
import { buildExternalMcpServerLockEntry } from "./lock-entry-builder.js";
import { McpWorkspacePackageInvalid } from "./errors.js";

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
        if (
          ref.scope !== location.scope ||
          path.resolve(ref.location) !== path.resolve(expected) ||
          !(yield* fs.exists(ref.location).pipe(Effect.orElseSucceed(() => false)))
        ) {
          return yield* new McpWorkspacePackageInvalid({
            serverName: ref.server.name,
            location: ref.location,
            fault: "outside-workspace",
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
      const canonicalPath = computeExtensionPathsForLayout(
        path.join,
        currentLayout(),
        registryRef,
        "mcps",
        registryRef.name,
      ).canonicalPath;

      const lockedEntry = yield* lockfile.entry(
        "mcp-server",
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
        publisherBindingId: registryRef.publisherBindingId,
        ...(registryRef.lifecycleWarnings === undefined
          ? {}
          : { lifecycleWarnings: registryRef.lifecycleWarnings }),
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
                apply: () =>
                  removeMcpServerFromManifest(agentId, {
                    workspaceRoot: baseDir,
                    scope: location.scope,
                    serverName: target.name,
                  }).pipe(Effect.asVoid),
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

    const configuredAgentOutcomesForEntry: McpServerManagerService["configuredAgentOutcomesForEntry"] =
      Effect.fn("McpServerManager.configuredAgentOutcomesForEntry")(function* ({
        name,
        entry,
        state,
      }) {
        const configuredAgentIds = yield* settings.configuredAgents;
        const canonical =
          entry.kind === "inline"
            ? Option.none<string>()
            : (yield* acceptedCanonicalObservation({
                type: "mcp-server",
                name,
              })).pipe(
                Option.flatMap(({ observation }) => Option.fromUndefinedOr(observation.path)),
              );
        const inspections = yield* inspectMcpServerAcrossAgents({
          workspaceRoot: baseDir,
          scope: location.scope,
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
        const entries = yield* settings.entries("mcp-server");
        return (yield* Effect.forEach(
          Object.entries(entries).filter(([, entry]) => state === "projected" || entry.enabled),
          ([name, entry]) => configuredAgentOutcomesForEntry({ name, entry, state }),
          { concurrency: "unbounded" },
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
      configuredAgentOutcomesForEntry,

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
          yield* validateExactResolvedVersion(
            `mcpServers.${ref.server.name}.resolvedVersion`,
            ref.version,
          );
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
              ? makeWorkspaceRelativeSourcePath(path, baseDir, stripFileProtocol(ref.location))
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
