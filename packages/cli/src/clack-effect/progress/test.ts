import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ClackProgress, type ClackProgressService } from "./service.js";
import type { ClackProgressHandle } from "./types.js";

export interface ClackProgressCall {
  readonly method: string;
  readonly args: ReadonlyArray<unknown>;
}

export interface MockClackProgressService extends ClackProgressService {
  readonly calls: ClackProgressCall[];
}

const makeMockHandle = (calls: ClackProgressCall[]): ClackProgressHandle => ({
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
  advance: (step, message) =>
    Effect.sync(() => {
      calls.push({ method: "handle.advance", args: [step, message] });
    }),
});

export function makeClackProgressTestLayer(): [
  Layer.Layer<ClackProgress>,
  MockClackProgressService,
] {
  const calls: ClackProgressCall[] = [];

  const mockService: MockClackProgressService = {
    calls,
    start: (config, message) =>
      Effect.sync(() => {
        calls.push({ method: "start", args: [config, message] });
        return makeMockHandle(calls);
      }),
    withProgress: (config, message, f, stopMessage) =>
      Effect.suspend(() => {
        calls.push({ method: "withProgress.start", args: [config, message] });
        const handle = makeMockHandle(calls);

        return Effect.interruptible(f(handle)).pipe(
          Effect.matchCauseEffect({
            onFailure: (cause) => {
              if (Cause.isInterruptedOnly(cause)) {
                calls.push({ method: "withProgress.cancel", args: [] });
              } else {
                calls.push({ method: "withProgress.error", args: [message] });
              }
              return Effect.failCause(cause);
            },
            onSuccess: (a) => {
              calls.push({ method: "withProgress.stop", args: [stopMessage ?? message] });
              return Effect.succeed(a);
            },
          }),
          Effect.uninterruptible,
        );
      }),
  };

  const layer = Layer.succeed(ClackProgress, mockService);
  return [layer, mockService];
}
