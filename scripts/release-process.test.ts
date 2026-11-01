import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import { captureReleaseCommand, runReleaseCommand } from "./release-process.js";

describe("installed release process boundary", () => {
  it.effect(
    "captures output and rejects nonzero exit status without accepting partial output",
    () =>
      Effect.gen(function* () {
        expect(
          yield* captureReleaseCommand(process.execPath, [
            "-e",
            "process.stdout.write('observed\\n')",
          ]),
        ).toBe("observed");
        const failure = yield* Effect.flip(
          captureReleaseCommand(process.execPath, [
            "-e",
            "process.stdout.write('partial'); process.exitCode = 7",
          ]),
        );
        expect(failure).toMatchObject({ _tag: "ReleaseCommandFailed", exitCode: 7 });
        expect(
          yield* Effect.flip(runReleaseCommand(process.execPath, ["-e", "process.exitCode = 9"])),
        ).toMatchObject({ _tag: "ReleaseCommandFailed", exitCode: 9 });
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("interrupting a capture terminates its running child", () =>
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const started = yield* Deferred.make<ChildProcessSpawner.ChildProcessHandle>();
      const observedSpawner = ChildProcessSpawner.make((command) =>
        spawner.spawn(command).pipe(Effect.tap((child) => Deferred.succeed(started, child))),
      );
      const fiber = yield* Effect.forkChild(
        captureReleaseCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"]).pipe(
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, observedSpawner),
        ),
      );
      const child = yield* Deferred.await(started);
      yield* Fiber.interrupt(fiber);
      expect(yield* child.isRunning).toBe(false);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
