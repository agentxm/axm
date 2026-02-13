import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Spinner } from "./service.js";
import type { SpinnerHandle } from "./types.js";

export interface MockSpinnerService {
  readonly starts: string[];
  readonly stops: string[];
  /** Number of times stopAll was called. */
  readonly stopAllCalls: number[];
  readonly start: (message: string) => Effect.Effect<SpinnerHandle>;
  readonly stopAll: Effect.Effect<void>;
}

export function makeSpinnerTestLayer(): [Layer.Layer<Spinner>, MockSpinnerService] {
  const starts: string[] = [];
  const stops: string[] = [];
  const stopAllCalls: number[] = [];
  let activeCount = 0;

  const mock: MockSpinnerService = {
    starts,
    stops,
    stopAllCalls,
    start: (message) =>
      Effect.sync(() => {
        starts.push(message);
        activeCount++;
        return {
          stop: (stopMessage: string) =>
            Effect.sync(() => {
              activeCount--;
              stops.push(stopMessage);
            }),
        } satisfies SpinnerHandle;
      }),
    stopAll: Effect.sync(() => {
      stopAllCalls.push(activeCount);
      activeCount = 0;
    }),
  };

  const layer = Layer.succeed(Spinner, mock);
  return [layer, mock];
}
