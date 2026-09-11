/**
 * Re-materializing what desired state already accepted.
 *
 * A retained transition — re-enabling a Pack whose members were left on disk
 * — must never re-resolve a source. The accepted resolution and the canonical
 * content it names are the only inputs: if that content is not usable the
 * transition refuses rather than silently reaching for the network, because
 * "enable what you already have" and "acquire something new" are different
 * decisions with different risk.
 *
 * This lives in the materialization capability, not in a feature, because
 * both the workspace sync sweep and Pack activation re-materialize accepted
 * content, and a feature may not import a peer feature.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import type { ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import {
  CodingAgentRepository,
  isObservedMaterializationCurrent,
  type ProjectionParticipantRequirements,
} from "@agentxm/workspace-projection";
import {
  acceptedCanonicalObservation,
  acceptedResolutionRef,
  isSourcedDesiredExtension,
  usableAcceptedCanonical,
  WorkspaceMutations,
  type DesiredExtensionNode,
} from "@agentxm/workspace-state";
import type { JobStepResult, PlannedJobStep, StepFailure } from "@agentxm/workspace-operations";

import { RetainedContentUnusable } from "./errors.js";
import type { ExtensionManagerFailure } from "../errors.js";
import { ExtensionManagers } from "../manager-registry.js";
import type { ManagerRequirements } from "../manager-contract.js";
import {
  buildMaterializeOperation,
  targetFromRef,
  toStepKey,
  type RecipeRequirements,
  type StepFailureAdapter,
} from "../extensions/operations.js";
import { SubagentManager } from "../managers.js";

/** Services a retained materialize step needs when it runs. */
export type RetainedMaterializeRequirements =
  | CodingAgentRepository
  | ExtensionManagers
  | ManagerRequirements
  | RecipeRequirements
  | SubagentManager
  | WorkspaceMutations;

/**
 * How an MCP server member is re-projected. MCP servers are realized into
 * each agent's native configuration rather than into a canonical tree, so the
 * caller hands in the install operation it already owns.
 */
export type RunRetainedMcpServerInstall<R> = (args: {
  readonly ref: McpServerExtensionRef;
}) => Effect.Effect<JobStepResult, StepFailure, R>;

export interface RetainedMaterializeSteps<R> {
  /** Every accepted ref the selection covers, whether or not it needs work. */
  readonly refs: ReadonlyArray<ExtensionRef>;
  readonly steps: ReadonlyArray<PlannedJobStep<R | RetainedMaterializeRequirements>>;
}

/** Every failure deciding retained re-materialization can surface. */
export type RetainedMaterializeFailure = RetainedContentUnusable | ExtensionManagerFailure;

/**
 * Build the steps that bring the given desired nodes back to their accepted
 * materialization. Nodes whose projections are already current contribute no
 * step, so a retained transition that changes nothing plans nothing.
 */
export const collectRetainedMaterializeSteps = <R = never>(args: {
  readonly nodes: ReadonlyArray<DesiredExtensionNode>;
  readonly runMcpServerInstall: RunRetainedMcpServerInstall<R>;
  readonly adapter: StepFailureAdapter;
}): Effect.Effect<
  RetainedMaterializeSteps<R>,
  RetainedMaterializeFailure,
  | CodingAgentRepository
  | ExtensionManagers
  | FileSystem.FileSystem
  | Path.Path
  | ProjectionParticipantRequirements
  | SubagentManager
  | WorkspaceMutations
> =>
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const agentRepo = yield* CodingAgentRepository;
    const managers = yield* ExtensionManagers;
    const subagentManager = yield* SubagentManager;
    const configuredAgentIds = yield* ws.getConfiguredAgents();

    const selected = args.nodes
      .filter(isSourcedDesiredExtension)
      .filter((node) => node.enabled && node.type !== "pack");

    const reconciled = yield* Effect.forEach(
      selected,
      (node) =>
        Effect.gen(function* () {
          const canonical = yield* acceptedCanonicalObservation({
            workspace: ws,
            type: node.type,
            name: node.name,
          });
          const status = Option.isSome(canonical)
            ? canonical.value.observation.status
            : ("missing-resolution" as const);
          const usable =
            status === "usable"
              ? yield* usableAcceptedCanonical({
                  workspace: ws,
                  type: node.type,
                  name: node.name,
                })
              : Option.none<{ readonly ref: ExtensionRef }>();
          const ref: Option.Option<ExtensionRef> = Option.isSome(usable)
            ? Option.some(usable.value.ref)
            : yield* acceptedResolutionRef({
                workspace: ws,
                type: node.type,
                name: node.name,
              });
          if (Option.isNone(ref)) {
            return yield* new RetainedContentUnusable({
              extensionType: node.type,
              name: node.name,
              status,
            });
          }
          const current = yield* isObservedMaterializationCurrent({
            workspace: ws,
            node,
            configuredAgentIds,
            agents: agentRepo,
            subagents: subagentManager,
            resolvedRef: ref.value,
            fs,
            path,
          });
          return { node, ref: ref.value, materialize: status !== "usable" || !current };
        }),
      { concurrency: "unbounded" },
    );

    const steps = reconciled
      .filter(({ materialize }) => materialize)
      .map(({ node, ref }): PlannedJobStep<R | RetainedMaterializeRequirements> => {
        if (ref.type === "mcp-server") {
          const target = targetFromRef(ref);
          return {
            key: toStepKey(target),
            label: `${node.type} ${node.name}`,
            readiness: "ready",
            run: args.runMcpServerInstall({ ref }),
          };
        }
        const common = {
          toStepFailure: args.adapter.toStepFailure,
          label: `${node.type} ${node.name}`,
          message: `Restored ${node.type} ${node.name}`,
        } as const;
        switch (ref.type) {
          case "skill":
            return buildMaterializeOperation(managers.skill, { ...common, ref });
          case "subagent":
            return buildMaterializeOperation(managers.subagent, { ...common, ref });
          case "rule":
            return buildMaterializeOperation(managers.rule, { ...common, ref });
          case "hook":
            return buildMaterializeOperation(managers.hook, { ...common, ref });
          case "knowledge":
            return buildMaterializeOperation(managers.knowledge, { ...common, ref });
          case "pack":
            return buildMaterializeOperation(managers.pack, { ...common, ref });
        }
      });

    return { refs: reconciled.map(({ ref }) => ref), steps };
  });
