import * as ServiceMap from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { HookManager, type HookExtensionRef } from "@agentxm/client-core/unstable/hooks";
import {
  EXTERNAL_EXTENSIONS_DIR,
  REGISTRY_EXTENSIONS_DIR,
  buildUninstallOperation,
} from "@agentxm/client-core/unstable/extensions";
import type { HookLockEntry } from "@agentxm/client-core/unstable/lockfile";
import type {
  JobStepArtifact,
  JobStepArtifactTarget,
  JobStepResult,
  Plan,
  PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import type { HookExtensionTarget } from "@agentxm/client-core/unstable/workspace";
import { WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/client-core/unstable/workflows";
import type { UninstallHookCommandIntent } from "./intent.js";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";

export interface UninstallHookHandlerArgs {
  readonly name: string;
}

export interface ParsedHookUninstallArgs {
  readonly name: string;
}

const hookUninstallArtifactTargets = (
  entry: Option.Option<HookLockEntry>,
  retained: boolean,
  targetName: string,
): ReadonlyArray<JobStepArtifactTarget> => {
  if (Option.isNone(entry)) return [];
  const sourcePath =
    entry.value.type === "registry"
      ? `${REGISTRY_EXTENSIONS_DIR}/${entry.value.owner}/hooks/${entry.value.name}`
      : `${EXTERNAL_EXTENSIONS_DIR}/hooks/${targetName}`;
  const materializedTargets = [...(entry.value.materializedTargets ?? [])]
    .sort((left, right) => left.target.localeCompare(right.target))
    .map(
      (target): JobStepArtifactTarget => ({
        path: target.target,
        change: retained ? "unchanged" : "updated",
      }),
    );
  return [
    { path: ".axm/axm-lock.yaml", change: "updated" },
    { path: ".axm/settings.json", change: "updated" },
    { path: sourcePath, change: retained ? "unchanged" : "removed" },
    ...materializedTargets,
  ];
};

const hookUninstallArtifact = (args: {
  readonly scope: JobStepArtifact["scope"];
  readonly lockEntry: Option.Option<HookLockEntry>;
  readonly targetName: string;
  readonly result: JobStepResult;
}): JobStepArtifact => {
  const retained =
    args.result.result === "success" && args.result.message.startsWith("Kept on disk");
  const targets = hookUninstallArtifactTargets(args.lockEntry, retained, args.targetName);
  return {
    path: retained ? ".axm/settings.json" : ".axm/axm-lock.yaml",
    scope: args.scope,
    change: retained ? "updated" : "removed",
    ...(targets.length === 0 ? {} : { fileCount: targets.length, targets }),
  };
};

const withHookUninstallArtifact = (args: {
  readonly step: PlannedJobStep;
  readonly scope: JobStepArtifact["scope"];
  readonly targetName: string;
  readonly ws: typeof WorkspaceMutations.Service;
}): PlannedJobStep => {
  const step = args.step;
  if (step.readiness === "error") return step;
  return {
    ...step,
    run: Effect.gen(function* () {
      const lockEntry = yield* args.ws.getLockedHookEntry(args.targetName);
      const result = yield* step.run;
      if (result.result !== "success") return result;
      return {
        ...result,
        artifact: hookUninstallArtifact({
          scope: args.scope,
          lockEntry,
          targetName: args.targetName,
          result,
        }),
      };
    }),
  };
};

export class UninstallHookCommandWorkflowActions extends ServiceMap.Service<
  UninstallHookCommandWorkflowActions,
  UninstallExtensionCommandWorkflowActions<
    UninstallHookHandlerArgs,
    ParsedHookUninstallArgs,
    UninstallHookCommandIntent
  >
>()("axm.sh/root/hooks/uninstall/command-actions/UninstallHookCommandWorkflowActions") {}

export const UninstallHookCommandWorkflowActionsLive = Layer.effect(
  UninstallHookCommandWorkflowActions,
  Effect.gen(function* () {
    const ws = yield* WorkspaceMutations;
    const hookManager = yield* HookManager;

    const parseArgs = (args: UninstallHookHandlerArgs) =>
      Effect.succeed({ name: args.name.trim() });

    const finalizeIntent = (
      parsed: ParsedHookUninstallArgs,
    ): Effect.Effect<UninstallHookCommandIntent, AppError> =>
      Effect.gen(function* () {
        const locked = yield* ws.getLockedHookEntry(parsed.name);
        const configured = yield* ws.getConfiguredHookEntries();
        if (Option.isNone(locked) && configured[parsed.name] === undefined) {
          return yield* makeAppError({
            code: "not_found",
            detail: `hooks package "${parsed.name}" is not installed`,
          });
        }
        const target: HookExtensionTarget = { type: "hook", name: parsed.name };
        return { targets: [target] };
      });

    const buildUninstallPlan = (
      intent: UninstallHookCommandIntent,
    ): Effect.Effect<Plan, AppError> =>
      Effect.succeed({
        _tag: "Plan",
        name: "Uninstall hooks",
        description: Option.some("Uninstall hooks package"),
        jobs: [
          {
            concurrency: 1,
            steps: intent.targets.map((target) =>
              withHookUninstallArtifact({
                step: buildUninstallOperation<HookExtensionRef>(
                  hookManager,
                  makeWorkspaceRetentionPolicy(ws),
                  { target },
                ),
                scope: ws.scope,
                targetName: target.name,
                ws,
              }),
            ),
          },
        ],
      } satisfies Plan);

    return {
      parseArgs,
      finalizeIntent,
      buildUninstallPlan,
    };
  }),
);
