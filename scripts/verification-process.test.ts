import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import { runVerificationCommand, VerificationCommandFailed } from "./verification-process.js";

describe("verification process ownership", () => {
  it.effect("drains both pipes and preserves nonzero exit diagnostics", () =>
    Effect.gen(function* () {
      const output = yield* runVerificationCommand(
        ChildProcess.make(process.execPath, [
          "-e",
          "process.stdout.write('out'.repeat(100000)); process.stderr.write('err'.repeat(100000))",
        ]),
      );
      expect(output).toEqual({ stdout: "out".repeat(100000), stderr: "err".repeat(100000) });
      const failure = yield* Effect.flip(
        runVerificationCommand(
          ChildProcess.make(process.execPath, [
            "-e",
            "process.stdout.write('partial'); process.stderr.write('failed'); process.exitCode = 7",
          ]),
        ),
      );
      expect(failure).toBeInstanceOf(VerificationCommandFailed);
      expect(failure).toMatchObject({ exitCode: 7, stdout: "partial", stderr: "failed" });
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("terminates its child before interruption completes", () =>
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const started = yield* Deferred.make<ChildProcessSpawner.ChildProcessHandle>();
      const observed = ChildProcessSpawner.make((command) =>
        spawner.spawn(command).pipe(Effect.tap((child) => Deferred.succeed(started, child))),
      );
      const fiber = yield* Effect.forkChild(
        runVerificationCommand(
          ChildProcess.make(process.execPath, ["-e", "setInterval(() => {}, 1000)"]),
        ).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, observed)),
      );
      const child = yield* Deferred.await(started);
      yield* Fiber.interrupt(fiber);
      expect(yield* child.isRunning).toBe(false);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
