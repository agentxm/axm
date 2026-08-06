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
import { CommandManager, type CommandExtensionRef } from "@agentxm/client-core/unstable/commands";
import { FilesManager, type FilesExtensionRef } from "@agentxm/client-core/unstable/files";
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
  parseExtensionFqnParts,
  toLabel,
} from "@agentxm/client-core/unstable/extensions";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import type { PackExtensionTarget, ExtensionTarget } from "@agentxm/client-core/unstable/workspace";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { count } from "@agentxm/client-core/unstable/cli-renderer";
import { expandGlob } from "@agentxm/client-core/unstable/utils";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/** Raw handler args from the CLI parser. */
export interface UninstallPackHandlerArgs {
  readonly name: string;
}

/** Parsed and validated pack uninstall args. */
export interface ParsedPackUninstallArgs {
  readonly packNames: ReadonlyArray<string>;
  readonly isGlob: boolean;
  readonly earlyExit: boolean;
}

/**
 * Intent for the pack uninstall command.
 * Supports multiple packs for glob expansion.
 */
export interface UninstallPackCommandIntent {
  readonly packsToUninstall: ReadonlyArray<PackExtensionTarget>;
}

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
    const commandMgr = yield* CommandManager;
    const contextManager = yield* FilesManager;
    const hookManager = yield* HookManager;
    const knowledgeManager = yield* KnowledgeManager;
    const mcpServerMgr = yield* McpServerManager;
    const ruleManager = yield* RuleManager;
    const subagentMgr = yield* SubagentManager;

    const parseArgs = (args: UninstallPackHandlerArgs) =>
      Effect.gen(function* () {
        const graph = yield* ws.getDesiredStateGraph();
        if (!graph.complete) {
          return yield* makeAppError({
            code: "validation",
            detail: "Cannot uninstall packs while the desired pack graph is incomplete",
          });
        }
        const requested = parseExtensionFqnParts(args.name);
        if (requested !== undefined && requested.type !== "pack") {
          return yield* makeAppError({
            code: "validation",
            detail: `Expected a pack identity, received ${args.name}`,
          });
        }
        const requestedName = requested?.name ?? args.name;
        const isGlob = requestedName.includes("*");
        const packNames = expandGlob(
          requestedName,
          graph.nodes.filter((node) => node.type === "pack").map((node) => node.name),
        );

        // Handle glob matching zero packs
        if (isGlob && packNames.length === 0) {
          return { packNames: [], isGlob, earlyExit: true };
        }

        // For literal names not in lockfile, still build a target
        const names = packNames.length > 0 ? packNames : [requestedName];

        return { packNames: names, isGlob, earlyExit: false };
      });

    const finalizeIntent = (parsed: ParsedPackUninstallArgs) =>
      Effect.gen(function* () {
        if (parsed.earlyExit) {
          return { packsToUninstall: [] };
        }

        const graph = yield* ws.getDesiredStateGraph();
        if (!graph.complete) {
          return yield* makeAppError({
            code: "validation",
            detail: "Cannot uninstall packs while the desired pack graph is incomplete",
          });
        }

        const targets = yield* Effect.forEach(
          parsed.packNames,
          (name): Effect.Effect<PackExtensionTarget, AppError> => {
            const node = graph.nodes.find(
              (candidate) => candidate.type === "pack" && candidate.name === name,
            );
            const identity = node === undefined ? undefined : parseExtensionFqnParts(node.identity);
            if (node !== undefined && identity?.type === "pack") {
              return Effect.succeed({
                type: "pack",
                name: node.name,
                owner: identity.owner,
              } satisfies PackExtensionTarget);
            }

            return Effect.fail(
              makeAppError({
                code: "not_found",
                detail: `Pack "${name}" is not installed`,
                suggestions: [
                  {
                    description: `Use the fully-qualified \`@owner/packs/${name}\` form, or inspect installed packs.`,
                    cmd: "axm packs list",
                  },
                ],
              }),
            );
          },
        );

        return { packsToUninstall: targets };
      });

    const buildUninstallPlan = (intent: UninstallPackCommandIntent) =>
      Effect.gen(function* () {
        if (intent.packsToUninstall.length === 0) {
          return {
            _tag: "Plan",
            name: "Uninstall packs",
            description: Option.none(),
            jobs: [{ concurrency: 1 as const, steps: [] }],
          } satisfies Plan;
        }

        const retentionPolicy = makeWorkspaceRetentionPolicy(ws);

        const graph = yield* ws.getDesiredStateGraph();
        if (!graph.complete) {
          return yield* makeAppError({
            code: "validation",
            detail: "Cannot uninstall packs while the desired pack graph is incomplete",
          });
        }
        const allTargets = new Map<string, ExtensionTarget>();
        for (const pack of intent.packsToUninstall) {
          allTargets.set(`pack:${pack.name}`, pack);
        }
        const removingPackIdentities = new Set(
          graph.nodes
            .filter(
              (node) =>
                node.type === "pack" &&
                intent.packsToUninstall.some((pack) => pack.name === node.name),
            )
            .map((node) => node.identity),
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

        // Order: pack targets first, then dependency targets
        const packTargets = [...allTargets.values()].filter((t) => t.type === "pack");
        const depTargets = [...allTargets.values()].filter((t) => t.type !== "pack");
        const orderedTargets = [...packTargets, ...depTargets];

        const steps = orderedTargets.map((target): PlannedJobStep => {
          if (target.type === "pack") {
            return buildUninstallOperation<PackRef>(packMgr, retentionPolicy, { target });
          }

          if (target.type === "skill") {
            return buildUninstallOperation<SkillExtensionRef>(skillMgr, retentionPolicy, {
              target,
            });
          }

          if (target.type === "command") {
            return buildUninstallOperation<CommandExtensionRef>(commandMgr, retentionPolicy, {
              target,
            });
          }

          if (target.type === "mcp-server") {
            return buildUninstallOperation<McpServerExtensionRef>(mcpServerMgr, retentionPolicy, {
              target,
            });
          }

          if (target.type === "subagent") {
            return buildUninstallOperation<SubagentExtensionRef>(subagentMgr, retentionPolicy, {
              target,
            });
          }

          if (target.type === "files") {
            return buildUninstallOperation<FilesExtensionRef>(contextManager, retentionPolicy, {
              target,
            });
          }

          if (target.type === "rule") {
            return buildUninstallOperation<RuleExtensionRef>(ruleManager, retentionPolicy, {
              target,
            });
          }

          if (target.type === "hook") {
            return buildUninstallOperation<HookExtensionRef>(hookManager, retentionPolicy, {
              target,
            });
          }

          if (target.type === "knowledge") {
            return buildUninstallOperation<KnowledgeExtensionRef>(
              knowledgeManager,
              retentionPolicy,
              { target },
            );
          }

          return {
            label: toLabel(target),
            readiness: "error",
            errorMessage: "Unsupported dependency type",
          };
        });

        return {
          _tag: "Plan",
          name:
            intent.packsToUninstall.length === 0
              ? "Uninstall packs"
              : intent.packsToUninstall.length === 1
                ? "Uninstall pack"
                : `Uninstall ${count(intent.packsToUninstall.length, "pack")}`,
          description: Option.none(),
          jobs: [{ concurrency: 1 as const, steps }],
        } satisfies Plan;
      });

    return {
      parseArgs,
      finalizeIntent,
      buildUninstallPlan,
    };
  }),
);
