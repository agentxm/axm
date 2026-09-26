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

import {
  NO_MATERIALIZATION_OBSERVATION,
  SubagentManager,
} from "@agentxm/workspace-kernel/materialization";
import {
  buildInstallOperation,
  kernelFailureToStepFailure,
  type InstallStepRequirements,
  type ResolvedInstallRef,
} from "@agentxm/workspace-kernel/reconciliation";
import {
  operationPresentation,
  type Plan,
  type ExtensionLifecycleFailed,
  installRefused,
} from "@agentxm/workspace-kernel/operations";

import { prepareSubagentInstallations } from "../application/installation.js";
import { subagentInstallationFacts } from "../adapters/installation.js";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";

/** Subagents the request selected, and whether to re-materialize regardless. */
export interface SubagentInstallIntent {
  readonly subagentsToInstall: ReadonlyArray<ResolvedInstallRef<SubagentExtensionRef>>;
  readonly force?: boolean;
}

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
      toStepFailure: kernelFailureToStepFailure,
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
