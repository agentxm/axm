import { expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Semaphore from "effect/Semaphore";
import * as Tracer from "effect/Tracer";
import { withWorkspaceStateWrite } from "./shared.js";

it.effect("releases the document permit when cancellation arrives at diagnostic admission", () =>
  Effect.gen(function* () {
    const mutex = yield* Semaphore.make(1);
    let writes = 0;
    const mutation = Effect.sync(() => {
      writes++;
    });
    const pending = yield* Effect.withFiber((fiber) =>
      withWorkspaceStateWrite(
        mutex,
        "settings",
      )(mutation).pipe(
        Effect.withTracer(
          Tracer.make({
            span(options) {
              const span = new Tracer.NativeSpan(options);
              const end = span.end.bind(span);
              span.end = (time, exit) => {
                end(time, exit);
                if (span.name === "axm.wait.document-writer") fiber.interruptUnsafe();
              };
              return span;
            },
          }),
        ),
      ),
    ).pipe(Effect.forkChild);
    expect(Exit.hasInterrupts(yield* Fiber.await(pending))).toBe(true);
    expect(writes).toBe(0);
    yield* withWorkspaceStateWrite(mutex, "settings")(mutation);
    expect(writes).toBe(1);
  }),
);

for (const outcome of ["released", "interrupted"] as const) {
  it.effect(
    `attributes document admission through ${outcome} without including mutation work`,
    () =>
      Effect.gen(function* () {
        for (const owner of ["settings", "desired-state", "accepted-resolution"] as const) {
          const mutex = yield* Semaphore.make(1);
          yield* mutex.take(1);
          const started = yield* Deferred.make<void>();
          const finish = yield* Deferred.make<void>();
          let writes = 0;
          const spans: Tracer.NativeSpan[] = [];
          const tracer = Tracer.make({
            span(options) {
              const span = new Tracer.NativeSpan(options);
              spans.push(span);
              return span;
            },
          });
          const writer = yield* withWorkspaceStateWrite(
            mutex,
            owner,
          )(
            Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Deferred.await(finish)),
              Effect.andThen(
                Effect.sync(() => {
                  writes++;
                }),
              ),
            ),
          ).pipe(Effect.withTracer(tracer), Effect.forkChild);
          yield* Effect.yieldNow;
          const wait = spans.find((span) => span.name === "axm.wait.document-writer");
          expect(wait?.status._tag).toBe("Started");
          expect(wait?.attributes.get("axm.wait.owner")).toBe(owner);
          expect(writes).toBe(0);
          if (outcome === "released") {
            yield* mutex.release(1);
            yield* Deferred.await(started);
            expect(wait?.status._tag).toBe("Ended");
            expect(writes).toBe(0);
            yield* Deferred.succeed(finish, undefined);
            yield* Fiber.join(writer);
          } else {
            yield* Fiber.interrupt(writer);
            expect(wait?.status._tag === "Ended" && wait.status.exit._tag).toBe("Failure");
            expect(writes).toBe(0);
            yield* mutex.release(1);
            yield* withWorkspaceStateWrite(
              mutex,
              owner,
            )(
              Effect.sync(() => {
                writes++;
              }),
            );
          }
          expect(writes).toBe(1);
          yield* mutex.take(1);
          yield* mutex.release(1);
        }
      }),
  );
}
