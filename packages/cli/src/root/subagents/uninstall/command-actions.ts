/**
 * Subagent uninstall command workflow actions.
 *
 * Implements `UninstallExtensionCommandWorkflowActions` for the subagent uninstall
 * command. The live layer captures all required services at construction time
 * so action methods satisfy the `R = never` contract.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { resolveInstalledIdentifierNameOrInput } from "@agentxm/client-core/unstable/source-resolution";
import { expandGlob } from "@agentxm/client-core/unstable/utils";
import { SubagentManager } from "@agentxm/client-core/unstable/subagents";
import {
  buildUninstallOperation,
  type UninstallRetentionPolicy,
} from "@agentxm/client-core/unstable/extensions";
import type { SubagentExtensionTarget } from "@agentxm/client-core/unstable/workspace";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { AppError } from "@agentxm/client-core/unstable/app-error";
import type { Plan, PlannedJobStep } from "@agentxm/client-core/unstable/plan";
import type { UninstallSubagentCommandIntent } from "./intent.js";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Raw handler args for the uninstall command.
 */
export interface UninstallSubagentHandlerArgs {
  /** Name or glob pattern of the subagent to uninstall */
  readonly subagent: string;
}

/**
 * Parsed and validated subagent uninstall arguments.
 */
export interface ParsedSubagentUninstallArgs {
  readonly subagents: ReadonlyArray<string>;
}

// -----------------------------------------------------------------------------
// Service Tag
// -----------------------------------------------------------------------------

export class UninstallSubagentCommandWorkflowActions extends ServiceMap.Service<
  UninstallSubagentCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    UninstallSubagentHandlerArgs,
    ParsedSubagentUninstallArgs,
    UninstallSubagentCommandIntent
  >
>()("axm.sh/root/subagents/uninstall/command-actions/UninstallSubagentCommandWorkflowActions") {}

// -----------------------------------------------------------------------------
// Live Layer
// -----------------------------------------------------------------------------

/**
 * Constructs the actions by resolving all services at layer-build time.
 * Each action method closes over the captured services so `R = never`.
 */
export const UninstallSubagentCommandWorkflowActionsLive = Layer.effect(
  UninstallSubagentCommandWorkflowActions,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const renderer = yield* CliRenderer;
    const subagentMgr = yield* SubagentManager;

    const parseArgs = (
      args: UninstallSubagentHandlerArgs,
    ): Effect.Effect<ParsedSubagentUninstallArgs, AppError> =>
      Effect.gen(function* () {
        yield* renderer.info("axm subagents uninstall");

        // Load installed subagents for glob expansion
        const lockedSubagents = yield* ws.getLockedSubagents();
        const installedNames = Object.keys(lockedSubagents);

        // Expand glob pattern against installed subagent names
        const subagentNames = expandGlob(args.subagent, installedNames);

        // Handle glob matching zero subagents
        if (args.subagent.includes("*") && subagentNames.length === 0) {
          yield* renderer.warn(`No subagents matched pattern "${args.subagent}"`);
          yield* renderer.success("Nothing to uninstall.");
          return { subagents: [] } satisfies ParsedSubagentUninstallArgs;
        }

        const names =
          subagentNames.length > 0
            ? subagentNames
            : [
                yield* resolveInstalledIdentifierNameOrInput({
                  input: args.subagent,
                  resourceType: "subagent",
                }).pipe(Effect.provideService(WorkspaceMutations, ws)),
              ];

        return { subagents: names } satisfies ParsedSubagentUninstallArgs;
      });

    const finalizeIntent = (
      parsed: ParsedSubagentUninstallArgs,
    ): Effect.Effect<UninstallSubagentCommandIntent, AppError> =>
      Effect.succeed({
        subagentsToUninstall: parsed.subagents.map((subagentName) => ({ subagentName })),
      } satisfies UninstallSubagentCommandIntent);

    const buildUninstallPlan = (
      intent: UninstallSubagentCommandIntent,
    ): Effect.Effect<Plan, AppError> =>
      Effect.succeed(
        (() => {
          const retentionPolicy: UninstallRetentionPolicy = {
            isRequiredByInstalledPack: (policyArgs) =>
              ws.isExtensionRequiredByInstalledPack(policyArgs.target),
            markDependencyRetainedInLockfile: (policyArgs) =>
              ws.markDependencyRetainedInLockfile(policyArgs.target),
          };

          const steps: PlannedJobStep[] = intent.subagentsToUninstall.map((entry) => {
            const target: SubagentExtensionTarget = {
              type: "subagent" as const,
              name: entry.subagentName,
            };
            return buildUninstallOperation(subagentMgr, retentionPolicy, { target });
          });

          return {
            _tag: "Plan",
            name: "Uninstall subagent(s)",
            description: Option.none(),
            jobs: [
              {
                concurrency: 1 as const,
                steps,
              },
            ],
          } satisfies Plan;
        })(),
      );

    return {
      parseArgs,
      finalizeIntent,
      buildUninstallPlan,
    };
  }),
);
