/**
 * Installing Open Knowledge Format bundles.
 *
 * A bundle becomes discoverable through the shared discovery region, so
 * several bundles in one operation defer that render until every contributor
 * has landed.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { KnowledgeManager } from "../../../materialization/index.js";
import { buildInstallOperation } from "../../../reconciliation/index.js";
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
  type KnowledgeInstallIntent,
} from "../../../lifecycle/install/vocabulary.js";

/** The closures a settled knowledge intent becomes. */
export const planKnowledgeInstall: (
  intent: KnowledgeInstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | KnowledgeManager
> = Effect.fn("InstallExtensions.planKnowledge")(function* (intent: KnowledgeInstallIntent) {
  const manager = yield* KnowledgeManager;
  // One bundle renders the shared discovery region itself; several bundles in
  // one operation defer it so the region is rendered once, from the complete
  // contributor set.
  const deferProjections = intent.deferProjections === true || intent.refs.length > 1;
  const memberSteps = intent.refs.map(({ ref, versionRange }) =>
    buildInstallOperation(manager, {
      toStepFailure: lifecycleStepFailure,
      ref,
      declaration: { name: ref.knowledge.name, versionRange },
      ...(deferProjections
        ? { enclosingClosure: { projections: [ref.type], postconditions: [] } }
        : {}),
      message: `Installed ${ref.knowledge.name}`,
    }),
  );
  const projectionSteps: ReadonlyArray<PlannedJobStep<InstallStepRequirements>> =
    deferProjections && intent.deferProjections !== true
      ? [
          {
            key: "projection:knowledge:discovery-region",
            label: "knowledge projection",
            readiness: "ready",
            run: manager
              .projectionPlans()
              .pipe(Effect.flatMap(applyInstructionSurfacePlans))
              .pipe(
                Effect.mapError(lifecycleStepFailure),
                Effect.as({
                  result: "success",
                  message: "Rendered installed Knowledge bundles from the complete contributor set",
                } satisfies JobStepResult),
              ),
          },
        ]
      : [];
  return {
    _tag: "Plan",
    name: "Install knowledge",
    description: Option.some("Install Open Knowledge Format bundle"),
    presentation: operationPresentation(
      { imperative: "install", past: "Installed", gerund: "Installing" },
      "knowledge",
    ),
    jobs: [{ concurrency: 1, steps: [...memberSteps, ...projectionSteps] }],
  } satisfies Plan<InstallStepRequirements>;
});
