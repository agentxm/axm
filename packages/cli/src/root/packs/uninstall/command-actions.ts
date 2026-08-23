/**
 * Pack uninstall command workflow actions.
 *
 * Implements `UninstallExtensionCommandWorkflowActions` for the pack uninstall
 * command. The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { SkillManager, type SkillExtensionRef } from "@agentxm/client-core/unstable/skills";
import { PackManager, type PackRef } from "@agentxm/client-core/unstable/packs";
import { HookManager, type HookExtensionRef } from "@agentxm/client-core/unstable/hooks";
import {
  KnowledgeManager,
  type KnowledgeExtensionRef,
} from "@agentxm/client-core/unstable/knowledge";
import { McpServerManager, type McpServerExtensionRef } from "@agentxm/client-core/unstable/mcps";
import { RuleManager, type RuleExtensionRef } from "@agentxm/client-core/unstable/rules";
import {
  SubagentManager,
  type SubagentExtensionRef,
} from "@agentxm/client-core/unstable/subagents";
import {
  buildUninstallOperation,
  decodeDesiredExtensionIdentity,
  parseExtensionFqnParts,
  toLabel,
  type DesiredPackageAuthority,
  type ExtensionFqnParts,
  type ExtensionName,
  type Handle,
} from "@agentxm/client-core/unstable/extensions";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import type {
  DesiredStateGraph,
  ExtensionTarget,
  PackExtensionTarget,
} from "@agentxm/client-core/unstable/workspace";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { count } from "@agentxm/client-core/unstable/cli-renderer";
import { expandGlob } from "@agentxm/client-core/unstable/utils";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import {
  operationPresentation,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";
import { buildAggregateProjectionStep } from "../../shared/aggregate-projection-step.js";
import { buildAtomicPackGraphStep, validatePackGraphPostcondition } from "../graph-transition.js";
import { PACK_UNINSTALL_GRAPH_BLOCKER_ID, planPackUninstallGraphReadiness } from "./readiness.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/** Raw handler args from the CLI parser. */
export interface UninstallPackHandlerArgs {
  readonly name: string;
}

/** Parsed and validated pack uninstall args. */
export type PackUninstallSelector =
  | {
      readonly _tag: "ExactFqn";
      readonly identity: ExtensionFqnParts & { readonly type: "pack" };
    }
  | {
      readonly _tag: "SimpleName";
      readonly name: string;
    };

export interface ParsedPackUninstallArgs {
  readonly selectors: ReadonlyArray<PackUninstallSelector>;
}

export interface ResolvedPackUninstallTarget extends PackExtensionTarget {
  readonly owner: Handle;
  readonly name: ExtensionName;
  readonly authority: DesiredPackageAuthority;
  readonly desiredIdentity: string;
}

/**
 * Intent for the pack uninstall command.
 * Supports multiple packs for glob expansion.
 */
export interface UninstallPackCommandIntent {
  readonly packsToUninstall: ReadonlyArray<ResolvedPackUninstallTarget>;
}

const identityValidationError = (identity: string) =>
  makeAppError({
    code: "validation",
    detail: `Configured pack identity ${identity} is invalid`,
  });

export const validateResolvedPackUninstallTargets = (
  graph: DesiredStateGraph,
  targets: ReadonlyArray<ResolvedPackUninstallTarget>,
): Effect.Effect<void, ReturnType<typeof makeAppError>> =>
  Effect.gen(function* () {
    for (const expected of targets) {
      const current = graph.nodes.find(
        (candidate) => candidate.type === "pack" && candidate.name === expected.name,
      );
      if (current === undefined) {
        return yield* makeAppError({
          code: "conflict",
          detail: `Pack ${expected.desiredIdentity} changed or was removed before uninstall`,
          recover: "Inspect the current pack state, then retry the uninstall.",
          cmd: `axm packs show ${expected.name}`,
        });
      }

      const decoded = decodeDesiredExtensionIdentity(current.identity);
      if (decoded === undefined || decoded.type !== "pack") {
        return yield* identityValidationError(current.identity);
      }

      if (
        current.identity !== expected.desiredIdentity ||
        decoded.authority !== expected.authority ||
        decoded.owner !== expected.owner ||
        decoded.name !== expected.name
      ) {
        return yield* makeAppError({
          code: "conflict",
          detail: `Pack ${expected.desiredIdentity} changed or was removed before uninstall`,
          recover: "Inspect the current pack state, then retry the uninstall.",
          cmd: `axm packs show ${expected.name}`,
        });
      }
    }
  });

const uninstallPresentation = operationPresentation(
  { imperative: "uninstall", past: "Uninstalled", gerund: "Uninstalling" },
  "pack",
);

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class UninstallPackCommandWorkflowActions extends ServiceMap.Service<
  UninstallPackCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    UninstallPackHandlerArgs,
    ParsedPackUninstallArgs,
    UninstallPackCommandIntent
  >
>()("axm.sh/root/packs/uninstall/command-actions/UninstallPackCommandWorkflowActions") {}

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

/**
 * Constructs the actions by resolving all services at layer-build time.
 * Each action method closes over the captured services so `R = never`.
 */
export const UninstallPackCommandWorkflowActionsLive = Layer.effect(
  UninstallPackCommandWorkflowActions,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const packMgr = yield* PackManager;
    const skillMgr = yield* SkillManager;
    const hookManager = yield* HookManager;
    const knowledgeManager = yield* KnowledgeManager;
    const mcpServerMgr = yield* McpServerManager;
    const ruleManager = yield* RuleManager;
    const subagentMgr = yield* SubagentManager;

    const parseArgs = (args: UninstallPackHandlerArgs) =>
      Effect.gen(function* () {
        const graph = yield* ws.getDesiredStateGraph();
        const requested = parseExtensionFqnParts(args.name);
        if (requested !== undefined && requested.type !== "pack") {
          return yield* makeAppError({
            code: "validation",
            detail: `Expected a pack identity, received ${args.name}`,
          });
        }
        if (requested !== undefined) {
          return {
            selectors: [
              {
                _tag: "ExactFqn",
                identity: {
                  owner: requested.owner,
                  type: "pack",
                  name: requested.name,
                },
              },
            ],
          } satisfies ParsedPackUninstallArgs;
        }

        if (!args.name.includes("*")) {
          return {
            selectors: [{ _tag: "SimpleName", name: args.name }],
          } satisfies ParsedPackUninstallArgs;
        }

        const names = expandGlob(
          args.name,
          graph.nodes.filter((node) => node.type === "pack").map((node) => node.name),
        );
        return {
          selectors: names.map((name) => ({ _tag: "SimpleName", name })),
        } satisfies ParsedPackUninstallArgs;
      });

    const finalizeIntent = (parsed: ParsedPackUninstallArgs) =>
      Effect.gen(function* () {
        const graph = yield* ws.getDesiredStateGraph();

        const targets = new Map<string, ResolvedPackUninstallTarget>();
        for (const selector of parsed.selectors) {
          const name = selector._tag === "ExactFqn" ? selector.identity.name : selector.name;
          const candidates = graph.nodes.filter(
            (candidate) => candidate.type === "pack" && candidate.name === name,
          );
          for (const node of candidates) {
            const identity = decodeDesiredExtensionIdentity(node.identity);
            if (identity === undefined || identity.type !== "pack") {
              return yield* identityValidationError(node.identity);
            }
            if (selector._tag === "ExactFqn" && identity.owner !== selector.identity.owner) {
              continue;
            }
            targets.set(node.identity, {
              type: "pack",
              name: identity.name,
              owner: identity.owner,
              authority: identity.authority,
              desiredIdentity: node.identity,
            });
          }
        }

        return { packsToUninstall: [...targets.values()] };
      });

    const buildUninstallPlan = (intent: UninstallPackCommandIntent) =>
      Effect.gen(function* () {
        const observedGraph = yield* ws.getDesiredStateGraph();
        const graphReadiness = planPackUninstallGraphReadiness(
          observedGraph,
          intent.packsToUninstall.map((pack) => pack.desiredIdentity),
        );
        if (graphReadiness.readiness === "blocked") {
          return {
            _tag: "Plan",
            name: "Uninstall packs",
            description: Option.some("Pack graph readiness prevents this uninstall."),
            presentation: uninstallPresentation,
            jobs: [
              {
                concurrency: 1,
                steps: [
                  {
                    readiness: "error",
                    label:
                      intent.packsToUninstall.map((pack) => pack.desiredIdentity).join(", ") ||
                      "Pack graph",
                    errorMessage: graphReadiness.detail,
                    blockingConditionIds: [PACK_UNINSTALL_GRAPH_BLOCKER_ID],
                    artifact: {
                      path: "pack graph",
                      scope: ws.scope,
                      change: "unchanged",
                      fileCount: 0,
                      targets: graphReadiness.facts.flatMap((fact) =>
                        fact.authoritativeLocations.map((path) => ({
                          path,
                          change: "unchanged" as const,
                        })),
                      ),
                    },
                  },
                ],
              },
            ],
            riskConditions: [
              {
                level: "blocked",
                id: PACK_UNINSTALL_GRAPH_BLOCKER_ID,
                detail: graphReadiness.detail,
                errorCode: "conflict",
              },
            ],
          } satisfies Plan;
        }
        const graph = graphReadiness.graph;

        if (intent.packsToUninstall.length === 0) {
          return {
            _tag: "Plan",
            name: "Uninstall packs",
            description: Option.none(),
            presentation: uninstallPresentation,
            jobs: [{ concurrency: 1 as const, steps: [] }],
          } satisfies Plan;
        }

        const retentionPolicy = makeWorkspaceRetentionPolicy(ws);
        const exclusiveMemberPolicy = {
          isRequiredByInstalledPack: () => Effect.succeed(false),
        };

        const allTargets = new Map<string, ExtensionTarget>();
        for (const pack of intent.packsToUninstall) {
          allTargets.set(`pack:${pack.name}`, pack);
        }
        const removingPackIdentities = new Set(
          intent.packsToUninstall.map((pack) => pack.desiredIdentity),
        );
        for (const node of graph.nodes) {
          if (node.type === "pack") continue;
          const removedOrigin = node.origins.some(
            (origin) => origin.type === "pack" && removingPackIdentities.has(origin.pack),
          );
          if (!removedOrigin) continue;
          const retainedOrigin = node.origins.some(
            (origin) =>
              origin.type === "settings" ||
              (origin.type === "pack" && !removingPackIdentities.has(origin.pack)),
          );
          if (retainedOrigin) continue;
          allTargets.set(`${node.type}:${node.name}`, {
            type: node.type,
            name: node.name,
          });
        }

        // Remove members while their pack-derived desired state is still
        // observable, then retire the owning pack.
        const packTargets = [...allTargets.values()].filter((t) => t.type === "pack");
        const depTargets = [...allTargets.values()].filter((t) => t.type !== "pack");
        const orderedTargets = [...depTargets, ...packTargets];
        const sourcePathByTarget = new Map(
          graph.nodes.map((node) => [
            `${node.type}:${node.name}`,
            `.axm/extensions/${
              node.identity.startsWith("workspace:")
                ? node.identity.slice("workspace:".length)
                : node.identity
            }`,
          ]),
        );

        const steps = orderedTargets.map((target): PlannedJobStep => {
          if (target.type === "pack") {
            return buildUninstallOperation<PackRef>(packMgr, retentionPolicy, { target });
          }

          if (target.type === "skill") {
            return buildUninstallOperation<SkillExtensionRef>(skillMgr, exclusiveMemberPolicy, {
              target,
            });
          }

          if (target.type === "mcp-server") {
            return buildUninstallOperation<McpServerExtensionRef>(
              mcpServerMgr,
              exclusiveMemberPolicy,
              {
                target,
              },
            );
          }

          if (target.type === "subagent") {
            return buildUninstallOperation<SubagentExtensionRef>(
              subagentMgr,
              exclusiveMemberPolicy,
              {
                target,
              },
            );
          }

          if (target.type === "rule") {
            return buildUninstallOperation<RuleExtensionRef>(ruleManager, exclusiveMemberPolicy, {
              target,
              skipProjections: true,
            });
          }

          if (target.type === "hook") {
            return buildUninstallOperation<HookExtensionRef>(hookManager, exclusiveMemberPolicy, {
              target,
              skipProjections: true,
            });
          }

          if (target.type === "knowledge") {
            return buildUninstallOperation<KnowledgeExtensionRef>(
              knowledgeManager,
              exclusiveMemberPolicy,
              { target, skipProjections: true },
            );
          }

          return {
            label: toLabel(target),
            readiness: "error",
            errorMessage: "Unsupported dependency type",
          };
        });

        const projectionStep = yield* buildAggregateProjectionStep({
          types: new Set(orderedTargets.map((target) => target.type)),
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              Layer.succeed(RuleManager, ruleManager),
              Layer.succeed(HookManager, hookManager),
              Layer.succeed(KnowledgeManager, knowledgeManager),
            ),
          ),
        );
        const graphStep = yield* buildAtomicPackGraphStep({
          label: count(intent.packsToUninstall.length, "pack"),
          message: `Uninstalled ${count(intent.packsToUninstall.length, "pack")} and ${count(depTargets.length, "exclusive member")}`,
          artifact: {
            path: "pack graph",
            scope: ws.scope,
            change: "removed",
            fileCount: orderedTargets.length,
            targets: orderedTargets.map((target) => ({
              path: sourcePathByTarget.get(`${target.type}:${target.name}`) ?? toLabel(target),
              change: "removed",
            })),
          },
          children: [
            ...steps.map((step) => ({ step, coverage: "ineligible" as const })),
            ...Option.toArray(projectionStep).map((step) => ({
              step,
              coverage: "ineligible" as const,
            })),
          ],
          preTransition: Effect.gen(function* () {
            const currentGraph = yield* ws.getDesiredStateGraph();
            yield* validateResolvedPackUninstallTargets(currentGraph, intent.packsToUninstall);
          }),
          validate: validatePackGraphPostcondition({ absent: orderedTargets }),
        }).pipe(Effect.provideService(WorkspaceMutations, ws));

        return {
          _tag: "Plan",
          name:
            intent.packsToUninstall.length === 0
              ? "Uninstall packs"
              : intent.packsToUninstall.length === 1
                ? "Uninstall pack"
                : `Uninstall ${count(intent.packsToUninstall.length, "pack")}`,
          description: Option.none(),
          presentation: uninstallPresentation,
          jobs: [{ concurrency: 1, steps: [graphStep] }],
        } satisfies Plan;
      });

    return {
      parseArgs,
      finalizeIntent,
      buildUninstallPlan,
    };
  }),
);
