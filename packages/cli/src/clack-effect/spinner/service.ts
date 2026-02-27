import * as p from "@clack/prompts";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { ClackSpinnerHandle } from "./types.js";

export interface ClackSpinnerOptions<A> {
  readonly successMessage?: string | ((value: A) => string);
  readonly failureMessage?: string;
}

export class ClackSpinner extends Context.Tag("@axm.sh/cli/clack-effect/ClackSpinner")<
  ClackSpinner,
  {
    readonly start: (message?: string) => Effect.Effect<ClackSpinnerHandle>;
    readonly withSpinner: <A, E, R>(
      message: string,
      f: (handle: ClackSpinnerHandle) => Effect.Effect<A, E, R>,
      options?: string | ClackSpinnerOptions<A>,
    ) => Effect.Effect<A, E, R>;
  }
>() {}

const makeHandle = (s: p.SpinnerResult): ClackSpinnerHandle => ({
  stop: (message) => Effect.sync(() => s.stop(message)),
  message: (message) => Effect.sync(() => s.message(message)),
  cancel: (message) => Effect.sync(() => s.cancel(message)),
  error: (message) => Effect.sync(() => s.error(message)),
  clear: () => Effect.sync(() => s.clear()),
});

const makeLiveClackSpinnerService = (): Context.Tag.Service<typeof ClackSpinner> => ({
  start: (message) =>
    Effect.sync(() => {
      const s = p.spinner();
      s.start(message);
      return makeHandle(s);
    }),

  withSpinner: (message, f, options) =>
    Effect.suspend(() => {
      const s = p.spinner();
      s.start(message);
      const handle = makeHandle(s);
      const successMessage =
        typeof options === "string"
          ? options
          : typeof options?.successMessage === "string"
            ? options.successMessage
            : undefined;
      const successMessageFn =
        typeof options === "object" && typeof options.successMessage === "function"
          ? options.successMessage
          : undefined;
      const failureMessage = typeof options === "object" ? options.failureMessage : undefined;

      return Effect.interruptible(f(handle)).pipe(
        Effect.matchCauseEffect({
          onFailure: (cause) => {
            if (Cause.isInterruptedOnly(cause)) {
              s.cancel();
            } else {
              s.error(failureMessage ?? message);
            }
            return Effect.failCause(cause);
          },
          onSuccess: (a) => {
            s.stop(successMessageFn?.(a) ?? successMessage ?? message);
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
