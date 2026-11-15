import type { PlanSources } from "@agentxm/workspace-kernel/planning";
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
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import {
  proposeDesiredState,
  prepareUninstallArtifact,
  prepareSharedProjectionExposure,
  validateNativeOutputPostconditions,
  captureRequiredNativeOutputs,
  captureNativeOutputRetention,
  collectCleanupStep,
  buildReconciliationClosure,
  StepFailureConversion,
  nameFromLabel,
} from "@agentxm/workspace-kernel/reconciliation";
import {
  CodingAgentRepository,
  WorkspaceInvariantFacts,
  captureAgentOutputAuthority,
  expectedProjectionNames,
  freezeProjectionFacts,
  observeAgentOutputs,
  type AgentOutputAuthority,
  type AgentOutputInventory,
  type AgentOutputObservation,
} from "@agentxm/workspace-kernel/projection";
import {
  AcceptedResolutionWriter,
  SettingsReader,
  WorkspaceLocation,
  withWorkspaceReadView,
  type CanonicalObservationStatus,
} from "@agentxm/workspace-kernel/workspace-state";

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import {
  operationPresentation,
  type ConfiguredAgentOperation,
  type OperationResolution,
  type Plan,
  type PlanExecution,
  OperationRefused,
  installRefused,
} from "@agentxm/workspace-kernel/operations";
import {
  prepareCompositeChildPlan,
  prepareExecutionCandidate,
  resolveExecutionCandidate,
  type CompositeChildPlanOptions,
  type ExecutionCandidate,
} from "@agentxm/workspace-kernel/planning";

import { parseHookUninstallRequest, planHookUninstall } from "@agentxm/extension-kinds/hooks";
import {
  parseKnowledgeUninstallRequest,
  planKnowledgeUninstall,
} from "@agentxm/extension-kinds/knowledge";
import {
  parseMcpServerUninstallRequest,
  planMcpServerUninstall,
} from "@agentxm/extension-kinds/mcp-connections";
import {
  finalizePackUninstallIntent,
  parsePackUninstallSelectors,
  planPackUninstall,
  type PackUninstallRequirements,
} from "@agentxm/extension-kinds/packs";
import {
  parseRuleUninstallRequest,
  planRuleUninstall,
} from "@agentxm/extension-kinds/instructions";
import { parseSkillUninstallRequest, planSkillUninstall } from "@agentxm/extension-kinds/skills";
import {
  parseSubagentUninstallRequest,
  planSubagentUninstall,
} from "@agentxm/extension-kinds/subagents";
import type { InstallExecutionFailure, PrepareInstallRequirements } from "../install/vocabulary.js";
import { resolveRootUninstallIntent } from "./root-intent.js";
import { refuseUndesiredInstalledTarget, typedUninstallSelector } from "./undesired-target.js";

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
 * FQN; `names` are the extensions it will withdraw. A composite operation
 * settles the removal as a child plan it seals itself, so its `execution` is
 * that plan.
 */
interface UninstallExtensionsCandidate<
  Execution = ExecutionCandidate<PrepareUninstallRequirements>,
> {
  readonly type: InstallableExtensionType;
  /**
   * The selector scoped to the settled type: a name or glob as given, or the
   * extension name a fully qualified selector names (a Pack keeps its
   * qualified spelling on the typed route). What a report names the subject
   * with, whether or not anything matched.
   */
  readonly selector: string;
  readonly names: ReadonlyArray<string>;
  /** The selector matched nothing installed; the application renders a no-op. */
  readonly empty: boolean;
  readonly planName: string;
  readonly execution: Execution;
}

/** Every failure settling a removal can surface before anything is written. */
type UninstallExtensionsFailure = OperationRefused | InstallExecutionFailure;

/** Everything settling a removal reads before it freezes a candidate. */
export type PrepareUninstallRequirements = PrepareInstallRequirements | PackUninstallRequirements;

interface PlannedUninstall {
  readonly names: ReadonlyArray<string>;
  readonly plan: Plan<PackUninstallRequirements>;
  /** Canonical observations the planner already made for its targets over the current graph. */
  readonly canonical?: ReadonlyArray<PlannedCanonical>;
}

/** What a removal artifact describes of one target's canonical observation. */
interface PlannedCanonical {
  readonly name: string;
  readonly canonical: Option.Option<{
    readonly path: string | undefined;
    readonly status: CanonicalObservationStatus;
    readonly sharedPackage: boolean;
  }>;
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
        const planned = yield* planKnowledgeUninstall(intent);
        return {
          names: intent.targets.map((target) => target.name),
          plan: planned.plan,
          canonical: planned.canonical,
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

/**
 * Independent copies of one native output observation, so every consumer a
 * preparation hands it to holds its own arrays, sets and records.
 */
const copyAgentOutputAuthority = (authority: AgentOutputAuthority): AgentOutputAuthority => ({
  expectedHooks: authority.expectedHooks.map((hook) => ({ ...hook })),
  expectedRegions: {
    rule: authority.expectedRegions.rule.map((region) => ({ ...region })),
    knowledge: authority.expectedRegions.knowledge.map((region) => ({ ...region })),
  },
  declaredMcpNames: new Set(authority.declaredMcpNames),
  expectedSkillSources: Object.fromEntries(
    Object.entries(authority.expectedSkillSources).map(([name, sources]) => [name, [...sources]]),
  ),
  expectedSubagentNames: new Set(authority.expectedSubagentNames),
});

const copyAgentOutputInventory = (inventory: AgentOutputInventory): AgentOutputInventory => {
  const copyOutput = (output: AgentOutputObservation): AgentOutputObservation => ({
    ...output,
    claimantAgentIds: [...output.claimantAgentIds],
    ...(output.nativeAddress === undefined
      ? {}
      : { nativeAddress: structuredClone(output.nativeAddress) }),
    ...(output.nativeEntry === undefined
      ? {}
      : { nativeEntry: Result.map(output.nativeEntry, (entry) => ({ ...entry })) }),
  });
  // Residue and footprints name outputs by identity, so they name the copies.
  const copies = new Map(inventory.outputs.map((output) => [output, copyOutput(output)]));
  const copyOf = (output: AgentOutputObservation) => copies.get(output) ?? copyOutput(output);
  return {
    diagnostics: inventory.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      address: structuredClone(diagnostic.address),
      aliases: [...diagnostic.aliases],
      claimantAgentIds: [...diagnostic.claimantAgentIds],
    })),
    outputs: inventory.outputs.map(copyOf),
    ownedResidue: inventory.ownedResidue.map(copyOf),
    unownedFootprints: inventory.unownedFootprints.map(copyOf),
  };
};

/** How a planned removal is settled: as its own candidate, or as a composite's child plan. */
type SealUninstallPlan<Execution> = (
  plan: Plan<PrepareUninstallRequirements>,
  options: CompositeChildPlanOptions,
) => Effect.Effect<Execution, UninstallExtensionsFailure, PrepareUninstallRequirements>;

/** Settle a removal without writing anything, settling its plan with `seal`. */
const settleUninstallExtensions: <Execution>(
  request: UninstallExtensionsRequest,
  seal: SealUninstallPlan<Execution>,
) => Effect.Effect<
  UninstallExtensionsCandidate<Execution>,
  UninstallExtensionsFailure,
  PrepareUninstallRequirements
> = Effect.fn("UninstallExtensions.prepare")(function* <Execution>(
  request: UninstallExtensionsRequest,
  seal: SealUninstallPlan<Execution>,
) {
  const conversion = yield* StepFailureConversion;
  const acceptedWriter = yield* AcceptedResolutionWriter;
  const resolved = yield* Option.match(request.type, {
    onSome: (type) =>
      typedUninstallSelector(type, request.selector).pipe(
        Effect.map(({ selector, subject }) => ({ type, selector, subject })),
      ),
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
    Effect.mapError((cause) =>
      installRefused({
        category: "conflict",
        detail: "Cannot derive desired state after uninstall",
        cause,
      }),
    ),
  );
  const projectionSubjects = proposal.before.nodes.filter(
    (node) =>
      (node.type === resolved.type && planned.names.includes(node.name)) ||
      (node.enabled &&
        !proposal.after.nodes.some(
          (next) => next.type === node.type && next.name === node.name && next.enabled,
        )),
  );
  // Every removal below is described from this one read phase, so native
  // output authority, the agent-output inventory and the projection facts are
  // each observed once, where a description first needs them, and every
  // consumer receives values of its own. Applying observes live again.
  const outputAuthority = yield* Effect.cached(captureAgentOutputAuthority());
  const agentOutputs = yield* Effect.cached(
    Effect.gen(function* () {
      const location = yield* WorkspaceLocation;
      const settings = yield* SettingsReader;
      const layout = yield* Ref.get(location.layout);
      // The cleanup's desired agents: no artifact reads which outputs remain desired.
      const desiredAgentIds = new Set(
        (yield* (yield* CodingAgentRepository).getMaterializationAgents()).map(({ id }) => id),
      );
      const authority = yield* outputAuthority;
      const inventory = yield* observeAgentOutputs({
        nativeDirectoryInputs: location.nativeDirectoryInputs,
        workspaceRoot: location.baseDir,
        scope: location.scope,
        desiredAgentIds,
        expectedNames: expectedProjectionNames(proposal.after),
        ...authority,
        authoredSkills: { layout, entries: yield* settings.entries("skill") },
      });
      return { authority, inventory };
    }),
  );
  const invariantFacts = yield* WorkspaceInvariantFacts;
  const projectionFacts = yield* Effect.cached(
    invariantFacts.projectionFacts.pipe(Effect.map(freezeProjectionFacts)),
  );
  const removedHookNames = new Set(
    projectionSubjects
      .filter(
        (node) =>
          node.type === "hook" &&
          !proposal.after.nodes.some(
            (next) => next.type === "hook" && next.name === node.name && next.enabled,
          ),
      )
      .map((node) => node.name),
  );
  const hookWithdrawals =
    removedHookNames.size === 0
      ? []
      : (yield* outputAuthority.pipe(
          Effect.map(copyAgentOutputAuthority),
          Effect.mapError((cause) =>
            installRefused({
              category: "conflict",
              detail: "Cannot establish native ownership before removal",
              cause,
            }),
          ),
        )).expectedHooks.filter(({ name }) => removedHookNames.has(name));
  const projectionExposure = yield* prepareSharedProjectionExposure(
    { proposal, subjects: projectionSubjects },
    true,
    hookWithdrawals,
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
      : yield* Effect.forEach(planned.names, (name) => {
          const canonical = planned.canonical?.find((entry) => entry.name === name)?.canonical;
          return prepareUninstallArtifact({ type: leafType, name }, proposal, {
            ...(canonical === undefined ? {} : { canonical }),
            agentOutputs: agentOutputs.pipe(
              Effect.map(({ inventory }) => copyAgentOutputInventory(inventory)),
            ),
            projectionFacts,
          });
        }).pipe(
          Effect.mapError((cause) =>
            installRefused({
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
  const jobs: Plan<PrepareUninstallRequirements>["jobs"] = yield* Effect.forEach(
    planned.plan.jobs,
    (job) =>
      Effect.gen(function* () {
        const steps = yield* Effect.forEach(job.steps, (step) =>
          Effect.gen(function* () {
            const artifact = artifactByName.get(nameFromLabel(step.label ?? ""));
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
            const retainedNativeOutputs = yield* captureRequiredNativeOutputs(
              proposal.after.nodes.flatMap((node) =>
                node.enabled && node.type === leafType && node.name === nameFromLabel(step.label)
                  ? [{ type: leafType, name: node.name }]
                  : [],
              ),
            ).pipe(
              Effect.mapError((cause) =>
                installRefused({
                  category: "conflict",
                  detail: "Cannot observe retained native outputs",
                  cause,
                }),
              ),
            );
            // Native MCP and Hook withdrawal belongs to the targeted manager.
            // An absence-retention step would promise to preserve the same unit it removes.
            const cleanup =
              leafType === "mcp-server" || leafType === "hook"
                ? Option.none()
                : yield* agentOutputs.pipe(
                    Effect.flatMap(({ authority, inventory }) =>
                      collectCleanupStep({
                        expectedNames: expectedProjectionNames(proposal.after),
                        prepared: {
                          authority: copyAgentOutputAuthority(authority),
                          inventory: copyAgentOutputInventory(inventory),
                        },
                        subjects: [{ type: leafType, name: nameFromLabel(step.label) }],
                        adapter: conversion,
                      }),
                    ),
                    Effect.mapError((cause) =>
                      installRefused({
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
                  result.result === "success"
                    ? {
                        ...result,
                        artifact: {
                          ...artifact,
                          ...(result.artifact?.nativeLocations === undefined
                            ? {}
                            : { nativeLocations: result.artifact.nativeLocations }),
                        },
                      }
                    : result,
                ),
              ),
            };
            return yield* buildReconciliationClosure<
              OperationRefused,
              PrepareUninstallRequirements
            >({
              label: step.label,
              message: artifact.references?.some(
                (reference) =>
                  reference.state === "retained" &&
                  reference.reason === "required by resulting desired state",
              )
                ? `Uninstalled ${step.label}; retained its package for remaining desired routes`
                : `Uninstalled ${step.label}`,
              artifact,
              children: [
                ...Option.toArray(cleanup).map((step) => ({
                  step,
                  coverage: "ineligible" as const,
                })),
                { step: removal, coverage: "eligible" },
              ],
              // The cleanup's row withdrawals and the removal's resolution
              // withdrawal commit once, so exact withdrawal restores the prior
              // lockfile bytes.
              acceptedResolutions: acceptedWriter.withBatch,
              toStepFailure: conversion.toStepFailure,
              validate: Effect.void,
              captureNativeRetention: (expected) =>
                captureNativeOutputRetention([...retainedNativeOutputs, ...expected]),
              validateNativeOutputs: (locations, expected, retained) =>
                validateNativeOutputPostconditions(
                  locations,
                  [...retainedNativeOutputs, ...expected],
                  retained,
                ),
            }).pipe(
              Effect.map((closure) => ({
                ...closure,
                ...(step.key === undefined ? {} : { key: step.key }),
              })),
            );
          }),
        );
        return { ...job, steps };
      }),
  );
  const plan: Plan<PrepareUninstallRequirements> = {
    ...planned.plan,
    jobs: jobs.map((job) => ({
      ...job,
      steps: job.steps.map((step) => {
        if (step.readiness === "error") return step;
        if ("projectionFailure" in projectionExposure)
          return {
            readiness: "error" as const,
            label: step.label,
            errorMessage: conversion.toStepFailure(projectionExposure.projectionFailure).detail,
            ...(step.artifact === undefined ? {} : { artifact: step.artifact }),
          };
        return {
          ...step,
          exposureRefs: [
            ...(step.exposureRefs ?? []),
            ...projectionExposure.projectionExposureRefs,
          ],
          ...(step.artifact === undefined
            ? {}
            : {
                artifact: {
                  ...step.artifact,
                  nativeLocations: [
                    ...(step.artifact.nativeLocations ?? []),
                    ...projectionExposure.projectionNativeLocations,
                  ],
                },
              }),
        };
      }),
    })),
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
  const execution = yield* seal(plan, {
    configuredAgentOperations,
    executionWithdrawals: projectionSubjects.filter(
      (subject) =>
        !proposal.after.nodes.some(
          (node) => node.type === subject.type && node.name === subject.name && node.enabled,
        ),
    ),
  });
  return {
    type: resolved.type,
    selector: resolved.selector,
    names: planned.names,
    empty: planned.names.length === 0,
    planName: plan.name,
    execution,
  } satisfies UninstallExtensionsCandidate<Execution>;
}, withWorkspaceReadView);

/** Settle a removal without writing anything. */
const prepareUninstallExtensions = (request: UninstallExtensionsRequest) =>
  settleUninstallExtensions(request, prepareExecutionCandidate);

/**
 * Settle a removal as one child of a composite operation, which keeps the
 * child's steps, risk conditions and configured-agent operations and seals
 * them in its own candidate.
 */
const prepareCompositeUninstallExtensions = (request: UninstallExtensionsRequest) =>
  settleUninstallExtensions(request, prepareCompositeChildPlan);

// -----------------------------------------------------------------------------
// previewOrApply
// -----------------------------------------------------------------------------

/** Preview or apply a settled removal, resolving to one operation outcome. */
const previewOrApplyUninstallExtensions = (
  candidate: UninstallExtensionsCandidate,
  execution: PlanExecution,
): Effect.Effect<
  OperationResolution,
  UninstallExtensionsFailure,
  PrepareUninstallRequirements | PlanSources
> => resolveExecutionCandidate(candidate.execution, execution);

/** The removal use case: settle a request, then preview or apply it. */
export const UninstallExtensions = {
  prepare: prepareUninstallExtensions,
  prepareForComposite: prepareCompositeUninstallExtensions,
  previewOrApply: previewOrApplyUninstallExtensions,
} as const;
