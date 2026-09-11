/**
 * Uninstalling a hooks package.
 *
 * A hooks package whose canonical content is kept on disk is reported as
 * retained, from the settlement the removal returns rather than from the
 * sentence it printed.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { HookManager, buildUninstallOperation } from "@agentxm/extension-materialization";
import type { JobStepArtifact, JobStepArtifactTarget, Plan } from "@agentxm/workspace-operations";
import {
  WorkspaceMutations,
  acquiredExtensionDisplayPathFromLockEntry,
  type HookExtensionTarget,
  type HookLockEntry,
} from "@agentxm/workspace-state";

import type { ExtensionLifecycleFailed } from "../../errors.js";
import { lifecycleStepFailure } from "../../step-failure.js";
import { installRefused, type InstallStepRequirements } from "../../install/vocabulary.js";
import { makeWorkspaceRetentionPolicy } from "../../uninstall/retention-policy.js";
import type { HookUninstallIntent } from "../../uninstall/vocabulary.js";
import {
  workspaceCanonicalRoot,
  workspaceLockfilePath,
  workspaceSettingsPath,
} from "../../workspace-paths.js";

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

/** Settle whether this hooks package has anything to remove. */
export const parseHookUninstallRequest: (
  selector: string,
) => Effect.Effect<
  HookUninstallIntent,
  ExtensionLifecycleFailed,
  InstallStepRequirements | HookManager
> = Effect.fn("UninstallExtensions.parseHookRequest")(function* (selector: string) {
  const hookManager = yield* HookManager;
  const target: HookExtensionTarget = { type: "hook", name: selector.trim() };
  return yield* Effect.gen(function* () {
    const configured =
      hookManager.getConfiguredSource === undefined
        ? Option.none<string>()
        : yield* hookManager.getConfiguredSource({ target });
    const installed = yield* hookManager.isInstalled({ target });
    return Option.isNone(configured) && !installed
      ? ({ targets: [] } satisfies HookUninstallIntent)
      : ({ targets: [target] } satisfies HookUninstallIntent);
  }).pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: `Hooks package "${target.name}" declaration could not be read`,
        cause,
      }),
    ),
  );
});

/** The closures a settled hooks-package removal becomes. */
export const planHookUninstall: (
  intent: HookUninstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | HookManager
> = Effect.fn("UninstallExtensions.planHooks")(function* (intent: HookUninstallIntent) {
  const ws = yield* WorkspaceMutations;
  const hookManager = yield* HookManager;
  const retentionPolicy = makeWorkspaceRetentionPolicy(ws);

  const steps = yield* Effect.forEach(intent.targets, (target) =>
    Effect.gen(function* () {
      const lockEntry = yield* ws
        .getLockedHookEntry(target.name)
        .pipe(Effect.catch(() => Effect.succeed(Option.none())));
      return buildUninstallOperation(hookManager, retentionPolicy, {
        target,
        toStepFailure: lifecycleStepFailure,
        buildArtifact: ({ settlement }) => {
          const retained = settlement.canonical !== "removed";
          const targets = hookUninstallArtifactTargets(lockEntry, retained, target.name, ws.scope);
          return Effect.succeed({
            path: retained ? workspaceSettingsPath(ws.scope) : workspaceLockfilePath(ws.scope),
            scope: ws.scope,
            change: retained ? "updated" : "removed",
            ...(targets.length === 0 ? {} : { fileCount: targets.length, targets }),
          } satisfies JobStepArtifact);
        },
      });
    }),
  );

  return {
    _tag: "Plan",
    name: "Uninstall hooks",
    description: Option.some("Uninstall hooks package"),
    jobs: [{ concurrency: 1, steps }],
  } satisfies Plan<InstallStepRequirements>;
});
