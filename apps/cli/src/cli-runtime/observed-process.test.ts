import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as Tracer from "effect/Tracer";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import { observedProcessSpawner } from "./index.js";

describe("Observed child process lifetime", () => {
  for (const exitCode of [0, 7])
    it.live(
      `observes actual exit ${exitCode} after gated child work without consuming its output`,
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            const ready = yield* Deferred.make<void>();
            const ended = yield* Deferred.make<Tracer.NativeSpan>();
            const spans: Tracer.NativeSpan[] = [];
            yield* Effect.gen(function* () {
              const real = yield* ChildProcessSpawner.ChildProcessSpawner;
              const child = yield* observedProcessSpawner(real).spawn(
                ChildProcess.make(process.execPath, [
                  "-e",
                  `process.stdout.write("ready\\n"); process.stdin.once("data", () => { process.stdout.write("done\\n"); process.exitCode = ${exitCode}; process.stdin.destroy(); });`,
                ]),
              );
              let receivedOutput = "";
              const output = yield* child.stdout.pipe(
                Stream.decodeText,
                Stream.tap((chunk) => {
                  receivedOutput += chunk;
                  return receivedOutput.includes("ready\n")
                    ? Deferred.succeed(ready, undefined)
                    : Effect.void;
                }),
                Stream.runCollect,
                Effect.forkChild,
              );
              yield* Deferred.await(ready);
              const running = spans.find((span) => span.name === "axm.process.run");
              const spawn = spans.find((span) => span.name === "axm.process.spawn");
              expect(yield* child.isRunning).toBe(true);
              expect(running?.status._tag).toBe("Started");
              expect(spawn?.status._tag).toBe("Ended");
              expect(Option.getOrUndefined(spawn?.parent ?? Option.none())?.spanId).toBe(
                running?.spanId,
              );
              yield* Stream.run(Stream.make(new TextEncoder().encode("continue\n")), child.stdin);
              expect(yield* child.exitCode).toBe(exitCode);
              const completed = yield* Deferred.await(ended);
              expect(yield* child.isRunning).toBe(false);
              expect(completed.attributes.get("axm.exit.code")).toBe(exitCode);
              expect(completed.attributes.get("axm.work.requested")).toBe(1);
              expect(completed.attributes.get("axm.work.executed")).toBe(1);
              expect(completed.attributes.get("axm.outcome")).toBe(
                exitCode === 0 ? "success" : "failure",
              );
              expect(completed.status._tag).toBe("Ended");
              expect((yield* Fiber.join(output)).join("")).toBe("ready\ndone\n");
              expect(spans.filter((span) => span.name === "axm.process.run")).toHaveLength(1);
              expect(spans.filter((span) => span.name === "axm.process.spawn")).toHaveLength(1);
            }).pipe(
              Effect.provide(NodeServices.layer),
              Effect.withTracer(
                Tracer.make({
                  span(options) {
                    const span = new Tracer.NativeSpan(options);
                    const finish = span.end.bind(span);
                    span.end = (time, exit) => {
                      finish(time, exit);
                      if (span.name === "axm.process.run")
                        Deferred.doneUnsafe(ended, Effect.succeed(span));
                    };
                    spans.push(span);
                    return span;
                  },
                }),
              ),
            );
          }),
        ),
    );

  it.live("records a failed spawn attempt without claiming that a child executed", () =>
    Effect.gen(function* () {
      const spans: Tracer.NativeSpan[] = [];
      const result = yield* Effect.exit(
        Effect.scoped(
          Effect.gen(function* () {
            const real = yield* ChildProcessSpawner.ChildProcessSpawner;
            return yield* observedProcessSpawner(real).spawn(
              ChildProcess.make(join(tmpdir(), "axm-absent-executable-" + randomUUID()), []),
            );
          }),
        ).pipe(
          Effect.provide(NodeServices.layer),
          Effect.withTracer(
            Tracer.make({
              span(options) {
                const span = new Tracer.NativeSpan(options);
                spans.push(span);
                return span;
              },
            }),
          ),
        ),
      );
      expect(Exit.isFailure(result)).toBe(true);
      const runs = spans.filter((span) => span.name === "axm.process.run");
      const attempts = spans.filter((span) => span.name === "axm.process.spawn");
      expect(runs).toHaveLength(1);
      expect(attempts).toHaveLength(1);
      expect(runs[0]?.status._tag).toBe("Ended");
      expect(runs[0]?.attributes.get("axm.work.requested")).toBe(1);
      expect(runs[0]?.attributes.has("axm.work.executed")).toBe(false);
      expect(attempts[0]?.attributes.get("axm.work.executed")).toBe(1);
    }),
  );

  it.live(
    "remains open while interrupted process cleanup is blocked and ends after the child is gone",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const ready = yield* Deferred.make<ChildProcessSpawner.ChildProcessHandle>();
          const closing = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const spans: Tracer.NativeSpan[] = [];
          const work = Effect.scoped(
            Effect.gen(function* () {
              const real = yield* ChildProcessSpawner.ChildProcessSpawner;
              const gated = ChildProcessSpawner.make((command) =>
                Effect.gen(function* () {
                  const handle = yield* real.spawn(command);
                  yield* Effect.addFinalizer(() =>
                    Deferred.succeed(closing, undefined).pipe(
                      Effect.andThen(Deferred.await(release)),
                    ),
                  );
                  return handle;
                }),
              );
              const child = yield* observedProcessSpawner(gated).spawn(
                ChildProcess.make(process.execPath, ["-e", "setInterval(() => {}, 1000)"]),
              );
              yield* Deferred.succeed(ready, child);
              return yield* Effect.never;
            }),
          ).pipe(
            Effect.provide(NodeServices.layer),
            Effect.withTracer(
              Tracer.make({
                span(options) {
                  const span = new Tracer.NativeSpan(options);
                  spans.push(span);
                  return span;
                },
              }),
            ),
          );
          const fiber = yield* Effect.forkChild(work);
          const child = yield* Deferred.await(ready);
          const stopping = yield* Effect.forkChild(Fiber.interrupt(fiber));
          yield* Deferred.await(closing);
          yield* Effect.gen(function* () {
            expect(yield* child.isRunning).toBe(true);
            expect(spans.find((span) => span.name === "axm.process.run")?.status._tag).toBe(
              "Started",
            );
          }).pipe(Effect.ensuring(Deferred.succeed(release, undefined)));
          yield* Fiber.join(stopping);
          expect(yield* child.isRunning).toBe(false);
          expect(spans.find((span) => span.name === "axm.process.run")?.status._tag).toBe("Ended");
        }),
      ),
  );
});
