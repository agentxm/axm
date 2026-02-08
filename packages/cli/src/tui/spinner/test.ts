import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Spinner } from "./service.js";
import type { SpinnerHandle } from "./types.js";

export interface MockSpinnerService {
  readonly starts: string[];
  readonly stops: string[];
  readonly start: (message: string) => Effect.Effect<SpinnerHandle>;
}

export function makeSpinnerTestLayer(): [Layer.Layer<Spinner>, MockSpinnerService] {
  const starts: string[] = [];
  const stops: string[] = [];

  const mock: MockSpinnerService = {
    starts,
    stops,
    start: (message) =>
      Effect.sync(() => {
        starts.push(message);
        return {
          stop: (stopMessage: string) =>
            Effect.sync(() => {
              stops.push(stopMessage);
            }),
        } satisfies SpinnerHandle;
      }),
  };

  const layer = Layer.succeed(Spinner, mock);
  return [layer, mock];
}
