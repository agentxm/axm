import type { SubagentExtensionRef } from "@agentxm/client-core/unstable/subagents";
import { SubagentManager } from "@agentxm/client-core/unstable/subagents";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";

import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "@agentxm/client-core/unstable/workspace";
import type { Handle } from "@agentxm/client-core/unstable/extensions";
import { parseRegistrySourcePatternParts } from "@agentxm/client-core/unstable/extensions";
import { resolveSource } from "@agentxm/client-core/unstable/source-resolution";
import { isWorkspaceSourceLocator } from "@agentxm/client-core/unstable/sources";
import { buildInstallOperation } from "@agentxm/client-core/unstable/extensions";
import {
  previewOrApplyPlan,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import { LOCKFILE_VERSION } from "@agentxm/client-core/unstable/lockfile";
import { emitPlanResolutionResult } from "../../../json-output.js";
import { emitNoOpOutcome } from "../../shared/no-op-output.js";
import {
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
    }
  | {
      readonly type: "skip";
      readonly name: string;
      readonly source: string;
      readonly reason: string;
    };

const skippedSubagentStep = (
  ws: WorkspaceMutationsService,
  outcome: Extract<ResolveResult, { readonly type: "skip" }>,
): PlannedJobStep => ({
  readiness: "ready",
  label: `Skip ${outcome.name}`,
  run: Effect.succeed({
    result: "success",
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
  const parsed = parseRegistrySourcePatternParts(source);
  if (parsed === undefined) return Option.none();
  if (parsed.type !== undefined && parsed.type !== "subagents") {
    return Option.none();
  }
  return Option.some(parsed);
};

export const handleUpdate = Effect.fn("SubagentsUpdate.handle")(function* (
  args: UpdateHandlerArgs,
) {
  const ws = yield* WorkspaceMutations;
  const sources = yield* SourceHostProviders;

  // Step 1: Load configured subagents and filter to enabled
  const allSubagents = yield* ws.records.getConfiguredSubagents();
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
    nameFilterFlag: "--subagent",
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

  const results = yield* Effect.forEach(
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
    return step.run;
  };

  // Step 7: Build operations
  const ops: ReadonlyArray<UpdateOperation> = resolved.map((item) => ({
    ref: item.ref,
    force: args.force,
  }));

  // Step 8: Build plan
  const basePlan = buildUpdatePlan(
    ops,
    { lockfileVersion: LOCKFILE_VERSION, subagents: lockedSubagents },
    "Update subagents",
    Option.some("Update installed subagents"),
    makeRunClosure,
  );
  const skippedSteps = skipped.map((item) => skippedSubagentStep(ws, item));
  const [firstJob, ...restJobs] = basePlan.jobs;
  const plan: Plan =
    skippedSteps.length === 0
      ? basePlan
      : firstJob === undefined
        ? { ...basePlan, jobs: [{ concurrency: 1, steps: skippedSteps }] }
        : {
            ...basePlan,
            jobs: [{ ...firstJob, steps: [...firstJob.steps, ...skippedSteps] }, ...restJobs],
          };

  // Step 9: Resolve plan
  const resolution = yield* previewOrApplyPlan(plan, {
    yes: args.yes,
    force: args.force,
    preview: args.preview,
  });
  yield* emitPlanResolutionResult("subagents.update", resolution);
});
