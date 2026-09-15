import * as Effect from "effect/Effect";
import {
  OperationLifecycle,
  makeOperationLifecycle,
  subscribeLossless,
  type OperationEvent,
} from "@agentxm/workspace/transitions/planning";
import { UpgradeExecutionObserver } from "@agentxm/cli-maintenance/self-update/application";
import {
  makeUpgradeTrial,
  type UpgradeTrialOptions,
  type SubprocessInvocation,
} from "@agentxm/cli-maintenance/self-update/testing/native";
import { makeCliUpgradeExecutionObserver } from "../cli-runtime/upgrade-observation.js";

export interface ExternalCommandObservation {
  readonly invocation: SubprocessInvocation;
  readonly events: ReadonlyArray<OperationEvent>;
}

interface ObservedUpgradeOptions extends UpgradeTrialOptions {
  readonly duringExternalCommand?:
    ((observation: ExternalCommandObservation) => Effect.Effect<void>) | undefined;
}

/** Exercise the CLI observer over the native installation fixture. */
export const runUpgradeTrial = (options?: ObservedUpgradeOptions) =>
  Effect.gen(function* () {
    const events: Array<OperationEvent> = [];
    const lifecycle = yield* makeOperationLifecycle({
      name: options?.preview === true ? "Preview AXM upgrade" : "Upgrade AXM",
      mode: options?.preview === true ? "preview" : "apply",
    });
    yield* subscribeLossless(lifecycle, (event) =>
      Effect.sync(() => {
        events.push(event);
      }),
    );
    const during = options?.duringExternalCommand;
    const trial = yield* makeUpgradeTrial({
      ...options,
      beforeReply: (invocation) =>
        Effect.gen(function* () {
          if (options?.beforeReply !== undefined) yield* options.beforeReply(invocation);
          if (during === undefined) return;
          // Drain already-published events while the external command remains held.
          let seen = -1;
          while (seen !== events.length) {
            seen = events.length;
            yield* Effect.yieldNow;
          }
          yield* during({ invocation, events: [...events] });
        }),
    });
    const observer = yield* makeCliUpgradeExecutionObserver();
    const assessment = yield* trial
      .run()
      .pipe(
        Effect.provideService(UpgradeExecutionObserver, observer),
        Effect.provideService(OperationLifecycle, lifecycle),
        Effect.ensuring(lifecycle.settle("applied").pipe(Effect.andThen(lifecycle.drained.await))),
      );
    return {
      events,
      calls: trial.calls,
      installMetaWrites: trial.installMetaWrites,
      updateCheckWrites: trial.updateCheckWrites,
      releaseRequests: trial.releaseRequests,
      assessment,
    };
  }).pipe(Effect.scoped);

export const startedUnits = (events: ReadonlyArray<OperationEvent>) =>
  events.filter((event) => event._tag === "UnitStarted");

export const unitStartLabel = (
  events: ReadonlyArray<OperationEvent>,
  unitId: string,
): string | undefined =>
  events.flatMap((event) =>
    event._tag === "UnitStarted" && event.unitId === unitId ? [event.label] : [],
  )[0];

export const unitResolvedLabel = (
  events: ReadonlyArray<OperationEvent>,
  unitId: string,
): string | undefined =>
  events.flatMap((event) =>
    event._tag === "UnitResolved" && event.unitId === unitId ? [event.label] : [],
  )[0];

export const indexOfEvent = (
  events: ReadonlyArray<OperationEvent>,
  match: (event: OperationEvent) => boolean,
): number => events.findIndex(match);
