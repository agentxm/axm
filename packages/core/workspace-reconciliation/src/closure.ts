/** One domain-planned semantic closure, executed by the existing workspace transaction engine. */
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import {
  runWorkspaceTransaction,
  type WorkspaceTransactionFailure,
  type WorkspaceRestorationIncomplete,
  type WorkspaceTransactionScope,
} from "@agentxm/workspace-transactions";
import {
  StepFailure,
  type JobStepArtifact,
  type JobStepResult,
  type PlannedJobStep,
  type ReadyJobStep,
  type WarnJobStep,
} from "@agentxm/workspace-operations";

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
        if (agent !== "universal" && !agents.includes(agent)) agents.push(agent);
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
  readonly reportUnchangedWhenChildrenUnchanged?: boolean;
  /** A stale-candidate check that runs under the transition, before any write. */
  readonly preTransition?: Effect.Effect<void, E, R>;
  /** The desired-graph predicate the committed transition must satisfy. */
  readonly validate: Effect.Effect<void, E, R>;
}

/** Wrap a reconciliation closure's children in one workspace transaction. */
export const buildReconciliationClosure = <E, R>(
  args: ReconciliationClosureArgs<E, R>,
): Effect.Effect<
  PlannedJobStep<R | WorkspaceTransactionScope | FileSystem.FileSystem | Path.Path>
> =>
  Effect.sync(() => {
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
        artifact: args.artifact,
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
    const run = runWorkspaceTransaction({
      transition: Effect.gen(function* () {
        if (args.preTransition !== undefined) {
          yield* args.preTransition.pipe(Effect.mapError(args.toStepFailure));
        }
        const results = yield* Effect.forEach(
          runnableChildren,
          ({ step, coverage }) =>
            step.run.pipe(
              Effect.flatMap((result) => failedStep(step.label, result)),
              Effect.map((result) => ({ result, coverage })),
            ),
          { concurrency: 1 },
        );
        const coverage = yield* aggregateClosureCoverage(results, args.artifact.scope);
        return { results, coverage };
      }),
      validate: () =>
        Effect.gen(function* () {
          yield* args.validate;
        }).pipe(Effect.mapError(args.toStepFailure)),
    }).pipe(
      Effect.mapError(args.toStepFailure),
      Effect.map(({ results, coverage }) => {
        const warnings = results.flatMap(({ result }) =>
          result.result === "success" ? (result.warnings ?? []) : [],
        );
        const allChildrenUnchanged =
          args.reportUnchangedWhenChildrenUnchanged === true &&
          results.length > 0 &&
          results.every(
            ({ result }) => result.result === "success" && result.artifact?.change === "unchanged",
          );
        const artifact = allChildrenUnchanged
          ? { ...args.artifact, change: "unchanged" as const }
          : args.artifact;
        return {
          result: "success",
          message: args.message,
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
          artifact: args.artifact,
          run,
        } satisfies PlannedJobStep<
          R | WorkspaceTransactionScope | FileSystem.FileSystem | Path.Path
        >)
      : ({
          readiness: "warn",
          label: args.label,
          materialPaths,
          warnMessage: readinessWarnings.join("; "),
          artifact: args.artifact,
          run,
        } satisfies PlannedJobStep<
          R | WorkspaceTransactionScope | FileSystem.FileSystem | Path.Path
        >);
  });
