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
import {
  DesiredStateReader,
  LockfileReader,
  WorkspaceLocation,
} from "../../../desired-state/index.js";

import * as Option from "effect/Option";

import { HookManager } from "../../../materialization/index.js";
import { buildUninstallOperation } from "../../../reconciliation/index.js";
import type {
  JobStepArtifact,
  JobStepArtifactTarget,
  Plan,
} from "../../../transitions/planning/index.js";
import {
  acquiredExtensionDisplayPathFromLockEntry,
  type HookExtensionTarget,
  type HookLockEntry,
} from "../../../desired-state/index.js";

import type { ExtensionLifecycleFailed } from "../../../lifecycle/errors.js";
import { lifecycleStepFailure } from "../../../lifecycle/step-failure.js";
import {
  installRefused,
  type InstallStepRequirements,
} from "../../../lifecycle/install/vocabulary.js";
import { makeWorkspaceRetentionPolicy } from "../../../reconciliation/index.js";
import type { HookUninstallIntent } from "../../../lifecycle/uninstall/vocabulary.js";
import {
  acquiredRootDisplayPath,
  lockfileDisplayPath,
  settingsDisplayPath,
} from "../../../desired-state/index.js";

const hookUninstallArtifactTargets = (
  entry: Option.Option<HookLockEntry>,
  retained: boolean,
  targetName: string,
  scope: JobStepArtifact["scope"],
): ReadonlyArray<JobStepArtifactTarget> => {
  if (Option.isNone(entry)) return [];
  const sourcePath = acquiredExtensionDisplayPathFromLockEntry(
    acquiredRootDisplayPath(scope),
    entry.value,
    "hooks",
    targetName,
  );
  return [
    { path: lockfileDisplayPath(scope), change: "updated" },
    { path: settingsDisplayPath(scope), change: "updated" },
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
  const location = yield* WorkspaceLocation;
  const desiredState = yield* DesiredStateReader;
  const lockfile = yield* LockfileReader;
  const hookManager = yield* HookManager;
  const retentionPolicy = makeWorkspaceRetentionPolicy(desiredState, lifecycleStepFailure);

  const steps = yield* Effect.forEach(intent.targets, (target) =>
    Effect.gen(function* () {
      const lockEntry = yield* lockfile
        .entry("hook", target.name)
        .pipe(Effect.catch(() => Effect.succeed(Option.none())));
      return buildUninstallOperation(hookManager, retentionPolicy, {
        target,
        toStepFailure: lifecycleStepFailure,
        buildArtifact: ({ settlement }) => {
          const retained = settlement.canonical !== "removed";
          const targets = hookUninstallArtifactTargets(
            lockEntry,
            retained,
            target.name,
            location.scope,
          );
          return Effect.succeed({
            path: retained
              ? settingsDisplayPath(location.scope)
              : lockfileDisplayPath(location.scope),
            scope: location.scope,
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
