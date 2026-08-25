import type { SubagentExtensionRef } from "@agentxm/client-core/unstable/subagents";
import { SubagentManager } from "@agentxm/client-core/unstable/subagents";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import * as Array from "effect/Array";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import {
  credentialFreeLocatorRecoveryValue,
  publicRecoveryValue,
  recoveryOption,
  recoveryPositional,
  recoverySwitch,
} from "@agentxm/client-core/unstable/cli-runtime";

import {
  WorkspaceMutations,
  configuredRowsByName,
  makeConfiguredReleaseAgeEvaluation,
  type WorkspaceMutationsService,
} from "@agentxm/client-core/unstable/workspace";
import { decodeExtensionNameSync, type Handle } from "@agentxm/client-core/unstable/extensions";
import { parseSourceQualifiedRegistrySourcePatternParts } from "@agentxm/client-core/unstable/extensions";
import { resolveSource } from "@agentxm/client-core/unstable/source-resolution";
import { isWorkspaceSourceLocator } from "@agentxm/client-core/unstable/sources";
import { buildInstallOperation } from "@agentxm/client-core/unstable/extensions";
import {
  normalizeReleaseAgeRecords,
  type ReleaseAgeBypassRecord,
  type ReleaseAgeEvidence,
  type ReleaseAgeRecord,
} from "@agentxm/client-core/unstable/registry";
import {
  operationPresentation,
  previewOrApplyPlan,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { emitOperationResolution } from "../../../operation-output.js";
import { withOperationLifecycle } from "../../shared/operation-lifecycle.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import { makeConfirmationRecovery, makePlanExecution } from "../../shared/confirmation-recovery.js";
import {
  UPDATE_NAME_FILTER_FLAG,
  allUpdateTargetResolutionsFailed,
  resolveUpdateTargets,
} from "../../shared/update-targets.js";
import { buildUpdatePlan, type UpdateOperation, type MakeRunClosure } from "./plan.js";

export interface UpdateHandlerArgs {
  readonly source: Option.Option<string>;
  readonly agents: readonly string[];
  readonly subagents: readonly string[];
  readonly force: boolean;
  readonly yes: boolean;
  readonly preview: boolean;
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
  ws: WorkspaceMutationsService,
  outcome: Extract<ResolveResult, { readonly type: "skip" }>,
): PlannedJobStep => ({
  readiness: "ready",
  label: `Skip ${outcome.name}`,
  run: Effect.succeed({
    result: "success",
    disposition: "skipped",
    message: outcome.reason,
    artifact: {
      path: outcome.source,
      scope: ws.scope,
      change: "unchanged",
      targets: [{ path: outcome.source, change: "unchanged" }],
    },
  } satisfies JobStepResult),
});

const toRegistrySubagentPattern = (source: string) => {
  const parsed = parseSourceQualifiedRegistrySourcePatternParts(source);
  if (parsed === undefined) return Option.none();
  if (parsed.type !== undefined && parsed.type !== "subagents") {
    return Option.none();
  }
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

export const handleUpdate = (args: UpdateHandlerArgs) =>
  withOperationLifecycle(
    {
      command: "subagents.update",
      mode: args.preview ? "preview" : "apply",
      planName: "Update subagents",
      presentation: operationPresentation(
        { imperative: "update", past: "Updated", gerund: "Updating" },
        "subagent",
      ),
    },
    handleUpdateBody(args),
  );

const handleUpdateBody = Effect.fn("SubagentsUpdate.handle")(function* (args: UpdateHandlerArgs) {
  const ws = yield* WorkspaceMutations;
  const sources = yield* SourceHostProviders;
  const releaseAgeEvaluation = yield* makeConfiguredReleaseAgeEvaluation("enforce");

  // Step 1: Load configured subagents and filter to enabled
  const allSubagents = yield* ws.records.rows("subagent").pipe(Effect.map(configuredRowsByName));
  const lockedSubagents = yield* ws.getLockedSubagents();

  const subagentEntries: ReadonlyArray<readonly [string, string]> = Object.entries(
    allSubagents,
  ).flatMap(([name, entry]) => (entry.enabled ? [[name, entry.source]] : []));

  if (subagentEntries.length === 0) {
    yield* emitNoOpOutcome("subagents.update", {
      planName: "Update subagents",
      planDescription: "Update installed subagents",
      message: "No subagents installed.",
    });
    return;
  }

  const targetResolution = yield* resolveUpdateTargets({
    command: "subagents.update",
    planName: "Update subagents",
    planDescription: "Update installed subagents",
    entries: subagentEntries,
    source: args.source,
    nameFilters: args.subagents,
    nameFilterFlag: UPDATE_NAME_FILTER_FLAG,
    resourceType: "subagent",
    resourceLabel: "subagent",
    resourceLabelPlural: "subagents",
  });
  if (targetResolution.type === "no-op") {
    return;
  }
  const filteredEntries = targetResolution.entries;

  // Step 4: Re-resolve each source and discover subagents
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
              return yield* makeAppError({
                code: "internal",
                detail: `Registry resolved ${registryResolution.target} as ${registryResolution.ref.type}, expected subagent`,
              });
            }
            return {
              type: "match",
              ref: registryResolution.ref,
              holdbacks:
                registryResolution.kind === "exempted" || registryResolution.newerHeld === undefined
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
          return {
            type: "match",
            ref: subagentRef,
            holdbacks: [],
          } satisfies ResolveResult;
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

  // Step 5: Collect successful resolutions
  const resolved = results.filter(
    (result): result is Extract<ResolveResult, { readonly type: "match" }> =>
      result.type === "match",
  );
  const skipped = results.filter(
    (result): result is Extract<ResolveResult, { readonly type: "skip" }> => result.type === "skip",
  );
  if (resolved.length === 0 && skipped.length === 0) {
    return yield* allUpdateTargetResolutionsFailed({
      resourceLabelPlural: "subagent",
      suggestions: [{ description: "Verify the original source paths are still accessible." }],
    });
  }

  // Step 6: Capture services for run closures
  const subagentMgr = yield* SubagentManager;
  const warningsBySubagent = new Map<string, string>();

  for (const item of resolved) {
    const accepted = lockedSubagents[item.ref.subagent.name];
    const lockedEpoch = accepted?.type === "registry" ? accepted.publisherBindingId : undefined;
    const resolvedEpoch = item.ref.refType === "registry" ? item.ref.publisherBindingId : undefined;
    const changed =
      accepted?.type === "registry" &&
      item.ref.refType === "registry" &&
      lockedEpoch !== resolvedEpoch;
    if (changed && args.yes) {
      return yield* makeAppError({
        code: "validation",
        detail: `Unattended update refused for ${item.ref.owner}/subagents/${item.ref.name}: publisher epoch changed from ${lockedEpoch} to ${resolvedEpoch}`,
        recover: "Run the update interactively, verify the publisher change, and confirm the plan.",
      });
    }
    if (changed) {
      warningsBySubagent.set(
        item.ref.subagent.name,
        `Publisher identity changed (${lockedEpoch} → ${resolvedEpoch}); confirm only if you trust the current publisher`,
      );
    }
  }

  const makeRunClosure: MakeRunClosure = (op) => {
    const step = buildInstallOperation(subagentMgr, {
      ref: op.ref,
      versionRange: Option.none(),
    });
    if (step.readiness === "error") {
      return Effect.fail(
        makeAppError({
          code: "conflict",
          detail: step.errorMessage,
        }),
      );
    }
    return step.run.pipe(Effect.map(appendWarning(warningsBySubagent.get(op.ref.subagent.name))));
  };

  // Step 7: Build operations
  const ops: ReadonlyArray<UpdateOperation> = resolved.map((item) => ({
    ref: item.ref,
    force: args.force,
  }));

  // Step 8: Build plan
  const rawPlan = buildUpdatePlan(
    ops,
    lockedSubagents,
    "Update subagents",
    Option.some("Update installed subagents"),
    makeRunClosure,
  );
  const basePlanWithReleaseAge: Plan = {
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
    .map((item) => skippedSubagentStep(ws, item));
  const [firstJob, ...restJobs] = basePlanWithReleaseAge.jobs;
  const plan: Plan =
    skippedSteps.length === 0
      ? basePlanWithReleaseAge
      : firstJob === undefined
        ? { ...basePlanWithReleaseAge, jobs: [{ concurrency: 1, steps: skippedSteps }] }
        : {
            ...basePlanWithReleaseAge,
            jobs: [{ ...firstJob, steps: [...firstJob.steps, ...skippedSteps] }, ...restJobs],
          };

  // Step 9: Resolve plan
  const execution = yield* makePlanExecution(
    args,
    makeConfirmationRecovery(
      ["subagents", "update"],
      [
        recoverySwitch("--ignore-version-constraints", args.force),
        ...args.agents.map((agent) => recoveryOption("--agent", publicRecoveryValue(agent))),
        ...args.subagents.map((subagent) =>
          recoveryOption("--name", publicRecoveryValue(subagent)),
        ),
        ...Option.match(args.source, {
          onNone: () => [],
          onSome: (source) => [recoveryPositional(credentialFreeLocatorRecoveryValue(source))],
        }),
      ],
    ),
    args.force ? ["ignore-version-constraints"] : [],
    [
      ...new Set(
        args.subagents.length > 0
          ? args.subagents
          : plan.jobs.flatMap((job) =>
              job.steps.map((step) => step.label.replace(/^(?:Skip|Update)\s+/u, "")),
            ),
      ),
    ].map((name) => ({ extensionType: "subagent", name, targetEnabled: true })),
  );
  const executionPlan: Plan = {
    ...plan,
    riskConditions: [
      ...(plan.riskConditions ?? []),
      ...(warningsBySubagent.size > 0
        ? [
            {
              level: "confirmable" as const,
              id: "publisher-ownership-change",
              detail: "One or more subagents changed publisher identity.",
            },
          ]
        : []),
      ...(args.force
        ? ([
            {
              level: "override-required",
              id: "ignore-pack-version-constraints",
              policy: "ignore-version-constraints",
              requiredFlag: "--ignore-version-constraints",
              detail: "Allow updates outside version constraints declared by installed packs.",
            },
          ] as const)
        : []),
    ],
  };
  const resolution = yield* previewOrApplyPlan(executionPlan, { execution });
  yield* emitOperationResolution("subagents.update", resolution, {
    suggestions: [{ description: "Inspect installed subagents", cmd: "axm subagents list" }],
  });
});
