/**
 * Installing hooks packages.
 *
 * A hook becomes observable through each agent's own hook configuration, so
 * its planned artifact is the set of configured-agent outcomes, and an agent
 * that cannot accept the hook blocks the closure rather than failing mid-way.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { LockfileReader, WorkspaceLocation } from "../../../desired-state/index.js";

import * as Option from "effect/Option";

import { HookManager } from "../../../materialization/index.js";
import {
  buildInstallOperation,
  forecastInstallChange,
  type InstallArtifactPresentation,
} from "../../../reconciliation/index.js";
import type { HookExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/hook";
import { HOOK_EXTENSION_DIR } from "@agentxm/extension-model/unstable/hooks/manifest-schema";
import {
  operationPresentation,
  type JobStepArtifact,
  type JobStepArtifactTarget,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "../../../transitions/planning/index.js";
import { applyInstructionSurfacePlans } from "../../../projection/index.js";
import {
  acquiredExtensionDisplayPath,
  acquiredExtensionDisplayPathFromLockEntry,
  acquiredRootDisplayPath,
  lockEntryVersion,
  type ArtifactChange,
  type ConfiguredAgentOutcome,
  type HookLockEntry,
} from "../../../desired-state/index.js";

import type { ExtensionLifecycleFailed } from "../../../lifecycle/errors.js";
import { lifecycleStepFailure } from "../../../lifecycle/step-failure.js";
import {
  installRefused,
  type HookInstallIntent,
  type InstallStepRequirements,
} from "../../../lifecycle/install/vocabulary.js";

const hookRefArtifactPath = (ref: HookExtensionRef, scope: JobStepArtifact["scope"]): string =>
  ref.refType === "workspace"
    ? ref.location
    : acquiredExtensionDisplayPath(
        acquiredRootDisplayPath(scope),
        ref,
        HOOK_EXTENSION_DIR,
        ref.name,
      );

const hookInstallArtifactPath = (entry: HookLockEntry, scope: JobStepArtifact["scope"]): string =>
  acquiredExtensionDisplayPathFromLockEntry(
    acquiredRootDisplayPath(scope),
    entry,
    HOOK_EXTENSION_DIR,
    entry.identity.name,
  );

/** What an applied hook install presents, from its accepted lock entry. */
export const hookInstallArtifact = (args: {
  readonly lockEntry: HookLockEntry;
  readonly scope: JobStepArtifact["scope"];
  readonly agents: ReadonlyArray<string>;
  readonly targets: ReadonlyArray<JobStepArtifactTarget>;
  readonly agentOutcomes?: ReadonlyArray<ConfiguredAgentOutcome>;
}): InstallArtifactPresentation => {
  const version = lockEntryVersion(args.lockEntry);
  return {
    path: hookInstallArtifactPath(args.lockEntry, args.scope),
    scope: args.scope,
    agents: args.agents,
    ...(version === undefined ? {} : { version }),
    ...(args.agentOutcomes === undefined ? {} : { agentOutcomes: args.agentOutcomes }),
    ...(args.targets.length === 0 ? {} : { fileCount: args.targets.length, targets: args.targets }),
  };
};

/** The closures a settled hook intent becomes. */
export const planHookInstall: (
  intent: HookInstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | HookManager
> = Effect.fn("InstallExtensions.planHooks")(function* (intent: HookInstallIntent) {
  const location = yield* WorkspaceLocation;
  const lockfile = yield* LockfileReader;
  const hookManager = yield* HookManager;
  const deferProjections = intent.deferProjections === true || intent.refs.length > 1;
  const memberSteps = yield* Effect.forEach(
    intent.refs,
    ({ ref, versionRange }) =>
      Effect.gen(function* () {
        const installedBefore = yield* hookManager.isInstalled({
          target: { type: "hook", name: ref.hook.name },
        });
        const agentOutcomes =
          hookManager.configuredAgentOutcomesForRef === undefined
            ? []
            : yield* hookManager.configuredAgentOutcomesForRef(ref, "projected");
        const previewPath = hookRefArtifactPath(ref, location.scope);
        // The planner forecasts the change; execution replaces the forecast
        // with what the transition observed.
        const forecast: ArtifactChange = forecastInstallChange({ installedBefore });
        const previewArtifact = {
          path: previewPath,
          scope: location.scope,
          agents: agentOutcomes
            .filter(({ outcome }) => outcome !== "blocked")
            .map(({ agentId }) => agentId),
          ...(ref.refType === "registry" || ref.refType === "workspace"
            ? { version: ref.version }
            : {}),
          change: forecast,
          agentOutcomes,
          targets: Array.from(
            new Map(
              agentOutcomes.flatMap((outcome) =>
                outcome.path === undefined
                  ? []
                  : [
                      [
                        outcome.path,
                        {
                          path: outcome.path,
                          change: forecast,
                          agentIds: agentOutcomes
                            .filter(({ path }) => path === outcome.path)
                            .map(({ agentId }) => agentId),
                        },
                      ] as const,
                    ],
              ),
            ).values(),
          ),
        } satisfies JobStepArtifact;
        const operation = buildInstallOperation(hookManager, {
          toStepFailure: lifecycleStepFailure,
          ref,
          declaration: { name: ref.hook.name, versionRange },
          ...(deferProjections
            ? { enclosingClosure: { projections: [ref.type], postconditions: [] } }
            : {}),
          message: `Installed ${ref.hook.name}`,
          buildArtifact: ({ change }) =>
            Effect.gen(function* () {
              const materialization = yield* hookManager.aggregateProjectionObservation;
              const appliedOutcomes =
                hookManager.configuredAgentOutcomesForRef === undefined
                  ? []
                  : yield* hookManager.configuredAgentOutcomesForRef(ref, "current");
              const currentLockEntry = yield* lockfile
                .entry("hook", ref.hook.name)
                .pipe(Effect.catch(() => Effect.succeed(Option.none())));
              if (Option.isNone(currentLockEntry)) {
                const path = hookRefArtifactPath(ref, location.scope);
                return {
                  path,
                  scope: location.scope,
                  ...(ref.refType === "registry" || ref.refType === "workspace"
                    ? { version: ref.version }
                    : {}),
                  agents: materialization.agents,
                  agentOutcomes: appliedOutcomes,
                  targets:
                    materialization.targets.length === 0
                      ? [{ path, change }]
                      : materialization.targets.map((target) => ({ ...target, change })),
                } satisfies InstallArtifactPresentation;
              }
              return hookInstallArtifact({
                lockEntry: currentLockEntry.value,
                scope: location.scope,
                agents: materialization.agents,
                agentOutcomes: appliedOutcomes,
                targets: materialization.targets.map((target) => ({ ...target, change })),
              });
            }),
        });
        // An agent that cannot accept this hook is a projection fact, so the
        // closure is refused before it writes rather than failing part-way.
        const blocked = agentOutcomes.filter(({ outcome }) => outcome === "blocked");
        if (blocked.length > 0) {
          return {
            ...(operation.key === undefined ? {} : { key: operation.key }),
            label: operation.label,
            readiness: "error",
            errorMessage: blocked.map(({ agentId, reason }) => `${agentId}: ${reason}`).join("; "),
            artifact: previewArtifact,
          } satisfies PlannedJobStep<InstallStepRequirements>;
        }
        return {
          ...operation,
          artifact: previewArtifact,
        } satisfies PlannedJobStep<InstallStepRequirements>;
      }).pipe(
        Effect.mapError((cause) =>
          installRefused({
            category: "internal",
            detail: `Hook install planning failed for ${ref.hook.name}`,
            cause,
          }),
        ),
      ),
    { concurrency: 1 },
  );
  const projectionSteps: ReadonlyArray<PlannedJobStep<InstallStepRequirements>> =
    deferProjections && intent.deferProjections !== true
      ? [
          {
            key: "projection:hook:units",
            label: "hook projections",
            readiness: "ready",
            run: hookManager
              .projectionPlans()
              .pipe(Effect.flatMap(applyInstructionSurfacePlans))
              .pipe(
                Effect.mapError(lifecycleStepFailure),
                Effect.as({
                  result: "success",
                  message: "Rendered installed Hooks from the complete contributor set",
                } satisfies JobStepResult),
              ),
          },
        ]
      : [];
  return {
    _tag: "Plan",
    name: "Install hooks",
    description: Option.some("Install hooks package"),
    presentation: operationPresentation(
      { imperative: "install", past: "Installed", gerund: "Installing" },
      "hook",
    ),
    jobs: [{ concurrency: 1, steps: [...memberSteps, ...projectionSteps] }],
  } satisfies Plan<InstallStepRequirements>;
});
