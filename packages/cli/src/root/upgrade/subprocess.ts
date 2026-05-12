import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ServiceMap from "effect/Context";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import type { ChildProcessSpawner as ChildProcessSpawnerService } from "effect/unstable/process/ChildProcessSpawner";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

import { type AppError, makeAppError } from "@agentxm/client-core/unstable/app-error";

export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunCommandOptions {
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

export interface SubprocessService {
  readonly run: (
    command: string,
    args: ReadonlyArray<string>,
    options?: RunCommandOptions,
  ) => Effect.Effect<CommandResult, AppError>;
}

export class Subprocess extends ServiceMap.Service<Subprocess, SubprocessService>()(
  "axm.sh/root/upgrade/subprocess",
) {}

const defaultTimeoutMs = 120_000;

const collectBytes = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Effect.gen(function* () {
    const chunks = yield* Stream.runCollect(stream);
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const bytes = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }

    return new TextDecoder("utf-8").decode(bytes);
  });

const makeRunCommand =
  (spawner: ChildProcessSpawnerService["Service"]): SubprocessService["run"] =>
  (command, args, options) => {
    const timeoutMs = options?.timeoutMs ?? defaultTimeoutMs;

    return Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make(command, args, {
          env: { ...(options?.env ?? {}) },
          extendEnv: true,
        }),
      );

      const result = yield* Effect.all(
        {
          stdout: collectBytes(handle.stdout),
          stderr: collectBytes(handle.stderr),
          exitCode: handle.exitCode,
        },
        { concurrency: "unbounded" },
      );

      return {
        exitCode: Number(result.exitCode),
        stdout: result.stdout,
        stderr: result.stderr,
      };
    }).pipe(
      Effect.scoped,
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          message: `Failed to execute ${command}`,
          breadcrumbs: [{ description: "Check that the command is installed and on PATH." }],
          cause,
        }),
      ),
      Effect.timeoutOrElse({
        duration: Duration.millis(timeoutMs),
        orElse: () =>
          Effect.fail(
            makeAppError({
              code: "internal",
              message: `Timed out executing ${command}`,
              breadcrumbs: [{ description: "Check the package manager state and try again." }],
            }),
          ),
      }),
    );
  };

export const SubprocessLive = Layer.effect(
  Subprocess,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    return { run: makeRunCommand(spawner) };
  }),
);
