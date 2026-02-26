import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ClackSpinner, type ClackSpinnerService } from "./service.js";
import type { ClackSpinnerHandle } from "./types.js";

export interface ClackSpinnerCall {
  readonly method: string;
  readonly args: ReadonlyArray<unknown>;
}

export interface MockClackSpinnerService extends ClackSpinnerService {
  readonly calls: ClackSpinnerCall[];
}

const makeMockHandle = (calls: ClackSpinnerCall[]): ClackSpinnerHandle => ({
  stop: (message) =>
    Effect.sync(() => {
      calls.push({ method: "handle.stop", args: [message] });
    }),
  message: (message) =>
    Effect.sync(() => {
      calls.push({ method: "handle.message", args: [message] });
    }),
  cancel: (message) =>
    Effect.sync(() => {
      calls.push({ method: "handle.cancel", args: [message] });
    }),
  error: (message) =>
    Effect.sync(() => {
      calls.push({ method: "handle.error", args: [message] });
    }),
  clear: () =>
    Effect.sync(() => {
      calls.push({ method: "handle.clear", args: [] });
    }),
});

export function makeClackSpinnerTestLayer(): [Layer.Layer<ClackSpinner>, MockClackSpinnerService] {
  const calls: ClackSpinnerCall[] = [];

  const mockService: MockClackSpinnerService = {
    calls,
    start: (message) =>
      Effect.sync(() => {
        calls.push({ method: "start", args: [message] });
        return makeMockHandle(calls);
      }),
    withSpinner: (message, f, stopMessage) =>
      Effect.suspend(() => {
        calls.push({ method: "withSpinner.start", args: [message] });
        const handle = makeMockHandle(calls);

        return Effect.interruptible(f(handle)).pipe(
          Effect.matchCauseEffect({
            onFailure: (cause) => {
              if (Cause.isInterruptedOnly(cause)) {
                calls.push({ method: "withSpinner.cancel", args: [] });
              } else {
                calls.push({ method: "withSpinner.error", args: [message] });
              }
              return Effect.failCause(cause);
            },
            onSuccess: (a) => {
              calls.push({ method: "withSpinner.stop", args: [stopMessage ?? message] });
              return Effect.succeed(a);
            },
          }),
          Effect.uninterruptible,
        );
      }),
  };

  const layer = Layer.succeed(ClackSpinner, mockService);
  return [layer, mockService];
}
