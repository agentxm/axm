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

import { KnowledgeManager } from "@agentxm/workspace-kernel/materialization";
import {
  buildInstallOperation,
  kernelFailureToStepFailure,
  type InstallStepRequirements,
  type ResolvedInstallRef,
} from "@agentxm/workspace-kernel/reconciliation";
import {
  operationPresentation,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
  type ExtensionLifecycleFailed,
} from "@agentxm/workspace-kernel/operations";
import { applyInstructionSurfacePlans } from "@agentxm/workspace-kernel/projection";

import type { KnowledgeExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/knowledge";

/** Knowledge bundles the request selected. */
export interface KnowledgeInstallIntent {
  /** The enclosing semantic closure owns the trailing aggregate projection. */
  readonly deferProjections?: boolean;
  readonly refs: ReadonlyArray<ResolvedInstallRef<KnowledgeExtensionRef>>;
}

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
      toStepFailure: kernelFailureToStepFailure,
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
                Effect.mapError(kernelFailureToStepFailure),
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
