/**
 * Advancing the subagents a workspace selected.
 *
 * `subagents update` re-resolves each selected, enabled subagent against the
 * source the workspace declared and advances the ones whose resolution
 * differs from what was accepted. A subagent that cannot be re-resolved, is
 * workspace-authored, or is held by the minimum release age is reported as a
 * skipped unit rather than failing the sweep.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Array from "effect/Array";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  decodeExtensionNameSync,
  parseSourceQualifiedRegistrySourcePatternParts,
  type Handle,
} from "@agentxm/extension-model/unstable/extensions";
import type { ReleaseAgeEvidence } from "@agentxm/extension-model/unstable/extensions/release-age";
import type { SubagentExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/subagent";
import { isWorkspaceSourceLocator } from "@agentxm/extension-model/unstable/sources/workspace";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { SubagentManager } from "@agentxm/extension-materialization";
import { buildInstallOperation } from "@agentxm/workspace-reconciliation";
import {
  classifyPublisherBindingTransition,
  makeConfiguredReleaseAgeEvaluation,
  normalizeReleaseAgeRecords,
  publisherTransitionWarning,
  registryBindingProposal,
  type PublisherBindingTransition,
  type ReleaseAgeBypassRecord,
  type ReleaseAgeRecord,
} from "@agentxm/extension-resolution";
import { resolveSource, SourceHostProviders } from "@agentxm/extension-sources";
import {
  operationPresentation,
  prepareExecutionCandidate,
  StepFailure,
  type ConfiguredAgentOperation,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/workspace-operations";
import {
  acceptedResolutionRef,
  configuredRowsByName,
  WorkspaceMutations,
} from "@agentxm/workspace-state";

import { ExtensionLifecycleFailed } from "../../errors.js";
import { withPublisherTrustConditions } from "../../publisher-binding.js";
import { StepFailureConversion } from "../../step-failure-conversion.js";
import { buildSelectiveUpdatePlan, type SelectiveUpdateUnit } from "./plan.js";
import type { SelectiveUpdateStepRequirements } from "./requirements.js";
import {
  selectUpdateTargets,
  type SelectiveUpdateEntry,
  type SelectiveUpdateSelectors,
} from "./selection.js";
import {
  ignoreVersionConstraintsCondition,
  selectiveUpdatePlanName,
  type SelectiveUpdateCandidate,
} from "./vocabulary.js";

const PLAN_NAME = selectiveUpdatePlanName("subagent");
const PLAN_DESCRIPTION = "Update installed subagents";
const NOTHING_INSTALLED = "No subagents installed.";

/**
 * Every selected entry failed to re-resolve: a source-reachability problem,
 * not a per-entry skip.
 */
const allSubagentResolutionsFailed = new ExtensionLifecycleFailed({
  category: "network",
  detail: "All matched subagent source re-resolutions failed.",
  suggestions: [{ description: "Verify the original source paths are still accessible." }],
});

/** Everything `subagents update` needs beyond the workspace it runs in. */
export interface SelectiveSubagentUpdateRequest extends SelectiveUpdateSelectors {
  readonly kind: "selective-subagents";
  /** Advance outside the version ranges installed Packs declare. */
  readonly ignoreVersionConstraints: boolean;
}

type ResolveResult =
  | {
      readonly type: "match";
      readonly ref: SubagentExtensionRef;
      readonly holdbacks: ReadonlyArray<ReleaseAgeRecord>;
      readonly bypasses?: ReadonlyArray<ReleaseAgeBypassRecord>;
    }
  | {
      readonly type: "skip";
      readonly name: string;
      readonly source: string;
      readonly reason: string;
      readonly holdback?: ReleaseAgeRecord;
    };

const appendWarning =
  (warning: string | undefined) =>
  (result: JobStepResult): JobStepResult =>
    warning === undefined || result.result === "error"
      ? result
      : {
          ...result,
          message: result.message.length === 0 ? warning : `${result.message}; ${warning}`,
        };

const skippedSubagentStep = (
  scope: WorkspaceScope,
  outcome: Extract<ResolveResult, { readonly type: "skip" }>,
): PlannedJobStep<SelectiveUpdateStepRequirements> => ({
  readiness: "ready",
  label: `Skip ${outcome.name}`,
  run: Effect.succeed({
    result: "success",
    disposition: "skipped",
    message: outcome.reason,
    artifact: {
      path: outcome.source,
      scope,
      change: "unchanged",
      targets: [{ path: outcome.source, change: "unchanged" }],
    },
  } satisfies JobStepResult),
});

const toRegistrySubagentPattern = (source: string) => {
  const parsed = parseSourceQualifiedRegistrySourcePatternParts(source);
  if (parsed === undefined) return Option.none();
  if (parsed.type !== undefined && parsed.type !== "subagents") return Option.none();
  return Option.some(parsed);
};

const releaseAgeRecord = (args: {
  readonly target: string;
  readonly requestedRange?: string;
  readonly selectedVersion?: string;
  readonly evidence: ReleaseAgeEvidence;
}): ReleaseAgeRecord => ({
  reason: "minimum-release-age",
  target: args.target,
  dependencyPath: [args.target],
  ...(args.requestedRange === undefined ? {} : { requestedRange: args.requestedRange }),
  ...(args.selectedVersion === undefined ? {} : { selectedVersion: args.selectedVersion }),
  candidateVersion: args.evidence.version,
  publishedAt: args.evidence.publishedAt,
  eligibleAt: args.evidence.eligibleAt,
  minimumReleaseAgeSeconds: args.evidence.minimumReleaseAgeSeconds,
});

/** Settle a `subagents update` request: decide everything, write nothing. */
export const prepareSelectiveSubagentUpdate = Effect.fn("SelectiveSubagentUpdate.prepare")(
  function* (request: SelectiveSubagentUpdateRequest) {
    const ws = yield* WorkspaceMutations;
    const sources = yield* SourceHostProviders;
    const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation();

    const allSubagents = yield* ws.records.rows("subagent").pipe(Effect.map(configuredRowsByName));
    const lockedSubagents = yield* ws.getLockedSubagents();

    const subagentEntries: ReadonlyArray<SelectiveUpdateEntry> = Object.entries(
      allSubagents,
    ).flatMap(([name, entry]) =>
      entry.enabled && entry.source !== undefined ? [[name, entry.source]] : [],
    );

    if (subagentEntries.length === 0) {
      return {
        outcome: "nothing",
        reason: "none-installed",
        message: NOTHING_INSTALLED,
        subjectType: "subagent",
        planName: PLAN_NAME,
        planDescription: PLAN_DESCRIPTION,
      } satisfies SelectiveUpdateCandidate;
    }

    const selection = yield* selectUpdateTargets({
      entries: subagentEntries,
      source: request.source,
      nameFilters: request.nameFilters,
      nameFilterFlag: request.nameFilterFlag,
      resourceType: "subagent",
      resourceLabel: "subagent",
      resourceLabelPlural: "subagents",
    });
    if (selection.kind === "nothing") {
      return {
        outcome: "nothing",
        reason: selection.reason,
        message: selection.message,
        subjectType: "subagent",
        planName: PLAN_NAME,
        planDescription: PLAN_DESCRIPTION,
      } satisfies SelectiveUpdateCandidate;
    }
    const filteredEntries = selection.entries;

    const findSubagentRefs = (
      source: SubagentExtensionRef["source"],
      options: {
        readonly subagentNames: ReadonlyArray<string>;
        readonly owner: Option.Option<Handle>;
        readonly versionRange: Option.Option<string>;
      },
    ) =>
      sources
        .find(source, {
          names: options.subagentNames,
          type: "subagent",
          owner: options.owner,
          versionRange: options.versionRange,
        })
        .pipe(
          Effect.map((refs) =>
            Array.filter(refs, (ref): ref is SubagentExtensionRef => ref.type === "subagent"),
          ),
        );

    const results: ReadonlyArray<ResolveResult> = yield* Effect.forEach(
      filteredEntries,
      ([name, sourceStr]) =>
        Effect.gen(function* () {
          if (isWorkspaceSourceLocator(sourceStr)) {
            return {
              type: "skip",
              name,
              source: sourceStr,
              reason: `Subagent "${name}" is workspace-sourced and unchanged`,
            } satisfies ResolveResult;
          }
          const source = yield* resolveSource(sourceStr);
          const registryPattern = toRegistrySubagentPattern(sourceStr);

          if (source.type === "registry" && Option.isSome(registryPattern)) {
            const lookupName = registryPattern.value.name ?? decodeExtensionNameSync(name);
            const requestedRange = registryPattern.value.versionRange;
            const registryResolution = yield* sources.resolveNamedRegistry(source, {
              owner: registryPattern.value.owner,
              type: "subagent",
              name: lookupName,
              versionRange:
                requestedRange === undefined ? Option.none() : Option.some(requestedRange),
              releaseAgeEvaluation,
            });
            if (registryResolution.kind === "selected" || registryResolution.kind === "exempted") {
              if (registryResolution.ref.type !== "subagent") {
                return yield* new ExtensionLifecycleFailed({
                  category: "internal",
                  detail: `Registry resolved ${registryResolution.target} as ${registryResolution.ref.type}, expected subagent`,
                });
              }
              return {
                type: "match",
                ref: registryResolution.ref,
                holdbacks:
                  registryResolution.kind === "exempted" ||
                  registryResolution.newerHeld === undefined
                    ? []
                    : [
                        releaseAgeRecord({
                          target: registryResolution.target,
                          ...(requestedRange === undefined ? {} : { requestedRange }),
                          selectedVersion: registryResolution.ref.version,
                          evidence: registryResolution.newerHeld,
                        }),
                      ],
                ...(registryResolution.kind === "selected"
                  ? {}
                  : {
                      bypasses: [
                        {
                          ...releaseAgeRecord({
                            target: registryResolution.target,
                            ...(requestedRange === undefined ? {} : { requestedRange }),
                            selectedVersion: registryResolution.ref.version,
                            evidence: registryResolution.bypassed,
                          }),
                          ...registryResolution.exemption,
                        },
                      ],
                    }),
              } satisfies ResolveResult;
            }
            if (registryResolution.kind === "policy_held") {
              const holdback = releaseAgeRecord({
                target: registryResolution.target,
                ...(registryResolution.requestedRange === undefined
                  ? {}
                  : { requestedRange: registryResolution.requestedRange }),
                evidence: registryResolution.candidate,
              });
              return {
                type: "skip",
                name,
                source: sourceStr,
                reason: `Subagent "${name}" is held by the minimum release age until ${holdback.eligibleAt}`,
                holdback,
              } satisfies ResolveResult;
            }
            return {
              type: "skip",
              name,
              source: sourceStr,
              reason:
                registryResolution.kind === "not_found"
                  ? `Subagent "${name}" not found in source ${sources.origin(source)}`
                  : `No version of subagent "${name}" satisfies ${registryResolution.requestedRange}`,
            } satisfies ResolveResult;
          }

          const requestedOwner = Option.match(registryPattern, {
            onNone: () => Option.none<Handle>(),
            onSome: (pattern) => Option.some(pattern.owner),
          });

          const namedRefs = yield* findSubagentRefs(source, {
            subagentNames: [name],
            owner: requestedOwner,
            versionRange: Option.none(),
          });
          const subagentRef = namedRefs.find((r) => r.subagent.name === name);

          if (subagentRef) {
            return { type: "match", ref: subagentRef, holdbacks: [] } satisfies ResolveResult;
          }

          return {
            type: "skip",
            name,
            source: sourceStr,
            reason: `Subagent "${name}" not found in source ${sources.origin(source)}`,
          } satisfies ResolveResult;
        }).pipe(
          Effect.catch((error) =>
            Effect.succeed({
              type: "skip",
              name,
              source: sourceStr,
              reason: `Failed to resolve "${name}": ${String(error)}`,
            } satisfies ResolveResult),
          ),
        ),
      { concurrency: "unbounded" },
    );

    const resolved = results.filter(
      (result): result is Extract<ResolveResult, { readonly type: "match" }> =>
        result.type === "match",
    );
    const skipped = results.filter(
      (result): result is Extract<ResolveResult, { readonly type: "skip" }> =>
        result.type === "skip",
    );
    if (resolved.length === 0 && skipped.length === 0) {
      return yield* Effect.fail(allSubagentResolutionsFailed);
    }

    const subagentManager = yield* SubagentManager;
    const failureConversion = yield* StepFailureConversion;

    // Classify every proposed Registry acceptance against the accepted
    // resolution. A replaced publisher binding is a trust decision a person
    // makes at a prompt; the plan carries it as an interactive-only condition.
    const warningsBySubagent = new Map<string, string>();
    const publisherTransitions: Array<PublisherBindingTransition> = [];
    for (const item of resolved) {
      const proposed = registryBindingProposal(item.ref);
      const accepted = lockedSubagents[item.ref.subagent.name];
      if (proposed === undefined || accepted?.type !== "registry") continue;
      const transition = classifyPublisherBindingTransition({
        accepted: yield* acceptedResolutionRef({
          workspace: ws,
          type: "subagent",
          name: proposed.target,
        }).pipe(
          Effect.mapError(
            (cause) =>
              new ExtensionLifecycleFailed({
                category: "conflict",
                detail: `The accepted resolution for subagent "${proposed.target}" could not be read, so the proposed publisher binding cannot be checked`,
                cause,
              }),
          ),
        ),
        proposed,
      });
      if (Option.isSome(transition)) {
        publisherTransitions.push(transition.value);
        warningsBySubagent.set(
          item.ref.subagent.name,
          publisherTransitionWarning(transition.value),
        );
      }
    }

    const makeRunClosure = (
      ref: SubagentExtensionRef,
    ): Effect.Effect<JobStepResult, StepFailure, SelectiveUpdateStepRequirements> => {
      const step = buildInstallOperation(subagentManager, {
        toStepFailure: failureConversion.toStepFailure,
        ref,
        declaration: { name: ref.subagent.name, versionRange: Option.none() },
      });
      if (step.readiness === "error") {
        return Effect.fail(new StepFailure({ category: "conflict", detail: step.errorMessage }));
      }
      return step.run.pipe(Effect.map(appendWarning(warningsBySubagent.get(ref.subagent.name))));
    };

    const units: ReadonlyArray<SelectiveUpdateUnit<SubagentExtensionRef>> = resolved.map(
      (item) => ({
        name: item.ref.subagent.name,
        ref: item.ref,
        force: request.ignoreVersionConstraints,
        operation: item.ref,
      }),
    );

    const rawPlan = buildSelectiveUpdatePlan(
      units,
      lockedSubagents,
      PLAN_NAME,
      Option.some(PLAN_DESCRIPTION),
      makeRunClosure,
    );
    const basePlanWithReleaseAge: Plan<SelectiveUpdateStepRequirements> = {
      ...rawPlan,
      presentation: operationPresentation(
        { imperative: "update", past: "Updated", gerund: "Updating" },
        "subagent",
      ),
      releaseAge: {
        evaluatedAt: DateTime.formatIso(releaseAgeEvaluation.evaluatedAt),
        holdbacks: normalizeReleaseAgeRecords([
          ...resolved.flatMap((item) => item.holdbacks),
          ...skipped.flatMap((item) => (item.holdback === undefined ? [] : [item.holdback])),
        ]),
        bypasses: normalizeReleaseAgeRecords(resolved.flatMap((item) => item.bypasses ?? [])),
      },
    };
    const skippedSteps = skipped
      .filter((item) => item.holdback === undefined)
      .map((item) => skippedSubagentStep(ws.scope, item));
    const [firstJob, ...restJobs] = basePlanWithReleaseAge.jobs;
    const plan: Plan<SelectiveUpdateStepRequirements> =
      skippedSteps.length === 0
        ? basePlanWithReleaseAge
        : firstJob === undefined
          ? { ...basePlanWithReleaseAge, jobs: [{ concurrency: 1, steps: skippedSteps }] }
          : {
              ...basePlanWithReleaseAge,
              jobs: [{ ...firstJob, steps: [...firstJob.steps, ...skippedSteps] }, ...restJobs],
            };

    const configuredAgentOperations: ReadonlyArray<ConfiguredAgentOperation> = [
      ...new Set(
        request.nameFilters.length > 0
          ? request.nameFilters
          : plan.jobs.flatMap((job) =>
              job.steps.map((step) => step.label.replace(/^(?:Skip|Update)\s+/u, "")),
            ),
      ),
    ].map((name) => ({ extensionType: "subagent", name, plannedState: "enabled" as const }));

    const executionPlan: Plan<SelectiveUpdateStepRequirements> = withPublisherTrustConditions(
      {
        ...plan,
        riskConditions: [
          ...(plan.riskConditions ?? []),
          ...(request.ignoreVersionConstraints ? [ignoreVersionConstraintsCondition] : []),
        ],
      },
      publisherTransitions,
    );

    return {
      outcome: "planned",
      subjectType: "subagent",
      planName: PLAN_NAME,
      execution: yield* prepareExecutionCandidate(executionPlan, { configuredAgentOperations }),
    } satisfies SelectiveUpdateCandidate;
  },
);
