/**
 * Installing rules.
 *
 * The source grammar a rule request accepts, the discovery that turns it into
 * refs, and the closure each ref becomes — including who renders the shared
 * instructions region when more than one rule lands in the same operation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import { WorkspaceLocation } from "../../../desired-state/index.js";

import * as Option from "effect/Option";

import { RuleManager } from "../../../materialization/index.js";
import {
  buildInstallOperation,
  type InstallArtifactPresentation,
} from "../../../reconciliation/index.js";
import {
  operationPresentation,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "../../../transitions/planning/index.js";
import { applyInstructionSurfacePlans } from "../../../projection/index.js";

import type { ExtensionLifecycleFailed } from "../../../lifecycle/errors.js";
import { lifecycleStepFailure } from "../../../lifecycle/step-failure.js";
import {
  type InstallStepRequirements,
  type RuleInstallIntent,
} from "../../../lifecycle/install/vocabulary.js";

/** The closures a settled rule intent becomes. */
export const planRuleInstall: (
  intent: RuleInstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | RuleManager
> = Effect.fn("InstallExtensions.planRules")(function* (intent: RuleInstallIntent) {
  const location = yield* WorkspaceLocation;
  const ruleManager = yield* RuleManager;
  // One rule renders the shared instructions region itself; several rules in
  // one operation defer it so the region is rendered once, from the complete
  // contributor set.
  const deferProjections = intent.deferProjections === true || intent.refs.length > 1;
  const memberSteps = intent.refs.map(({ ref, versionRange }) =>
    buildInstallOperation(ruleManager, {
      toStepFailure: lifecycleStepFailure,
      ref,
      declaration: { name: ref.rule.name, versionRange },
      ...(deferProjections
        ? { enclosingClosure: { projections: [ref.type], postconditions: [] } }
        : {}),
      buildArtifact: ({ change }) =>
        Effect.gen(function* () {
          const materialization = yield* ruleManager.aggregateProjectionObservation;
          const targets = materialization.targets.map((target) => ({
            path: target.path,
            change,
            ...(target.agentIds === undefined ? {} : { agentIds: target.agentIds }),
          }));
          return {
            path: targets[0]?.path ?? ref.rule.name,
            scope: location.scope,
            agents: materialization.agents,
            ...(ref.refType === "registry" ? { version: ref.version } : {}),
            ...(targets.length === 0 ? {} : { fileCount: targets.length, targets }),
          } satisfies InstallArtifactPresentation;
        }),
    }),
  );
  const projectionSteps: ReadonlyArray<PlannedJobStep<InstallStepRequirements>> =
    deferProjections && intent.deferProjections !== true
      ? [
          {
            key: "projection:rule:instructions-region",
            label: "rule projections",
            readiness: "ready",
            run: ruleManager
              .projectionPlans()
              .pipe(Effect.flatMap(applyInstructionSurfacePlans))
              .pipe(
                Effect.mapError(lifecycleStepFailure),
                Effect.as({
                  result: "success",
                  message: "Rendered installed Rules from the complete contributor set",
                } satisfies JobStepResult),
              ),
          },
        ]
      : [];
  return {
    _tag: "Plan",
    name: "Install rules",
    description: Option.some("Install rule"),
    presentation: operationPresentation(
      { imperative: "install", past: "Installed", gerund: "Installing" },
      "rule",
    ),
    jobs: [{ concurrency: 1, steps: [...memberSteps, ...projectionSteps] }],
  } satisfies Plan<InstallStepRequirements>;
});
