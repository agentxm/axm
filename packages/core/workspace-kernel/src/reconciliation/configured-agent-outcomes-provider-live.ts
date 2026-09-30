/**
 * Extension-manager-backed implementation of the workspace-state
 * `ConfiguredAgentOutcomesProvider` port.
 *
 * Extension managers own the effective per-agent outcome facts; application
 * composition wires this layer over the managers and the step-failure
 * conversion it provides, so plan resolutions embed byte-identical step
 * failures on either side of the seam.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Option from "effect/Option";
import { RegistryClientFactory } from "@agentxm/registry-client";
import { formatFqn } from "@agentxm/extension-model/unstable/extensions/fqn";
import {
  CodingAgentRepository,
  observeConfiguredSkillLocations,
  observeProjectionPlans,
  inspectDesiredMcpServer,
} from "../projection/index.js";
import { NativeWriteAuthority } from "../agent-adapters/index.js";
import {
  ConfiguredAgentOutcomesProvider,
  ConfiguredAgentOutcomesUnavailable,
  DesiredStateReader,
  usableAcceptedCanonicalRef,
  computeExtensionPathsForLayout,
  extensionPathSourceFromLockEntry,
  LockfileReader,
  SettingsReader,
  type ConfiguredAgentOutcomesRequest,
  type ConfiguredExtensionObservation,
  WorkspaceLocation,
} from "../workspace-state/index.js";
import {
  HookManager,
  SubagentManager,
  RuleManager,
  KnowledgeManager,
} from "../materialization/index.js";
import {
  nativeUnitKey,
  combineNativeLocationOutcomes,
  type NativeLocationOutcome,
} from "../locations/index.js";
import type { ConfiguredAgentOutcome } from "../operations/index.js";
import { StepFailureConversion } from "./step-failure-conversion.js";
export const ConfiguredAgentOutcomesProviderLive = Layer.effect(
  ConfiguredAgentOutcomesProvider,
  Effect.gen(function* () {
    const adapter = yield* StepFailureConversion;
    const hookManager = yield* HookManager;
    // The provider's members answer with no requirements of their own, so this
    // layer is the boundary that composes what the manager needs.
    const managerLayer = Layer.mergeAll(
      Layer.succeed(CodingAgentRepository, yield* CodingAgentRepository),
      Layer.succeed(FileSystem.FileSystem, yield* FileSystem.FileSystem),
      Layer.succeed(Path.Path, yield* Path.Path),
      Layer.succeed(RegistryClientFactory, yield* RegistryClientFactory),
      Layer.succeed(NativeWriteAuthority, yield* NativeWriteAuthority),
      Layer.succeed(WorkspaceLocation, yield* WorkspaceLocation),
      Layer.succeed(SettingsReader, yield* SettingsReader),
      Layer.succeed(LockfileReader, yield* LockfileReader),
      Layer.succeed(DesiredStateReader, yield* DesiredStateReader),
    );
    const mapFailure = (failure: Parameters<typeof adapter.toStepFailure>[0]) => {
      const step = adapter.toStepFailure(failure);
      return new ConfiguredAgentOutcomesUnavailable({
        category: step.category,
        detail: step.detail,
        ...(step.suggestions === undefined ? {} : { suggestions: step.suggestions }),
        ...(step.cause === undefined ? {} : { cause: step.cause }),
      });
    };
    const subagents = yield* SubagentManager;
    const rules = yield* RuleManager;
    const knowledge = yield* KnowledgeManager;
    const fromNative = (
      request: ConfiguredAgentOutcomesRequest,
      name: string,
      nativeLocations: ReadonlyArray<NativeLocationOutcome>,
    ): ConfiguredExtensionObservation => ({
      nativeLocations,
      agentOutcomes: request.agentIds.map((agentId): ConfiguredAgentOutcome => {
        const units = nativeLocations.filter((unit) => unit.configuredConsumers.includes(agentId));
        const current =
          units.length > 0 &&
          units.every((unit) => unit.ownership === "owned" && unit.state === "unchanged");
        return {
          extensionType: request.type,
          name,
          agentId,
          outcome: current ? request.state : units.length === 0 ? "not-applicable" : "blocked",
          reasonCode: current
            ? "verified-native-unit"
            : units.length === 0
              ? "no-applicable-native-unit"
              : "native-projection-not-current",
          reason: current
            ? "Owned native units match desired content; runtime selection is unverified."
            : units.length === 0
              ? "No applicable native unit was observed for this agent."
              : "Native units are missing, unowned, or differ from desired content.",
          nativeUnitKeys: units.map(nativeUnitKey),
        };
      }),
    });
    const aggregate =
      (manager: Pick<typeof hookManager, "projectionPlans">) =>
      (request: ConfiguredAgentOutcomesRequest) =>
        Effect.gen(function* () {
          const observed = yield* manager
            .projectionPlans()
            .pipe(Effect.flatMap(observeProjectionPlans));
          const graph = yield* (yield* DesiredStateReader).graph();
          const accepted = yield* (yield* LockfileReader).entries(request.type);
          return new Map(
            request.rows.map((row) => {
              const identity = graph.nodes.find(
                (node) => node.type === request.type && node.name === row.name,
              )?.identity;
              const acceptedIdentity = accepted[row.name]?.identity;
              const fqn =
                identity === undefined || identity.authority === "inline"
                  ? undefined
                  : (identity.fqn ??
                    (acceptedIdentity?.owner === undefined
                      ? undefined
                      : formatFqn({
                          owner: acceptedIdentity.owner,
                          type: request.type,
                          name: acceptedIdentity.name,
                        })));
              const related = observed.filter(
                (observation) =>
                  fqn !== undefined &&
                  (observation.expectedContributors.includes(fqn) ||
                    observation.observedContributors?.includes(fqn)),
              );
              const nativeLocations = combineNativeLocationOutcomes(
                related.flatMap((observation) =>
                  (observation.nativeLocations ?? []).map((unit): NativeLocationOutcome => ({
                    ...unit,
                    ownership: !observation.present ? "absent" : unit.ownership,
                    state: observation.current
                      ? "unchanged"
                      : observation.present
                        ? "blocked"
                        : "absent",
                  })),
                ),
              );
              return [row.name, fromNative(request, row.name, nativeLocations)] as const;
            }),
          );
        }).pipe(Effect.provide(managerLayer), Effect.mapError(mapFailure));
    return {
      byExtensionType: {
        rule: aggregate(rules),
        knowledge: aggregate(knowledge),
        hook: (request: ConfiguredAgentOutcomesRequest) =>
          Effect.gen(function* () {
            const observations = yield* aggregate(hookManager)(request);
            const capabilityOutcomes =
              hookManager.configuredAgentOutcomes === undefined
                ? []
                : yield* hookManager
                    .configuredAgentOutcomes(request.state)
                    .pipe(Effect.provide(managerLayer), Effect.mapError(mapFailure));
            return new Map(
              [...observations].map(([name, observed]) => [
                name,
                {
                  ...observed,
                  agentOutcomes: observed.agentOutcomes.map((verified) => {
                    const capability = capabilityOutcomes.find(
                      (outcome) => outcome.name === name && outcome.agentId === verified.agentId,
                    );
                    if (capability === undefined) return verified;
                    return capability.outcome === "current" || capability.outcome === "projected"
                      ? {
                          ...capability,
                          outcome: verified.outcome,
                          reasonCode:
                            verified.outcome === "blocked"
                              ? verified.reasonCode
                              : capability.reasonCode,
                          reason: `${capability.reason} ${verified.reason}`,
                          nativeUnitKeys: verified.nativeUnitKeys,
                        }
                      : { ...capability, nativeUnitKeys: verified.nativeUnitKeys };
                  }),
                },
              ]),
            );
          }),
        subagent: (request: ConfiguredAgentOutcomesRequest) =>
          Effect.gen(function* () {
            const manager = subagents;
            const refs = yield* manager.listMaterializable();
            const rows = yield* Effect.forEach(request.rows, (row) =>
              Effect.gen(function* () {
                const authored = refs.find((candidate) => candidate.subagent.name === row.name);
                const accepted =
                  authored === undefined
                    ? yield* usableAcceptedCanonicalRef({ type: "subagent", name: row.name })
                    : Option.none();
                const ref =
                  authored ??
                  (Option.isSome(accepted) && accepted.value.type === "subagent"
                    ? accepted.value
                    : undefined);
                const observed =
                  ref === undefined ? undefined : yield* manager.projectionObservation(ref);
                const locations = (observed?.nativeLocations ?? []).map(
                  (unit): NativeLocationOutcome => ({
                    ...unit,
                    state:
                      unit.ownership === "absent"
                        ? "absent"
                        : unit.state === "unchanged" && unit.ownership === "owned"
                          ? "unchanged"
                          : "blocked",
                  }),
                );
                return [row.name, fromNative(request, row.name, locations)] as const;
              }),
            );
            return new Map<string, ConfiguredExtensionObservation>(rows);
          }).pipe(Effect.provide(managerLayer), Effect.mapError(mapFailure)),
        "mcp-server": (request: ConfiguredAgentOutcomesRequest) =>
          Effect.gen(function* () {
            const location = yield* WorkspaceLocation;
            const settings = yield* SettingsReader;
            const graph = yield* (yield* DesiredStateReader).graph();
            const entries = yield* settings.entries("mcp-server");
            const rows = yield* Effect.forEach(request.rows, (row) =>
              Effect.gen(function* () {
                const node = graph.nodes.find(
                  (node) => node.type === "mcp-server" && node.name === row.name,
                );
                if (node === undefined)
                  return [row.name, { agentOutcomes: [], nativeLocations: [] }] as const;
                const path = yield* Path.Path;
                const layout = yield* Ref.get(location.layout);
                const accepted = yield* (yield* LockfileReader).acceptedEntry(
                  "mcp-server",
                  row.name,
                );
                const canonicalPaths =
                  row.paths ??
                  (Option.isSome(accepted)
                    ? [
                        computeExtensionPathsForLayout(
                          path.join,
                          layout,
                          extensionPathSourceFromLockEntry(accepted.value),
                          "mcps",
                          accepted.value.identity.name,
                        ).canonicalPath,
                      ]
                    : layout.scope === "project"
                      ? [path.join(layout.authoredRoot("mcp-server"), row.name)]
                      : []);
                const inspection = yield* inspectDesiredMcpServer({
                  workspaceRoot: location.baseDir,
                  scope: location.scope,
                  nativeDirectoryInputs: location.nativeDirectoryInputs,
                  agentIds: request.agentIds,
                  node,
                  entry: entries[row.name],
                  canonicalPaths,
                  state: request.state,
                });
                return [
                  row.name,
                  {
                    agentOutcomes: inspection.outcomes.map((outcome) => ({
                      ...outcome,
                      nativeUnitKeys: inspection.nativeLocations
                        .filter((unit) => unit.configuredConsumers.includes(outcome.agentId))
                        .map(nativeUnitKey),
                    })),
                    nativeLocations: inspection.nativeLocations,
                  },
                ] as const;
              }),
            );
            return new Map<string, ConfiguredExtensionObservation>(rows);
          }).pipe(
            Effect.provide(managerLayer),
            Effect.mapError(
              (cause) =>
                new ConfiguredAgentOutcomesUnavailable({
                  category: "validation",
                  detail: "Native MCP locations could not be verified",
                  cause,
                }),
            ),
          ),
        skill: (request: ConfiguredAgentOutcomesRequest) =>
          observeConfiguredSkillLocations(request).pipe(
            Effect.provide(managerLayer),
            Effect.mapError(
              (cause) =>
                new ConfiguredAgentOutcomesUnavailable({
                  category: "validation",
                  detail: "Native Skill locations could not be verified",
                  cause,
                }),
            ),
          ),
      },
    };
  }),
);
