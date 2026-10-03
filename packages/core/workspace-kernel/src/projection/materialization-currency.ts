/**
 * Whether the observed native output for one desired node is already current.
 *
 * Currency is judged from the workspace inventory plus the projection facts
 * for the node's per-agent unit: the decoded native MCP entries for an MCP
 * server, the effective Skill directory for a Skill, the rendered profile
 * observation for a Subagent. Aggregate units (rules, hooks, Knowledge) are
 * judged by reading their unit back, so canonical presence alone decides them
 * here.
 *
 * The subagent observation arrives as an input, not a manager: projection
 * never reaches back into the capability that materializes a unit.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import {
  WorkspaceLocation,
  type WorkspaceLocationService,
  type WorkspaceRecordsService,
  type DesiredExtensionNode,
  type McpServerEntry,
  type WorkspaceStateReadFailure,
  type ExtensionInventory,
} from "../workspace-state/index.js";
import {
  NativeWriteRefused,
  McpSharedTargetConflict,
  type CodingAgentFailure,
} from "../agent-adapters/index.js";
import type { McpInspectionError } from "./mcps/errors.js";
import {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "./agents/coding-agent-repository.js";
import type { NativeLocationOutcome } from "../locations/index.js";
import { observeConfiguredSkillLocations } from "./skill-location-observation.js";
import { inspectDesiredMcpServer } from "./mcps/inspection.js";
import type {
  ProjectionParticipantRequirements,
  SubagentProjectionObserver,
} from "./participants.js";

/** Everything judging currency for one node may fail with. */
export type MaterializationCurrencyFailure<E> =
  E | WorkspaceStateReadFailure | McpInspectionError | CodingAgentFailure;

export interface ObservedMaterializationCurrencyArgs<E> {
  readonly location: WorkspaceLocationService;
  readonly records: WorkspaceRecordsService;
  /** Inventory observed once for this planning phase, when available. */
  readonly inventory?: ExtensionInventory;
  readonly node: DesiredExtensionNode;
  /** The settings entry under an MCP node's name, when the workspace configures one. */
  readonly mcpServerEntry?: McpServerEntry | undefined;
  readonly configuredAgentIds: ReadonlyArray<string>;
  readonly agents: CodingAgentRepositoryService;
  /** The owner's readback for one rendered subagent profile. */
  readonly subagents: SubagentProjectionObserver<E>;
  readonly resolvedRef: ExtensionRef;
  /** Known source bytes for a first-acquisition preview; never an ownership claim. */
  readonly subagentSourceRoot?: string;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
}

export const observeMaterializationCurrency = <E>({
  location,
  records,
  inventory,
  node,
  mcpServerEntry,
  configuredAgentIds: configuredAgents,
  agents: agentRepo,
  subagents: observeSubagent,
  resolvedRef,
  subagentSourceRoot,
  fs,
  path,
}: ObservedMaterializationCurrencyArgs<E>): Effect.Effect<
  { readonly current: boolean; readonly nativeLocations: ReadonlyArray<NativeLocationOutcome> },
  MaterializationCurrencyFailure<E>,
  ProjectionParticipantRequirements
> =>
  (inventory === undefined
    ? records.getExtensionInventory(node.type, {
        ...(configuredAgents.length > 0 &&
        (node.type === "skill" || node.type === "mcp-server" || node.type === "subagent")
          ? { agents: configuredAgents }
          : {}),
      })
    : Effect.succeed(inventory)
  ).pipe(
    Effect.flatMap(
      (
        inventory,
      ): Effect.Effect<
        {
          readonly current: boolean;
          readonly nativeLocations: ReadonlyArray<NativeLocationOutcome>;
        },
        MaterializationCurrencyFailure<E>,
        ProjectionParticipantRequirements
      > => {
        const observed = inventory.items.find((item) => item.name === node.name && item.installed);
        if (observed === undefined) {
          if (resolvedRef.type !== "subagent" || subagentSourceRoot === undefined)
            return Effect.succeed({ current: false, nativeLocations: [] });
          return observeSubagent
            .projectionObservation(resolvedRef, { sourceRoot: subagentSourceRoot })
            .pipe(
              Effect.map((observation) => ({
                current: false,
                nativeLocations: (observation.nativeLocations ?? []).map(
                  (unit): NativeLocationOutcome => {
                    const { proof: _proof, ...facts } = unit;
                    return {
                      ...facts,
                      ownership: unit.ownership === "absent" ? "absent" : "unverified",
                      state: unit.ownership === "absent" ? "created" : "blocked",
                      ...(unit.ownership === "absent"
                        ? {}
                        : {
                            reason:
                              "An existing native entry requires accepted ownership verification before first acquisition.",
                          }),
                    };
                  },
                ),
              })),
            );
        }
        if (node.type !== "skill" && node.type !== "mcp-server" && node.type !== "subagent") {
          // Rule, hook, and knowledge outputs are aggregate units whose
          // currency is judged by reading the unit back (collectInstructionStep,
          // collectHooksStep, collectKnowledgeStep). Canonical presence decides
          // only whether this node needs canonical rematerialization.
          return Effect.succeed({ current: true, nativeLocations: [] });
        }
        if (configuredAgents.length === 0 && node.type !== "skill")
          return Effect.succeed({ current: true, nativeLocations: [] });
        if (node.type === "subagent") {
          return resolvedRef.type === "subagent"
            ? observeSubagent.projectionObservation(resolvedRef).pipe(
                Effect.map(({ current, nativeLocations }) => ({
                  current,
                  nativeLocations: nativeLocations ?? [],
                })),
              )
            : Effect.succeed({ current: false, nativeLocations: [] });
        }
        if (node.type === "mcp-server") {
          // Disabled connections retain canonical content but need no invocation.
          // The agent-output closure withdraws owned entries using enabled names.
          if (!node.enabled) return Effect.succeed({ current: true, nativeLocations: [] });
          // Every MCP connection, however it entered desired state, is judged
          // by the decoded native entries against the plan the writer renders.
          return inspectDesiredMcpServer({
            nativeDirectoryInputs: location.nativeDirectoryInputs,
            workspaceRoot: location.baseDir,
            scope: location.scope,
            agentIds: configuredAgents,
            node,
            entry: mcpServerEntry,
            canonicalPaths: observed.paths,
          }).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
            // A shared-target conflict has no write that could resolve it, so
            // it is a planning fact, not a stale projection to rematerialize.
            Effect.flatMap(({ current, conflict, nativeLocations }) =>
              Option.match(conflict, {
                onNone: () => Effect.succeed({ current, nativeLocations }),
                onSome: (reason) => Effect.fail(new McpSharedTargetConflict({ reason })),
              }),
            ),
          );
        }
        return observeConfiguredSkillLocations({
          type: "skill",
          scope: location.scope,
          agentIds: configuredAgents,
          state: "current",
          rows: [
            {
              name: node.name,
              installed: observed.installed,
              targetState: node.enabled ? "enabled" : "disabled",
              paths: observed.paths,
            },
          ],
        }).pipe(
          Effect.mapError((cause) => new NativeWriteRefused({ path: location.baseDir, cause })),
          Effect.provideService(WorkspaceLocation, location),
          Effect.provideService(CodingAgentRepository, agentRepo),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
          Effect.map((observations) => {
            const observation = observations.get(node.name);
            const nativeLocations = observation?.nativeLocations ?? [];
            return {
              current:
                nativeLocations.length > 0 &&
                nativeLocations
                  .filter(
                    (unit) => unit.policyReasons.length > 0 || unit.configuredConsumers.length > 0,
                  )
                  .every((unit) => unit.ownership === "owned" && unit.state === "unchanged"),
              nativeLocations,
            };
          }),
        );
      },
    ),
  );
