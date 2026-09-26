/**
 * Installing subagents.
 *
 * A subagent is rendered into each configured agent's own subagents
 * directory, so a user-scope workspace can only hold one when every
 * configured agent has a user-scope placement to render into.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { NO_MATERIALIZATION_OBSERVATION, SubagentManager } from "../../../materialization/index.js";
import { buildInstallOperation } from "../../../reconciliation/index.js";
import { operationPresentation, type Plan } from "../../../transitions/planning/index.js";

import type { ExtensionLifecycleFailed } from "../../../lifecycle/errors.js";
import { lifecycleStepFailure } from "../../../lifecycle/step-failure.js";
import {
  installRefused,
  type InstallStepRequirements,
  type SubagentInstallIntent,
} from "../../../lifecycle/install/vocabulary.js";
import { prepareSubagentInstallations } from "../application/installation.js";
import { subagentInstallationFacts } from "../adapters/installation.js";

/** The closures a settled subagent intent becomes. */
export const planSubagentInstall: (
  intent: SubagentInstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | SubagentManager
> = Effect.fn("InstallExtensions.planSubagents")(function* (intent: SubagentInstallIntent) {
  const subagentManager = yield* SubagentManager;
  const prepared = yield* prepareSubagentInstallations(
    subagentInstallationFacts,
    intent.subagentsToInstall,
  ).pipe(
    Effect.catchTag("SubagentPlacementUnavailable", (error) =>
      installRefused({ category: "validation", detail: error.reason }),
    ),
  );
  const steps = prepared.map((entry) =>
    buildInstallOperation(subagentManager, {
      toStepFailure: lifecycleStepFailure,
      ref: entry.ref,
      declaration: { name: entry.ref.subagent.name, versionRange: entry.versionRange },
      force: intent.force === true,
      buildArtifact: ({ change, materialization }) =>
        Effect.succeed(
          entry.buildArtifact({
            change,
            observation: Option.match(materialization, {
              onNone: () => NO_MATERIALIZATION_OBSERVATION,
              onSome: (facts) => facts.observation,
            }),
          }),
        ),
    }),
  );

  return {
    _tag: "Plan",
    name: intent.subagentsToInstall.length === 1 ? "Install subagent" : "Install subagents",
    description: Option.none(),
    presentation: operationPresentation(
      { imperative: "install", past: "Installed", gerund: "Installing" },
      "subagent",
    ),
    jobs: [{ concurrency: 1, steps }],
  } satisfies Plan<InstallStepRequirements>;
});
