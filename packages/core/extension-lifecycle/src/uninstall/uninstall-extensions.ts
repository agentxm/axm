/**
 * Uninstalling extensions.
 *
 * One use case behind eight command spellings. `axm uninstall @owner/type/name`
 * reads the type from the FQN; `axm <type> uninstall <selector>` already knows
 * it. From there the decision is the same: which installed extensions the
 * selector names, whether each still has anything to withdraw, and what a
 * removal is allowed to delete.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  operationPresentation,
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type ConfiguredAgentOperation,
  type ExecutionCandidate,
  type OperationResolution,
  type Plan,
  type PlanExecution,
} from "@agentxm/workspace-operations";

import type { ExtensionLifecycleFailed } from "../errors.js";
import { parseHookUninstallRequest, planHookUninstall } from "../hooks/uninstall/plan.js";
import {
  parseKnowledgeUninstallRequest,
  planKnowledgeUninstall,
} from "../knowledge/uninstall/plan.js";
import { parseMcpServerUninstallRequest, planMcpServerUninstall } from "../mcps/uninstall/plan.js";
import {
  finalizePackUninstallIntent,
  parsePackUninstallSelectors,
  planPackUninstall,
  type PackUninstallRequirements,
} from "../packs/uninstall/plan.js";
import { parseRuleUninstallRequest, planRuleUninstall } from "../rules/uninstall/plan.js";
import { parseSkillUninstallRequest, planSkillUninstall } from "../skills/uninstall/plan.js";
import {
  parseSubagentUninstallRequest,
  planSubagentUninstall,
} from "../subagents/uninstall/plan.js";
import type { InstallExecutionFailure, PrepareInstallRequirements } from "../install/vocabulary.js";
import { resolveRootUninstallIntent } from "./root-intent.js";

// -----------------------------------------------------------------------------
// Request
// -----------------------------------------------------------------------------

/** One uninstall request, whatever command spelling produced it. */
export interface UninstallExtensionsRequest {
  /**
   * The type the command fixed. `none` is the root form, which accepts only a
   * registry FQN because that is the one spelling that names its own type.
   */
  readonly type: Option.Option<InstallableExtensionType>;
  /** A name, a glob, or a registry FQN, as the person typed it. */
  readonly selector: string;
}

// -----------------------------------------------------------------------------
// Candidate
// -----------------------------------------------------------------------------

/**
 * A settled removal: every target is resolved and nothing is written. `type`
 * is the type the removal settled on, which the root form derived from the
 * FQN; `names` are the extensions it will withdraw.
 */
export interface UninstallExtensionsCandidate {
  readonly type: InstallableExtensionType;
  /**
   * The selector scoped to the settled type: what a typed route was given,
   * and the extension name the root form read out of the registry FQN. What
   * a report names the subject with, whether or not anything matched.
   */
  readonly selector: string;
  readonly names: ReadonlyArray<string>;
  /** The selector matched nothing installed; the application renders a no-op. */
  readonly empty: boolean;
  readonly planName: string;
  readonly execution: ExecutionCandidate<PackUninstallRequirements>;
}

/** Every failure settling a removal can surface before anything is written. */
export type UninstallExtensionsFailure = ExtensionLifecycleFailed | InstallExecutionFailure;

/** Everything settling a removal reads before it freezes a candidate. */
export type PrepareUninstallRequirements = PrepareInstallRequirements | PackUninstallRequirements;

interface PlannedUninstall {
  readonly names: ReadonlyArray<string>;
  readonly plan: Plan<PackUninstallRequirements>;
}

const planForType = (
  type: InstallableExtensionType,
  selector: string,
): Effect.Effect<PlannedUninstall, UninstallExtensionsFailure, PrepareUninstallRequirements> => {
  switch (type) {
    case "skill":
      return Effect.gen(function* () {
        const intent = yield* parseSkillUninstallRequest(selector);
        return {
          names: intent.targets.map((target) => target.name),
          plan: yield* planSkillUninstall(intent),
        };
      });
    case "subagent":
      return Effect.gen(function* () {
        const intent = yield* parseSubagentUninstallRequest(selector);
        return {
          names: intent.targets.map((target) => target.name),
          plan: yield* planSubagentUninstall(intent),
        };
      });
    case "mcp-server":
      return Effect.gen(function* () {
        const intent = parseMcpServerUninstallRequest(selector);
        return {
          names: intent.targets.map((target) => target.name),
          plan: yield* planMcpServerUninstall(intent),
        };
      });
    case "rule":
      return Effect.gen(function* () {
        const intent = yield* parseRuleUninstallRequest(selector);
        return {
          names: intent.targets.map((target) => target.name),
          plan: yield* planRuleUninstall(intent),
        };
      });
    case "hook":
      return Effect.gen(function* () {
        const intent = yield* parseHookUninstallRequest(selector);
        return {
          names: intent.targets.map((target) => target.name),
          plan: yield* planHookUninstall(intent),
        };
      });
    case "knowledge":
      return Effect.gen(function* () {
        const intent = yield* parseKnowledgeUninstallRequest(selector);
        return {
          names: intent.targets.map((target) => target.name),
          plan: yield* planKnowledgeUninstall(intent),
        };
      });
    case "pack":
      return Effect.gen(function* () {
        const selectors = yield* parsePackUninstallSelectors(selector);
        const intent = yield* finalizePackUninstallIntent(selectors);
        return {
          names: intent.packsToUninstall.map((pack) => pack.name),
          plan: yield* planPackUninstall(intent),
        };
      });
  }
};

// -----------------------------------------------------------------------------
// prepare
// -----------------------------------------------------------------------------

/** Settle a removal without writing anything. */
export const prepareUninstallExtensions: (
  request: UninstallExtensionsRequest,
) => Effect.Effect<
  UninstallExtensionsCandidate,
  UninstallExtensionsFailure,
  PrepareUninstallRequirements
> = Effect.fn("UninstallExtensions.prepare")(function* (request: UninstallExtensionsRequest) {
  const resolved = yield* Option.match(request.type, {
    onSome: (type) => Effect.succeed({ type, selector: request.selector } as const),
    onNone: () =>
      resolveRootUninstallIntent(request.selector).pipe(
        Effect.map((intent) => ({ type: intent.type, selector: intent.name }) as const),
      ),
  });
  const planned = yield* planForType(resolved.type, resolved.selector);
  // The plan's own name stands whichever spelling produced it: the removal a
  // person asked for is type-specific, and the plan name is what they read.
  // Only the presented subject varies — the root form routes across every
  // type, so it presents the default subject rather than the one this
  // request happened to settle on.
  const plan = {
    ...planned.plan,
    presentation: operationPresentation(
      { imperative: "uninstall", past: "Uninstalled", gerund: "Uninstalling" },
      Option.getOrUndefined(request.type),
    ),
  };
  // Every removal withdraws the extension's per-agent projection, so the
  // candidate carries the configured-agent operation the resolution projects
  // before the removal and verifies after it.
  const configuredAgentOperations: ReadonlyArray<ConfiguredAgentOperation> = planned.names.map(
    (name) => ({ extensionType: resolved.type, name, plannedState: "absent" }),
  );
  const execution = yield* prepareExecutionCandidate(plan, { configuredAgentOperations });
  return {
    type: resolved.type,
    selector: resolved.selector,
    names: planned.names,
    empty: planned.names.length === 0,
    planName: plan.name,
    execution,
  } satisfies UninstallExtensionsCandidate;
});

// -----------------------------------------------------------------------------
// previewOrApply
// -----------------------------------------------------------------------------

/** Preview or apply a settled removal, resolving to one operation outcome. */
export const previewOrApplyUninstallExtensions = (
  candidate: UninstallExtensionsCandidate,
  execution: PlanExecution,
): Effect.Effect<OperationResolution, UninstallExtensionsFailure, PrepareUninstallRequirements> =>
  resolveExecutionCandidate(candidate.execution, execution);

/** The removal use case: settle a request, then preview or apply it. */
export const UninstallExtensions = {
  prepare: prepareUninstallExtensions,
  previewOrApply: previewOrApplyUninstallExtensions,
} as const;
