/** One domain-planned semantic closure, executed by the existing workspace transaction engine. */
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import {
  withDocumentRoundTripBatch,
  retainedPackageKeyForRef,
  type AcceptedResolutionWriterService,
  type DocumentRoundTripBatch,
} from "../workspace-state/index.js";
import { combineNativeLocationOutcomes, type NativeLocationOutcome } from "../locations/index.js";
import {
  refreshNativeRegionReaders,
  type NativeRegionReaderContext,
  type NativeRetentionWitness,
} from "../projection/index.js";
import {
  runWorkspaceTransaction,
  type WorkspaceTransactionFailure,
  type WorkspaceRestorationIncomplete,
  type WorkspaceTransactionScope,
} from "../settlement/index.js";
import {
  StepFailure,
  type JobStepArtifact,
  type JobStepResult,
  type PlannedJobStep,
  type ReadyJobStep,
  type WarnJobStep,
} from "../operations/index.js";

const failedStep = (
  label: string,
  result: JobStepResult,
): Effect.Effect<JobStepResult, StepFailure> =>
  result.result === "error"
    ? Effect.fail(
        result.error ??
          new StepFailure({
            category: "internal",
            detail: `${label} failed: ${result.message}`,
          }),
      )
    : Effect.succeed(result);

export interface ReconciliationChild<R> {
  readonly step: PlannedJobStep<R>;
  readonly coverage: "eligible" | "ineligible";
}

interface ClosureCoverage {
  readonly applicable: boolean;
  readonly agents: ReadonlyArray<string>;
}

const aggregateClosureCoverage = (
  results: ReadonlyArray<{
    readonly result: JobStepResult;
    readonly coverage: ReconciliationChild<never>["coverage"];
  }>,
  scope: JobStepArtifact["scope"],
): Effect.Effect<ClosureCoverage, StepFailure> =>
  Effect.gen(function* () {
    const applicableArtifacts = results.flatMap(({ result, coverage }) =>
      coverage === "eligible" &&
      result.result === "success" &&
      result.artifact?.agents !== undefined
        ? [result.artifact]
        : [],
    );
    const agents: Array<string> = [];
    for (const artifact of applicableArtifacts) {
      if (artifact.scope !== scope) {
        return yield* new StepFailure({
          category: "internal",
          detail: `Closure coverage spans ${scope} and ${artifact.scope} scopes`,
        });
      }
      const artifactAgents = new Set(artifact.agents);
      for (const target of artifact.targets ?? []) {
        for (const agent of target.agentIds ?? []) {
          if (!artifactAgents.has(agent)) {
            return yield* new StepFailure({
              category: "internal",
              detail: `Closure child target agent ${agent} is absent from its artifact agents`,
            });
          }
        }
      }
      for (const agent of artifact.agents ?? []) {
        if (!agents.includes(agent)) agents.push(agent);
      }
    }
    return { applicable: applicableArtifacts.length > 0, agents };
  });

/**
 * What a reconciliation closure checks before it writes and after it commits. The
 * checks are the planner's, so their failure family and their requirements
 * travel with them rather than being fixed here.
 */
export interface ReconciliationClosureArgs<E, R> {
  readonly toStepFailure: (
    failure: E | StepFailure | WorkspaceTransactionFailure | WorkspaceRestorationIncomplete,
  ) => StepFailure;
  readonly label: string;
  readonly message: string;
  readonly artifact: JobStepArtifact;
  readonly children: ReadonlyArray<ReconciliationChild<R>>;
  readonly documentRoundTrip?: DocumentRoundTripBatch;
  readonly acceptedResolutions?: AcceptedResolutionWriterService["withBatch"];
  readonly nativeReaderContext?: NativeRegionReaderContext;
  /** A stale-candidate check that runs under the transition, before any write. */
  readonly preTransition?: Effect.Effect<void, E, R>;
  /** Capture no-write retention evidence inside the transition, before child mutations. */
  readonly captureNativeRetention?: (
    expected: ReadonlyArray<NativeLocationOutcome>,
  ) => Effect.Effect<ReadonlyArray<NativeRetentionWitness>, E, R>;
  /** The desired-graph predicate the committed transition must satisfy. */
  readonly validate: Effect.Effect<void, E, R>;
  /** Owner readback against planned obligations and actual evidence, before settlement. */
  readonly validateNativeOutputs?: (
    locations: ReadonlyArray<NativeLocationOutcome>,
    expected: ReadonlyArray<NativeLocationOutcome>,
    retained: ReadonlyArray<NativeRetentionWitness>,
  ) => Effect.Effect<void, E, R>;
}

/** Wrap a reconciliation closure's children in one workspace transaction. */
export const buildReconciliationClosure = <E, R>(
  args: ReconciliationClosureArgs<E, R>,
): Effect.Effect<
  PlannedJobStep<R | WorkspaceTransactionScope | FileSystem.FileSystem | Path.Path>
> =>
  Effect.sync(() => {
    const plannedNativeLocations = combineNativeLocationOutcomes([
      ...(args.artifact.nativeLocations ?? []),
      ...args.children.flatMap(({ step }) => step.artifact?.nativeLocations ?? []),
    ]);
    const agentOutcomes = args.children.flatMap(
      ({ step }) => step.agentOutcomes ?? step.artifact?.agentOutcomes ?? [],
    );
    const plannedArtifact = {
      ...args.artifact,
      ...(agentOutcomes.length === 0 ? {} : { agentOutcomes }),
      ...(plannedNativeLocations.length === 0 ? {} : { nativeLocations: plannedNativeLocations }),
    };
    const materialPaths = args.children.flatMap(({ step }) => step.materialPaths ?? []);
    const readinessErrors = args.children.flatMap(({ step }) =>
      step.readiness === "error" ? [step.errorMessage] : [],
    );
    if (readinessErrors.length > 0) {
      const blockingConditionIds = args.children.flatMap(({ step }) =>
        step.readiness === "error" ? (step.blockingConditionIds ?? []) : [],
      );
      return {
        readiness: "error",
        label: args.label,
        materialPaths,
        errorMessage: readinessErrors.join("; "),
        artifact: plannedArtifact,
        ...(blockingConditionIds.length === 0 ? {} : { blockingConditionIds }),
      } satisfies PlannedJobStep<R | WorkspaceTransactionScope | FileSystem.FileSystem | Path.Path>;
    }

    const readinessWarnings = args.children.flatMap(({ step }) =>
      step.readiness === "warn" ? [step.warnMessage] : [],
    );
    const runnableChildren = args.children.filter(
      (
        child,
      ): child is ReconciliationChild<R> & { readonly step: ReadyJobStep<R> | WarnJobStep<R> } =>
        child.step.readiness !== "error",
    );
    const acquisitionRefs = runnableChildren.flatMap(
      ({ step }) =>
        step.acquisitionRefs ??
        (step.sourceBinding === undefined
          ? []
          : [step.sourceBinding.ref, ...(step.sourceBinding.members ?? [])]),
    );
    const run = runWorkspaceTransaction({
      transition: withDocumentRoundTripBatch(
        (args.acceptedResolutions ?? ((effect) => effect))(
          Effect.gen(function* () {
            if (args.preTransition !== undefined) {
              yield* args.preTransition.pipe(Effect.mapError(args.toStepFailure));
            }
            const retained =
              args.captureNativeRetention === undefined
                ? []
                : yield* args
                    .captureNativeRetention(plannedNativeLocations)
                    .pipe(Effect.mapError(args.toStepFailure));
            const results = yield* Effect.forEach(
              runnableChildren,
              ({ step, coverage }) =>
                step.run.pipe(
                  Effect.flatMap((result) => failedStep(step.label, result)),
                  Effect.map((result) => ({ result, coverage, id: step.key ?? step.label })),
                ),
              { concurrency: 1 },
            );
            const coverage = yield* aggregateClosureCoverage(results, args.artifact.scope);
            const observedNativeLocations = combineNativeLocationOutcomes(
              results.flatMap(({ result }) =>
                result.result === "success" ? (result.artifact?.nativeLocations ?? []) : [],
              ),
            );
            const nativeLocations =
              args.nativeReaderContext === undefined
                ? observedNativeLocations
                : yield* refreshNativeRegionReaders(
                    observedNativeLocations,
                    args.nativeReaderContext,
                  ).pipe(
                    Effect.mapError(
                      (cause) =>
                        new StepFailure({
                          category: "conflict",
                          detail: `Final native reader observation failed at ${cause.target}: ${cause.reason}`,
                        }),
                    ),
                  );
            return { results, coverage, nativeLocations, retained };
          }),
        ).pipe(
          Effect.mapError((cause) =>
            cause instanceof StepFailure
              ? cause
              : new StepFailure({
                  category: "conflict",
                  detail: `Could not commit retained package resolutions: ${cause._tag}`,
                  cause,
                }),
          ),
        ),
        args.documentRoundTrip,
      ),
      validate: (result) =>
        Effect.gen(function* () {
          yield* args.validate;
          if (args.validateNativeOutputs !== undefined)
            yield* args.validateNativeOutputs(
              result.nativeLocations,
              plannedNativeLocations,
              result.retained,
            );
        }).pipe(Effect.mapError(args.toStepFailure)),
    }).pipe(
      Effect.mapError(args.toStepFailure),
      Effect.map(({ results, coverage, nativeLocations }) => {
        const warnings = results.flatMap(({ result }) =>
          result.result === "success" ? (result.warnings ?? []) : [],
        );
        // A closure changed nothing exactly when every child reported that
        // it changed nothing; the closure never decides that on its own.
        const allChildrenUnchanged =
          results.length > 0 &&
          results.every(
            ({ result }) =>
              result.result === "success" &&
              (result.disposition === "unchanged" || result.artifact?.change === "unchanged"),
          );
        const artifact = {
          ...args.artifact,
          ...(allChildrenUnchanged ? { change: "unchanged" as const } : {}),
          nativeLocations,
          members: results.flatMap(({ id, result }) =>
            result.result === "success" && result.artifact !== undefined
              ? [
                  {
                    id,
                    changed:
                      result.disposition !== "unchanged" && result.artifact.change !== "unchanged",
                    artifact: result.artifact,
                  },
                ]
              : [],
          ),
        };
        return {
          result: "success",
          message: args.message,
          ...(allChildrenUnchanged ? { disposition: "unchanged" as const } : {}),
          artifact: !coverage.applicable ? artifact : { ...artifact, agents: coverage.agents },
          ...(warnings.length === 0 ? {} : { warnings }),
        } satisfies JobStepResult;
      }),
    );

    return readinessWarnings.length === 0
      ? ({
          readiness: "ready",
          label: args.label,
          materialPaths,
          artifact: plannedArtifact,
          ...(acquisitionRefs.length === 0 ? {} : { acquisitionRefs }),
          run,
        } satisfies PlannedJobStep<
          R | WorkspaceTransactionScope | FileSystem.FileSystem | Path.Path
        >)
      : ({
          readiness: "warn",
          label: args.label,
          materialPaths,
          warnMessage: readinessWarnings.join("; "),
          artifact: plannedArtifact,
          ...(acquisitionRefs.length === 0 ? {} : { acquisitionRefs }),
          run,
        } satisfies PlannedJobStep<
          R | WorkspaceTransactionScope | FileSystem.FileSystem | Path.Path
        >);
  });

/** Retained bytes and all selected consumers in one job settle together. */
export const groupRetainedPackageSteps = <R>(args: {
  readonly steps: ReadonlyArray<PlannedJobStep<R>>;
  readonly artifact: JobStepArtifact;
  readonly message: string;
  readonly acceptedResolutions: AcceptedResolutionWriterService["withBatch"];
  readonly toStepFailure: ReconciliationClosureArgs<never, R>["toStepFailure"];
  readonly additionalKeys?: (step: PlannedJobStep<R>) => ReadonlyArray<string>;
}) =>
  Effect.gen(function* () {
    const groups: Array<{
      keys: Set<string>;
      children: Array<{ index: number; step: PlannedJobStep<R> }>;
    }> = [];
    for (const [index, step] of args.steps.entries()) {
      const refs =
        step.readiness === "error"
          ? []
          : [
              ...(step.acquisitionRefs ?? []),
              ...(step.sourceBinding === undefined
                ? []
                : [step.sourceBinding.ref, ...(step.sourceBinding.members ?? [])]),
            ];
      const keys = new Set([
        ...refs.flatMap((ref) =>
          ref.refType === "workspace" ? [] : [retainedPackageKeyForRef(ref)],
        ),
        ...(args.additionalKeys?.(step) ?? []),
      ]);
      const overlapping = groups.filter((group) => [...keys].some((key) => group.keys.has(key)));
      const group = { keys, children: [{ index, step }] };
      for (const prior of overlapping) {
        for (const key of prior.keys) group.keys.add(key);
        group.children.push(...prior.children);
        groups.splice(groups.indexOf(prior), 1);
      }
      group.children.sort((left, right) => left.index - right.index);
      groups.push(group);
    }
    groups.sort((left, right) => (left.children[0]?.index ?? 0) - (right.children[0]?.index ?? 0));
    return yield* Effect.forEach(groups, (group) => {
      const first = group.children[0]?.step;
      if (first === undefined) return Effect.succeed([]);
      if (group.children.length === 1) return Effect.succeed([first]);
      return buildReconciliationClosure({
        label: group.children.map(({ step }) => step.label).join(", "),
        message: args.message,
        artifact: { ...args.artifact, path: first.artifact?.path ?? args.artifact.path },
        children: group.children.map(({ step }) => ({ step, coverage: "eligible" as const })),
        acceptedResolutions: args.acceptedResolutions,
        validate: Effect.void,
        toStepFailure: args.toStepFailure,
      }).pipe(Effect.map((step) => [step]));
    }).pipe(Effect.map((steps) => steps.flat()));
  });
