import * as p from "@clack/prompts";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { ClackSpinnerHandle } from "./types.js";

export interface ClackSpinnerService {
  readonly start: (message?: string) => Effect.Effect<ClackSpinnerHandle>;
  readonly withSpinner: <A, E, R>(
    message: string,
    f: (handle: ClackSpinnerHandle) => Effect.Effect<A, E, R>,
    stopMessage?: string,
  ) => Effect.Effect<A, E, R>;
}

export class ClackSpinner extends Context.Tag("@axm.sh/cli/clack-effect/ClackSpinner")<
  ClackSpinner,
  ClackSpinnerService
>() {}

const makeHandle = (s: p.SpinnerResult): ClackSpinnerHandle => ({
  stop: (message) => Effect.sync(() => s.stop(message)),
  message: (message) => Effect.sync(() => s.message(message)),
  cancel: (message) => Effect.sync(() => s.cancel(message)),
  error: (message) => Effect.sync(() => s.error(message)),
  clear: () => Effect.sync(() => s.clear()),
});

const makeLiveClackSpinnerService = (): ClackSpinnerService => ({
  start: (message) =>
    Effect.sync(() => {
      const s = p.spinner();
      s.start(message);
      return makeHandle(s);
    }),

  withSpinner: (message, f, stopMessage) =>
    Effect.suspend(() => {
      const s = p.spinner();
      s.start(message);
      const handle = makeHandle(s);

      return Effect.interruptible(f(handle)).pipe(
        Effect.matchCauseEffect({
          onFailure: (cause) => {
            if (Cause.isInterruptedOnly(cause)) {
              s.cancel();
            } else {
              s.error(message);
            }
            return Effect.failCause(cause);
          },
          onSuccess: (a) => {
            s.stop(stopMessage ?? message);
            return Effect.succeed(a);
          },
        }),
        Effect.uninterruptible,
      );
    }),
});

export const ClackSpinnerLive: Layer.Layer<ClackSpinner> = Layer.succeed(
  ClackSpinner,
  makeLiveClackSpinnerService(),
);
