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
  readonly starts: string[];
  readonly stops: string[];
  readonly stopAllCalls: number[];
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
  const starts: string[] = [];
  const stops: string[] = [];
  const stopAllCalls: number[] = [];

  const mockService: MockClackSpinnerService = {
    calls,
    starts,
    stops,
    stopAllCalls,
    start: (message) =>
      Effect.sync(() => {
        calls.push({ method: "start", args: [message] });
        starts.push(message ?? "");
        return makeMockHandle(calls);
      }),
    withSpinner: (message, f, options) =>
      Effect.suspend(() => {
        calls.push({ method: "withSpinner.start", args: [message] });
        starts.push(message);
        const handle = makeMockHandle(calls);
        const staticStopMessage =
          typeof options === "string"
            ? options
            : typeof options?.successMessage === "string"
              ? options.successMessage
              : message;
        const successMessageFn =
          typeof options === "object" && typeof options.successMessage === "function"
            ? options.successMessage
            : undefined;
        const failureMessage = typeof options === "object" ? options.failureMessage : undefined;

        return Effect.interruptible(f(handle)).pipe(
          Effect.matchCauseEffect({
            onFailure: (cause) => {
              if (Cause.isInterruptedOnly(cause)) {
                calls.push({ method: "withSpinner.cancel", args: [] });
                stops.push("Cancelled");
              } else {
                calls.push({ method: "withSpinner.error", args: [message] });
                stops.push(failureMessage ?? "Failed");
              }
              return Effect.failCause(cause);
            },
            onSuccess: (a) => {
              const resolvedStopMessage = successMessageFn?.(a) ?? staticStopMessage;
              calls.push({ method: "withSpinner.stop", args: [resolvedStopMessage] });
              stops.push(resolvedStopMessage);
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
