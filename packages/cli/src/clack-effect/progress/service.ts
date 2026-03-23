import * as p from "@clack/prompts";
import * as Cause from "effect/Cause";
import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { ClackProgressConfig, ClackProgressHandle } from "./types.js";

export class ClackProgress extends ServiceMap.Service<
  ClackProgress,
  {
    readonly start: (
      config: ClackProgressConfig,
      message?: string,
    ) => Effect.Effect<ClackProgressHandle>;
    readonly withProgress: <A, E, R>(
      config: ClackProgressConfig,
      message: string,
      f: (handle: ClackProgressHandle) => Effect.Effect<A, E, R>,
      stopMessage?: string,
    ) => Effect.Effect<A, E, R>;
  }
>()("@axm.sh/cli/clack-effect/ClackProgress") {}

const makeHandle = (pr: p.ProgressResult): ClackProgressHandle => ({
  stop: (message) => Effect.sync(() => pr.stop(message)),
  message: (message) => Effect.sync(() => pr.message(message)),
  cancel: (message) => Effect.sync(() => pr.cancel(message)),
  error: (message) => Effect.sync(() => pr.error(message)),
  clear: () => Effect.sync(() => pr.clear()),
  advance: (step, message) => Effect.sync(() => pr.advance(step, message)),
});

const makeLiveClackProgressService = (): ServiceMap.Service.Shape<typeof ClackProgress> => ({
  start: (config, message) =>
    Effect.sync(() => {
      const pr = p.progress(config);
      pr.start(message);
      return makeHandle(pr);
    }),

  withProgress: (config, message, f, stopMessage) =>
    Effect.suspend(() => {
      const pr = p.progress(config);
      pr.start(message);
      const handle = makeHandle(pr);

      return Effect.interruptible(f(handle)).pipe(
        Effect.matchCauseEffect({
          onFailure: (cause) => {
            if (Cause.hasInterruptsOnly(cause)) {
              pr.cancel();
            } else {
              pr.error(message);
            }
            return Effect.failCause(cause);
          },
          onSuccess: (a) => {
            pr.stop(stopMessage ?? message);
            return Effect.succeed(a);
          },
        }),
        Effect.uninterruptible,
      );
    }),
});

export const ClackProgressLive: Layer.Layer<ClackProgress> = Layer.succeed(
  ClackProgress,
  makeLiveClackProgressService(),
);
