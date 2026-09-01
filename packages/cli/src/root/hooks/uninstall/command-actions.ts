import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { AppError } from "@agentxm/extension-management/unstable/app-error";
import { toAppError } from "@agentxm/extension-management/unstable/app-error/conversions";
import { HookManager } from "@agentxm/extension-management/unstable/hooks";
import {
  type HookExtensionRef,
  acquiredExtensionDisplayPathFromLockEntry,
  type HookExtensionTarget,
  WorkspaceMutations,
} from "@agentxm/extension-management/unstable/workspace";
import { buildUninstallOperation } from "@agentxm/extension-management/unstable/extensions";
import type { HookLockEntry } from "@agentxm/extension-management/unstable/lockfile";
import type {
  JobStepArtifact,
  JobStepArtifactTarget,
  JobStepResult,
  Plan,
  PlannedJobStep,
} from "@agentxm/extension-management/unstable/plan";
import type { UninstallExtensionCommandWorkflowActions } from "@agentxm/extension-management/unstable/extension-lifecycle";
import type { UninstallHookCommandIntent } from "./intent.js";
import { makeWorkspaceRetentionPolicy } from "../../shared/workspace-retention-policy.js";
import {
  workspaceCanonicalRoot,
  workspaceLockfilePath,
  workspaceSettingsPath,
} from "../../shared/workspace-display-paths.js";

export interface UninstallHookHandlerArgs {
  readonly name: string;
}

export interface ParsedHookUninstallArgs {
  readonly name: string;
}

type UninstallHookActions = UninstallExtensionCommandWorkflowActions<
  UninstallHookHandlerArgs,
  ParsedHookUninstallArgs,
  UninstallHookCommandIntent
>;

const hookUninstallArtifactTargets = (
  entry: Option.Option<HookLockEntry>,
  retained: boolean,
  targetName: string,
  scope: JobStepArtifact["scope"],
): ReadonlyArray<JobStepArtifactTarget> => {
  if (Option.isNone(entry)) return [];
  const sourcePath = acquiredExtensionDisplayPathFromLockEntry(
    workspaceCanonicalRoot(scope),
    entry.value,
    "hooks",
    targetName,
  );
  return [
    { path: workspaceLockfilePath(scope), change: "updated" },
    { path: workspaceSettingsPath(scope), change: "updated" },
    { path: sourcePath, change: retained ? "unchanged" : "removed" },
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
  const targets = hookUninstallArtifactTargets(
    args.lockEntry,
    retained,
    args.targetName,
    args.scope,
  );
  return {
    path: retained ? workspaceSettingsPath(args.scope) : workspaceLockfilePath(args.scope),
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
      const lockEntry = yield* args.ws
        .getLockedHookEntry(args.targetName)
        .pipe(Effect.catch(() => Effect.succeed(Option.none())));
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

export const UninstallHookCommandWorkflowActions = Effect.gen(function* () {
  const ws = yield* WorkspaceMutations;
  const hookManager = yield* HookManager;

  const parseArgs = (args: UninstallHookHandlerArgs) => Effect.succeed({ name: args.name.trim() });

  const finalizeIntent = (
    parsed: ParsedHookUninstallArgs,
  ): Effect.Effect<UninstallHookCommandIntent, AppError> =>
    Effect.gen(function* () {
      const target: HookExtensionTarget = { type: "hook", name: parsed.name };
      const configured =
        hookManager.getConfiguredSource === undefined
          ? Option.none<string>()
          : yield* hookManager.getConfiguredSource({ target });
      const installed = yield* hookManager.isInstalled({ target });
      if (Option.isNone(configured) && !installed) {
        return { targets: [] };
      }
      return { targets: [target] };
    }).pipe(Effect.mapError(toAppError));

  const buildUninstallPlan = (intent: UninstallHookCommandIntent): Effect.Effect<Plan, AppError> =>
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
}).pipe(Effect.map((actions): UninstallHookActions => actions));
