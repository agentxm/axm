/**
 * Configured-agent outcomes of an execution candidate: the per-agent
 * outcomes a prepared plan projects before apply, and the fresh readback that
 * verifies them after apply.
 */

import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import {
  StepFailure,
  type CompletedJobStep,
  type ConfiguredAgentOperation,
  type ConfiguredAgentOutcome,
  type ExecutedPlan,
  type Plan,
  type PlannedJobStep,
} from "../../operations/index.js";
import { withMcpInspectionReadView } from "../../projection/index.js";
import {
  ConfiguredAgentOutcomesProvider,
  WorkspaceLocation,
  observeConfiguredTargets,
  resolveConfiguredExtensionObservations,
  withFreshWorkspaceObservationReadView,
  workspaceStateReadFailureToStepFailure,
  type ConfiguredAgentOutcomesProviderService,
} from "../../workspace-state/index.js";
import { configuredAgentLifecycleOutcomes } from "../../agent-adapters/index.js";
import {
  nativeUnitKey,
  nativeUnitReference,
  combineNativeLocationOutcomes,
  type NativeLocationOutcome,
} from "../../locations/index.js";
import { enterPhase, withPhaseSpan } from "./operation-phase.js";

const withPlannedAgentOutcomes = <Requirements, Output>(
  plan: Plan<Requirements, Output>,
  outcomes: ReadonlyMap<
    PlannedJobStep<Requirements, Output>,
    ReadonlyArray<ConfiguredAgentOutcome>
  >,
): Plan<Requirements, Output> => ({
  ...plan,
  jobs: plan.jobs.map((job) => ({
    ...job,
    steps: job.steps.map((step): PlannedJobStep<Requirements, Output> => {
      const effective = step.agentOutcomes?.length
        ? step.agentOutcomes
        : step.artifact?.agentOutcomes?.length
          ? step.artifact.agentOutcomes
          : (outcomes.get(step) ?? []);
      const agentOutcomes = effective.map((outcome): ConfiguredAgentOutcome =>
        step.readiness === "error" && outcome.outcome === "projected"
          ? {
              ...outcome,
              outcome: "blocked",
              reasonCode: "plan-step-blocked",
              reason: step.errorMessage,
            }
          : outcome,
      );
      const reporting = {
        agentOutcomes,
        ...(step.artifact === undefined ? {} : { artifact: { ...step.artifact, agentOutcomes } }),
      };
      if (step.readiness === "error") return { ...step, ...reporting };
      const obstruction = agentOutcomes.find(
        ({ outcome }) => outcome === "blocked" || outcome === "failed",
      );
      if (obstruction !== undefined)
        return { ...step, ...reporting, readiness: "error", errorMessage: obstruction.reason };
      return { ...step, ...reporting };
    }),
  })),
});

const withExecutedAgentOutcomes = <Output>(
  plan: ExecutedPlan<Output>,
  outcomes: ReadonlyArray<ConfiguredAgentOutcome>,
): ExecutedPlan<Output> => ({
  ...plan,
  jobs: plan.jobs.map((job) => ({
    ...job,
    steps: job.steps.map((step) => ({
      ...step,
      agentOutcomes: outcomes.filter((current) =>
        step.agentOutcomes?.some(
          (planned) =>
            planned.extensionType === current.extensionType &&
            planned.name === current.name &&
            planned.agentId === current.agentId,
        ),
      ),
      ...(step.result.result === "success" && step.result.artifact !== undefined
        ? {
            result: {
              ...step.result,
              artifact: {
                ...step.result.artifact,
                agentOutcomes:
                  step.result.artifact.agentOutcomes === undefined ||
                  step.result.artifact.agentOutcomes.length === 0
                    ? outcomes.filter((current) =>
                        step.agentOutcomes?.some(
                          (planned) =>
                            planned.extensionType === current.extensionType &&
                            planned.name === current.name &&
                            planned.agentId === current.agentId,
                        ),
                      )
                    : step.result.artifact.agentOutcomes,
              },
            },
          }
        : {}),
    })),
  })),
});

/**
 * Project the requested lifecycle state, preserving current owner evidence of
 * obstructions. Missing output is work for the prepared plan, not a failed
 * projection; only apply's fresh readback can claim verified currency.
 */
const outcomesFor = (
  scope: WorkspaceScope,
  provider: ConfiguredAgentOutcomesProviderService,
  configuredAgents: ReadonlyArray<string>,
  operation: ConfiguredAgentOperation,
  plannedLocations: ReadonlyArray<NativeLocationOutcome>,
  plannedTargets: ReadonlySet<string>,
): Effect.Effect<ReadonlyArray<ConfiguredAgentOutcome>> => {
  const generic = configuredAgentLifecycleOutcomes({
    type: operation.extensionType,
    name: operation.name,
    agentIds: configuredAgents,
    scope,
    state: "projected",
    targetState: operation.plannedState,
    installed: true,
  });
  if (
    configuredAgents.length === 0 ||
    operation.plannedState !== "enabled" ||
    operation.extensionType === "pack"
  )
    return Effect.succeed(generic);
  return resolveConfiguredExtensionObservations(provider, {
    type: operation.extensionType,
    state: "current",
    scope,
    agentIds: configuredAgents,
    rows: [
      {
        name: operation.name,
        targetState: operation.plannedState,
        installed: true,
      },
    ],
  }).pipe(
    Effect.map((observations) => {
      const observed = observations.get(operation.name);
      return generic.map((planned): ConfiguredAgentOutcome => {
        const current = observed?.agentOutcomes.find(({ agentId }) => agentId === planned.agentId);
        const units =
          observed?.nativeLocations.filter((unit) =>
            unit.configuredConsumers.includes(planned.agentId),
          ) ?? [];
        const nativePlan = plannedLocations.filter((unit) =>
          unit.configuredConsumers.includes(planned.agentId),
        );
        const writtenUnitKeys = new Set(
          nativePlan
            .filter(
              (unit) =>
                unit.state === "created" || unit.state === "updated" || unit.state === "removed",
            )
            .map(nativeUnitKey),
        );
        const writesUnit = (unit: NativeLocationOutcome) =>
          writtenUnitKeys.has(nativeUnitKey(unit)) ||
          (nativePlan.length === 0 &&
            (plannedTargets.has(unit.address.path) ||
              unit.aliases.some((alias) => plannedTargets.has(alias))));
        const obstruction = units.find(
          (unit) =>
            writesUnit(unit) && (unit.ownership === "unowned" || unit.ownership === "unverified"),
        );
        const verified = units.filter(
          (unit) =>
            (unit.ownership === "owned" || unit.ownership === "declared") &&
            unit.state === "unchanged",
        );
        const supportedByOwner =
          verified.length > 0 ||
          nativePlan.some(
            (unit) =>
              unit.state === "created" ||
              unit.state === "updated" ||
              ((unit.state === "unchanged" || unit.state === "retained") &&
                (unit.ownership === "owned" || unit.ownership === "declared")),
          );
        if (planned.outcome !== "projected" && !supportedByOwner && obstruction === undefined)
          return planned;
        if (current?.outcome === "unsupported" && !supportedByOwner) return current;
        if (
          observed === undefined ||
          current?.reasonCode === "native-observation-unavailable" ||
          (current?.reasonCode === "native-location-unverified" && !supportedByOwner) ||
          obstruction !== undefined
        )
          return {
            ...planned,
            outcome: "blocked",
            reasonCode:
              obstruction === undefined
                ? "native-observation-unavailable"
                : "native-content-conflict",
            reason:
              obstruction?.reason ??
              current?.reason ??
              "Native ownership could not be verified before planning the projection.",
            nativeUnits: units.map(nativeUnitReference),
          };
        return {
          ...planned,
          outcome: "projected",
          ...(planned.outcome === "unsupported"
            ? {
                reasonCode: "planned-native-unit",
                reason:
                  "The owner has established a native realization for this agent; runtime selection remains unverified.",
              }
            : {}),
          nativeUnits: combineNativeLocationOutcomes([
            ...nativePlan,
            ...verified,
            ...units.filter(writesUnit),
          ]).map(nativeUnitReference),
        };
      });
    }),
    Effect.catchTag("ConfiguredAgentOutcomesUnavailable", (failure) =>
      Effect.succeed(
        generic.map((outcome): ConfiguredAgentOutcome =>
          outcome.outcome === "projected"
            ? {
                ...outcome,
                outcome: "blocked",
                reasonCode: "native-observation-unavailable",
                reason: failure.detail,
              }
            : outcome,
        ),
      ),
    ),
  );
};

/**
 * Project the configured-agent outcomes of `operations` for each step of
 * `plan`, keeping the outcomes an owner already supplied. The returned
 * function applies them to a plan derived from `plan`, and leaves that plan
 * unchanged when no operation is planned.
 */
export const projectConfiguredAgentOutcomes = Effect.fnUntraced(function* <Requirements, Output>(
  plan: Plan<Requirements, Output>,
  originalSteps: ReadonlyArray<PlannedJobStep<Requirements, Output>>,
  operations: ReadonlyArray<ConfiguredAgentOperation>,
  configuredAgents: ReadonlyArray<string>,
) {
  const location = yield* WorkspaceLocation;
  const provider = yield* ConfiguredAgentOutcomesProvider;
  const path = yield* Path.Path;
  const subjectsForStep = (step: PlannedJobStep<Requirements, Output>) =>
    operations.filter(
      (operation) =>
        (originalSteps.length === 1 && originalSteps[0] === step) ||
        step.key === `${operation.extensionType}:${operation.name}` ||
        (operation.extensionType === "pack" &&
          step.key?.startsWith("pack:") === true &&
          step.key.endsWith(`/${operation.name}`)) ||
        (step.sourceBinding?.extensionType === operation.extensionType &&
          step.sourceBinding.target === operation.name) ||
        (step.key === undefined && step.label === operation.name),
    );
  const projectedOutcomes = new Map(
    yield* Effect.forEach(
      plan.jobs.flatMap((job) => job.steps),
      (step) =>
        Effect.gen(function* () {
          // Owner plans have already preflighted their proposed sources and
          // contributor graph. Current-state fallback must not re-resolve those
          // sources before this plan has acquired and accepted them.
          const owned = step.agentOutcomes?.length
            ? step.agentOutcomes
            : step.artifact?.agentOutcomes;
          if (owned !== undefined && owned.length > 0) return [step, owned] as const;
          const locations = step.artifact?.nativeLocations ?? [];
          const targets = new Set(
            (step.artifact?.targets ?? [])
              .filter((target) => target.change !== "unchanged")
              .map((target) => path.resolve(location.baseDir, target.path)),
          );
          const outcomes = (yield* Effect.forEach(subjectsForStep(step), (operation) =>
            outcomesFor(location.scope, provider, configuredAgents, operation, locations, targets),
          )).flat();
          return [step, outcomes] as const;
        }),
    ),
  );
  return (target: Plan<Requirements, Output>): Plan<Requirements, Output> =>
    operations.length === 0 ? target : withPlannedAgentOutcomes(target, projectedOutcomes);
});

/** A verification failure, carrying the execution whose closures already settled. */
interface VerificationFailure<Output> {
  readonly error: StepFailure;
  readonly attemptedExecution: ExecutedPlan<Output>;
}

/**
 * Verify the configured-agent outcomes of an applied candidate against one
 * fresh readback, keeping the settled commits of `result` on every failure.
 */
export const verifyConfiguredAgentOutcomes = <Output>(
  result: ExecutedPlan<Output>,
  failedStep: CompletedJobStep<Output> | undefined,
  operations: ReadonlyArray<ConfiguredAgentOperation>,
  configuredAgents: ReadonlyArray<string>,
  scope: WorkspaceScope,
  candidateId: string,
) =>
  withPhaseSpan(
    "verification",
    Effect.gen(function* () {
      yield* enterPhase("verification");
      const readbacks = yield* withFreshWorkspaceObservationReadView(
        withMcpInspectionReadView(
          observeConfiguredTargets(
            operations
              .filter((operation) => operation.plannedState === "enabled")
              .map((operation) => ({
                type: operation.extensionType,
                name: operation.name,
              })),
            configuredAgents,
          ),
        ),
      ).pipe(
        Effect.mapError((failure) =>
          failure._tag === "ConfiguredAgentOutcomesUnavailable"
            ? new StepFailure({
                category: failure.category,
                detail: failure.detail,
                ...(failure.suggestions === undefined ? {} : { suggestions: failure.suggestions }),
                ...(failure.cause === undefined ? {} : { cause: failure.cause }),
              })
            : workspaceStateReadFailureToStepFailure(failure),
        ),
        Effect.mapError((error): VerificationFailure<Output> => ({
          error,
          // Readback happens after independent closures settle. Preserve
          // those commits even when no postflight observation is available.
          attemptedExecution: result,
        })),
      );
      const currentOutcomes = operations.flatMap((operation) => {
        if (operation.plannedState !== "enabled") {
          return configuredAgentLifecycleOutcomes({
            type: operation.extensionType,
            name: operation.name,
            agentIds: configuredAgents,
            scope,
            state: "current",
            targetState: operation.plannedState,
            installed: false,
          });
        }
        const observed = readbacks.get(
          `${operation.extensionType}:${operation.name}`,
        )?.agentOutcomes;
        return (
          observed ??
          configuredAgentLifecycleOutcomes({
            type: operation.extensionType,
            name: operation.name,
            agentIds: configuredAgents,
            scope,
            state: "current",
            targetState: "enabled",
            installed: false,
          })
        );
      });
      const incomplete = currentOutcomes.find(
        ({ outcome }) => outcome === "blocked" || outcome === "failed",
      );
      const executedWithOutcomes = withExecutedAgentOutcomes(result, currentOutcomes);
      // A failed closure already states why its requested output was not realized.
      // Keep fresh per-agent evidence, including for committed siblings, without
      // replacing that typed failure and its recovery with a convergence symptom.
      if (incomplete !== undefined && failedStep === undefined) {
        return yield* Effect.fail({
          error: new StepFailure({
            category: "conflict",
            detail: `${incomplete.extensionType} ${incomplete.name} did not converge for ${incomplete.agentId}: ${incomplete.reason}`,
          }),
          attemptedExecution: executedWithOutcomes,
        });
      }
      const verified: ExecutedPlan<Output> = { ...executedWithOutcomes, candidateId };
      return verified;
    }),
  );
