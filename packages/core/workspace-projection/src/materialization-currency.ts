/**
 * Whether the observed native output for one desired node is already current.
 *
 * Currency is judged from the workspace inventory plus the projection facts
 * for the node's per-agent unit: managed MCP entries for an MCP server, the
 * effective Skill directory for a Skill, the rendered profile observation for
 * a Subagent. Aggregate units (rules, hooks, Knowledge) are judged by reading
 * their unit back, so canonical presence alone decides them here.
 *
 * The subagent observation arrives as an input, not a manager: projection
 * never reaches back into the capability that materializes a unit.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import {
  sanitizeName,
  WorkspaceMutations,
  type DesiredExtensionNode,
  type WorkspaceStateReadFailure,
} from "@agentxm/workspace-state";
import type { CodingAgentFailure } from "@agentxm/agent-integration";
import type { McpInspectionError } from "./mcps/errors.js";
import type { CodingAgentRepositoryService } from "./agents/coding-agent-repository.js";
import { collectManagedAgentMcpServers } from "./mcps/inspection.js";
import type {
  ProjectionParticipantRequirements,
  SubagentProjectionObserver,
} from "./participants.js";

/** Everything judging currency for one node may fail with. */
export type MaterializationCurrencyFailure<E> =
  E | WorkspaceStateReadFailure | McpInspectionError | CodingAgentFailure;

export interface ObservedMaterializationCurrencyArgs<E> {
  readonly workspace: ServiceMap.Service.Shape<typeof WorkspaceMutations>;
  readonly node: DesiredExtensionNode;
  readonly configuredAgentIds: ReadonlyArray<string>;
  readonly agents: CodingAgentRepositoryService;
  /** The owner's readback for one rendered subagent profile. */
  readonly subagents: SubagentProjectionObserver<E>;
  readonly resolvedRef: ExtensionRef;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
}

export const isObservedMaterializationCurrent = <E>({
  workspace: ws,
  node,
  configuredAgentIds: configuredAgents,
  agents: agentRepo,
  subagents: observeSubagent,
  resolvedRef,
  fs,
  path,
}: ObservedMaterializationCurrencyArgs<E>): Effect.Effect<
  boolean,
  MaterializationCurrencyFailure<E>,
  ProjectionParticipantRequirements
> =>
  ws.records
    .getExtensionInventory(node.type, {
      ...(configuredAgents.length > 0 &&
      (node.type === "skill" || node.type === "mcp-server" || node.type === "subagent")
        ? { agents: configuredAgents }
        : {}),
    })
    .pipe(
      Effect.flatMap(
        (
          inventory,
        ): Effect.Effect<
          boolean,
          MaterializationCurrencyFailure<E>,
          ProjectionParticipantRequirements
        > => {
          const observed = inventory.items.find(
            (item) => item.name === node.name && item.installed,
          );
          if (observed === undefined) return Effect.succeed(false);
          if (node.type !== "skill" && node.type !== "mcp-server" && node.type !== "subagent") {
            // Rule, hook, and knowledge outputs are aggregate units whose
            // currency is judged by reading the unit back (collectInstructionStep,
            // collectHooksStep, collectKnowledgeStep). Canonical presence decides
            // only whether this node needs canonical rematerialization.
            return Effect.succeed(true);
          }
          if (configuredAgents.length === 0 && node.type !== "skill") return Effect.succeed(true);
          if (node.type === "subagent") {
            return resolvedRef.type === "subagent"
              ? observeSubagent
                  .projectionObservation(resolvedRef)
                  .pipe(Effect.map(({ current }) => current))
              : Effect.succeed(false);
          }
          const hasProjectionOrigin = (() => {
            switch (node.type) {
              case "skill":
                return observed.origins.includes("agent-skill-dir");
              case "mcp-server":
                return (
                  observed.origins.includes("workspace-mcp-config") ||
                  observed.origins.includes("agent-mcp-config")
                );
              default:
                return true;
            }
          })();
          if (!hasProjectionOrigin) return Effect.succeed(false);
          if (node.type !== "skill") {
            if (node.type === "mcp-server") {
              return collectManagedAgentMcpServers({
                workspaceRoot: ws.baseDir,
                scope: ws.scope,
                agentIds: configuredAgents,
              }).pipe(
                Effect.provideService(FileSystem.FileSystem, fs),
                Effect.provideService(Path.Path, path),
                Effect.map((managed) =>
                  configuredAgents.every(
                    (agentId) =>
                      observed.agents.includes(agentId) ||
                      managed.some(
                        (entry) => entry.agentId === agentId && entry.serverName === node.name,
                      ),
                  ),
                ),
              );
            }
            return Effect.succeed(
              configuredAgents.every((agentId) => observed.agents.includes(agentId)),
            );
          }

          return agentRepo.all.pipe(
            Effect.flatMap((agents) => {
              const configured = agents.filter((agent) => configuredAgents.includes(agent.id));
              if (configured.length !== configuredAgents.length) return Effect.succeed(false);
              return Effect.forEach(
                configured,
                (agent) =>
                  agent.resolveEffectiveSkillsDir({ workspaceRoot: ws.baseDir }).pipe(
                    Effect.provideService(FileSystem.FileSystem, fs),
                    Effect.provideService(Path.Path, path),
                    Effect.map((outcome) => {
                      if (outcome._tag === "unsupported" || outcome._tag === "disabled")
                        return true;
                      if (outcome._tag === "misconfigured") return false;
                      const expectedPath = path.relative(
                        ws.baseDir,
                        path.join(outcome.dir, sanitizeName(node.name)),
                      );
                      return observed.paths.includes(expectedPath);
                    }),
                  ),
                { concurrency: "unbounded" },
              ).pipe(Effect.map((results) => results.every(Boolean)));
            }),
          );
        },
      ),
    );
