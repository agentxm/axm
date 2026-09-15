/**
 * Uninstalling a rule.
 *
 * A rule that is neither declared nor installed has nothing to remove, so the
 * request settles to an empty target list rather than a refusal.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { RuleManager } from "../../../materialization/index.js";
import { buildUninstallOperation } from "../../../reconciliation/index.js";
import type { Plan } from "../../../transitions/planning/index.js";
import { DesiredStateReader, type RuleExtensionTarget } from "../../../desired-state/index.js";

import type { ExtensionLifecycleFailed } from "../../../lifecycle/errors.js";
import { lifecycleStepFailure } from "../../../lifecycle/step-failure.js";
import {
  installRefused,
  type InstallStepRequirements,
} from "../../../lifecycle/install/vocabulary.js";
import { makeWorkspaceRetentionPolicy } from "../../../reconciliation/index.js";
import type { RuleUninstallIntent } from "../../../lifecycle/uninstall/vocabulary.js";

/** Settle whether this rule has anything to remove. */
export const parseRuleUninstallRequest: (
  selector: string,
) => Effect.Effect<
  RuleUninstallIntent,
  ExtensionLifecycleFailed,
  InstallStepRequirements | RuleManager
> = Effect.fn("UninstallExtensions.parseRuleRequest")(function* (selector: string) {
  const ruleManager = yield* RuleManager;
  const target: RuleExtensionTarget = { type: "rule", name: selector.trim() };
  return yield* Effect.gen(function* () {
    const configured =
      ruleManager.getConfiguredSource === undefined
        ? Option.none<string>()
        : yield* ruleManager.getConfiguredSource({ target });
    const installed = yield* ruleManager.isInstalled({ target });
    return Option.isNone(configured) && !installed
      ? ({ targets: [] } satisfies RuleUninstallIntent)
      : ({ targets: [target] } satisfies RuleUninstallIntent);
  }).pipe(
    Effect.mapError((cause) =>
      installRefused({
        category: "internal",
        detail: `Rule "${target.name}" declaration could not be read`,
        cause,
      }),
    ),
  );
});

/** The closures a settled rule removal becomes. */
export const planRuleUninstall: (
  intent: RuleUninstallIntent,
) => Effect.Effect<
  Plan<InstallStepRequirements>,
  ExtensionLifecycleFailed,
  InstallStepRequirements | RuleManager
> = Effect.fn("UninstallExtensions.planRules")(function* (intent: RuleUninstallIntent) {
  const desiredState = yield* DesiredStateReader;
  const ruleManager = yield* RuleManager;
  const retentionPolicy = makeWorkspaceRetentionPolicy(desiredState, lifecycleStepFailure);
  return {
    _tag: "Plan",
    name: "Uninstall rule",
    description: Option.some("Uninstall rule"),
    jobs: [
      {
        concurrency: 1,
        steps: intent.targets.map((target) =>
          buildUninstallOperation(ruleManager, retentionPolicy, {
            target,
            toStepFailure: lifecycleStepFailure,
          }),
        ),
      },
    ],
  } satisfies Plan<InstallStepRequirements>;
});
