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
import {
  proposeDesiredState,
  prepareUninstallArtifact,
  collectCleanupStep,
  buildReconciliationClosure,
  type SyncPolicyFailure,
} from "@agentxm/workspace-reconciliation";
import { lifecycleStepFailure } from "../step-failure.js";

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

import { ExtensionLifecycleFailed } from "../errors.js";
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
import { refuseUndesiredInstalledTarget, typedUninstallSubject } from "./undesired-target.js";

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
    onSome: (type) =>
      Effect.succeed({
        type,
        selector: request.selector,
        subject: typedUninstallSubject(type, request.selector),
      }),
    onNone: () =>
      resolveRootUninstallIntent(request.selector).pipe(
        Effect.map((intent) => ({
          type: intent.type,
          selector: intent.name,
          subject: { type: intent.type, name: intent.name, owner: intent.owner },
        })),
      ),
  });
  // An installed package no desired route reaches is sync's to reconcile, not
  // intent this removal can withdraw.
  if (resolved.type !== "pack" && resolved.subject !== undefined)
    yield* refuseUndesiredInstalledTarget(resolved.subject);
  const planned = yield* planForType(resolved.type, resolved.selector);
  const proposal = yield* proposeDesiredState(
    planned.names.map((name) => ({ kind: "remove", type: resolved.type, name })),
  ).pipe(
    Effect.mapError(
      (cause) =>
        new ExtensionLifecycleFailed({
          category: "conflict",
          detail: "Cannot derive desired state after uninstall",
          cause,
        }),
    ),
  );
  // The plan's own name stands whichever spelling produced it: the removal a
  // person asked for is type-specific, and the plan name is what they read.
  // Only the presented subject varies — the root form routes across every
  // type, so it presents the default subject rather than the one this
  // request happened to settle on.
  const leafType = resolved.type === "pack" ? undefined : resolved.type;
  const artifacts =
    leafType === undefined
      ? []
      : yield* Effect.forEach(planned.names, (name) =>
          prepareUninstallArtifact({ type: leafType, name }, proposal),
        ).pipe(
          Effect.mapError(
            (cause) =>
              new ExtensionLifecycleFailed({
                category: "conflict",
                detail: "Cannot establish uninstall effects",
                cause,
              }),
          ),
        );
  const artifactByName = new Map(
    planned.names.flatMap((name, index) =>
      artifacts[index] === undefined ? [] : [[name, artifacts[index]] as const],
    ),
  );
  const cleanupAdapter = {
    toStepFailure: (cause: SyncPolicyFailure) =>
      lifecycleStepFailure(
        new ExtensionLifecycleFailed({
          category: "conflict",
          detail: "detail" in cause ? cause.detail : cause._tag,
          cause,
        }),
      ),
  };
  const activeNames = (type: InstallableExtensionType) =>
    new Set(
      proposal.after.nodes
        .filter((node) => node.type === type && node.enabled)
        .map((node) => node.name),
    );
  const jobs = yield* Effect.forEach(planned.plan.jobs, (job) =>
    Effect.gen(function* () {
      const steps = yield* Effect.forEach(job.steps, (step) =>
        Effect.gen(function* () {
          const artifact = artifactByName.get(step.label ?? "");
          if (artifact === undefined || step.readiness === "error" || leafType === undefined)
            return step;
          if ((artifact.targets?.length ?? 0) === 0 && (artifact.references?.length ?? 0) === 0) {
            // Nothing exists to withdraw: the planner's descriptive artifact
            // would name paths that are neither present nor changed, so the
            // step declares none, and a result that changed nothing reports
            // the empty evidence instead.
            const { artifact: _descriptive, ...withoutArtifact } = step;
            return {
              ...withoutArtifact,
              run: step.run.pipe(
                Effect.map((result) =>
                  result.result === "success" &&
                  (result.disposition === "unchanged" || result.artifact?.change === "unchanged")
                    ? { ...result, artifact }
                    : result,
                ),
              ),
            };
          }
          const cleanup = yield* collectCleanupStep({
            expectedSkillNames: activeNames("skill"),
            expectedSubagentNames: activeNames("subagent"),
            expectedMcpServerNames: activeNames("mcp-server"),
            expectedHookNames: activeNames("hook"),
            subjects: [{ type: leafType, name: step.label }],
            adapter: cleanupAdapter,
          }).pipe(
            Effect.mapError(
              (cause) =>
                new ExtensionLifecycleFailed({
                  category: "conflict",
                  detail: "Cannot establish owned uninstall outputs",
                  cause,
                }),
            ),
          );
          const removal = {
            ...step,
            artifact,
            run: step.run.pipe(
              Effect.map((result) =>
                result.result === "success" ? { ...result, artifact } : result,
              ),
            ),
          };
          if (Option.isNone(cleanup)) return removal;
          return yield* buildReconciliationClosure({
            label: step.label,
            message: `Uninstalled ${step.label}`,
            artifact,
            children: [
              { step: cleanup.value, coverage: "ineligible" },
              { step: removal, coverage: "eligible" },
            ],
            toStepFailure: (failure) =>
              failure._tag === "StepFailure" ? failure : cleanupAdapter.toStepFailure(failure),
            validate: Effect.void,
          });
        }),
      );
      return { ...job, steps };
    }),
  );
  const plan = {
    ...planned.plan,
    jobs,
    presentation: operationPresentation(
      { imperative: "uninstall", past: "Uninstalled", gerund: "Uninstalling" },
      Option.getOrUndefined(request.type),
    ),
  };
  // Every removal withdraws the extension's per-agent projection, so the
  // candidate carries the configured-agent operation the resolution projects
  // before the removal and verifies after it.
  const configuredAgentOperations: ReadonlyArray<ConfiguredAgentOperation> = planned.names.map(
    (name) => {
      const retained = proposal.after.nodes.find(
        (node) => node.type === resolved.type && node.name === name,
      );
      return {
        extensionType: resolved.type,
        name,
        plannedState: retained === undefined ? "absent" : retained.enabled ? "enabled" : "disabled",
      };
    },
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
