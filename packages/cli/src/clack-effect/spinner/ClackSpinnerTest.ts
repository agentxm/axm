import * as Cause from "effect/Cause";
import * as ServiceMap from "effect/ServiceMap";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { ClackSpinner, type ClackSpinnerOptions } from "./service.js";
import type { ClackSpinnerHandle } from "./types.js";

export interface ClackSpinnerCall {
  readonly method: string;
  readonly args: ReadonlyArray<unknown>;
}

export interface ClackSpinnerRecord {
  readonly calls: ReadonlyArray<ClackSpinnerCall>;
  readonly starts: ReadonlyArray<string>;
  readonly stops: ReadonlyArray<string>;
}

export type MockClackSpinnerService = {
  calls: Array<ClackSpinnerCall>;
  starts: Array<string>;
  stops: Array<string>;
};

const emptyRecord: ClackSpinnerRecord = {
  calls: [],
  starts: [],
  stops: [],
};

export class ClackSpinnerTest extends ServiceMap.Service<
  ClackSpinnerTest,
  {
    readonly ref: Ref.Ref<ClackSpinnerRecord>;
    readonly get: Effect.Effect<ClackSpinnerRecord>;
  }
>()("@axm.sh/cli/test/ClackSpinnerTest") {}

const appendCall = (
  ref: Ref.Ref<ClackSpinnerRecord>,
  method: string,
  args: ReadonlyArray<unknown>,
) =>
  Ref.update(ref, (r) => ({
    ...r,
    calls: [...r.calls, { method, args }],
  }));

const appendStart = (
  ref: Ref.Ref<ClackSpinnerRecord>,
  method: string,
  args: ReadonlyArray<unknown>,
  message: string,
) =>
  Ref.update(ref, (r) => ({
    ...r,
    calls: [...r.calls, { method, args }],
    starts: [...r.starts, message],
  }));

const appendStop = (
  ref: Ref.Ref<ClackSpinnerRecord>,
  method: string,
  args: ReadonlyArray<unknown>,
  message: string,
) =>
  Ref.update(ref, (r) => ({
    ...r,
    calls: [...r.calls, { method, args }],
    stops: [...r.stops, message],
  }));

const makeMockHandle = (
  recordCall: (method: string, args: ReadonlyArray<unknown>) => Effect.Effect<void>,
): ClackSpinnerHandle => ({
  stop: (message) => recordCall("handle.stop", [message]),
  message: (message) => recordCall("handle.message", [message]),
  cancel: (message) => recordCall("handle.cancel", [message]),
  error: (message) => recordCall("handle.error", [message]),
  clear: () => recordCall("handle.clear", []),
});

export const makeClackSpinnerTestLayer = (): readonly [
  Layer.Layer<ClackSpinner | ClackSpinnerTest>,
  MockClackSpinnerService,
] => {
  const mock: MockClackSpinnerService = {
    calls: [],
    starts: [],
    stops: [],
  };

  const layer: Layer.Layer<ClackSpinner | ClackSpinnerTest> = Layer.effectServices(
    Effect.gen(function* () {
      const ref = yield* Ref.make(emptyRecord);

      const recordCall = (method: string, args: ReadonlyArray<unknown>) =>
        Effect.sync(() => {
          mock.calls.push({ method, args });
        }).pipe(Effect.andThen(appendCall(ref, method, args)));

      const recordStart = (method: string, args: ReadonlyArray<unknown>, message: string) =>
        Effect.sync(() => {
          mock.calls.push({ method, args });
          mock.starts.push(message);
        }).pipe(Effect.andThen(appendStart(ref, method, args, message)));

      const recordStop = (method: string, args: ReadonlyArray<unknown>, message: string) =>
        Effect.sync(() => {
          mock.calls.push({ method, args });
          mock.stops.push(message);
        }).pipe(Effect.andThen(appendStop(ref, method, args, message)));

      const service: ServiceMap.Service.Shape<typeof ClackSpinner> = {
        start: (message) =>
          Effect.andThen(
            recordStart("start", [message], message ?? ""),
            Effect.succeed(makeMockHandle(recordCall)),
          ),
        withSpinner: <A, E, R>(
          message: string,
          f: (handle: ClackSpinnerHandle) => Effect.Effect<A, E, R>,
          options?: string | ClackSpinnerOptions<A>,
        ): Effect.Effect<A, E, R> =>
          Effect.suspend(() => {
            const handle = makeMockHandle(recordCall);
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

            return recordStart("withSpinner.start", [message], message).pipe(
              Effect.andThen(Effect.interruptible(f(handle))),
              Effect.matchCauseEffect({
                onFailure: (cause) => {
                  if (Cause.hasInterruptsOnly(cause)) {
                    return Effect.andThen(
                      recordStop("withSpinner.cancel", [], "Cancelled"),
                      Effect.failCause(cause),
                    );
                  }
                  return Effect.andThen(
                    recordStop("withSpinner.error", [message], failureMessage ?? "Failed"),
                    Effect.failCause(cause),
                  );
                },
                onSuccess: (a) => {
                  const resolvedStopMessage = successMessageFn?.(a) ?? staticStopMessage;
                  return Effect.andThen(
                    recordStop("withSpinner.stop", [resolvedStopMessage], resolvedStopMessage),
                    Effect.succeed(a),
                  );
                },
              }),
              Effect.uninterruptible,
            );
          }),
      };

      const test: ServiceMap.Service.Shape<typeof ClackSpinnerTest> = {
        ref,
        get: Ref.get(ref),
      };

      return ServiceMap.empty().pipe(
        ServiceMap.add(ClackSpinner, service),
        ServiceMap.add(ClackSpinnerTest, test),
      );
    }),
  );

  return [layer, mock] as const;
};

export const [ClackSpinnerTestLayer] = makeClackSpinnerTestLayer();
