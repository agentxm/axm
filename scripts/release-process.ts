/** Installed release commands use the platform spawner so interruption owns the child. */
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

export class ReleaseCommandFailed extends Data.TaggedError("ReleaseCommandFailed")<{
  readonly command: string;
  readonly exitCode: number;
}> {
  override get message(): string {
    return `${this.command} exited with status ${this.exitCode}.`;
  }
}

export class ReleaseValidationFailed extends Data.TaggedError("ReleaseValidationFailed")<{
  readonly operation: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `${this.operation}: ${this.cause instanceof Error ? this.cause.message : String(this.cause)}`;
  }
}

/** Lift the existing deterministic release validators without losing expected failures. */
export const releaseValidation = <A>(operation: string, validate: () => A) =>
  Effect.try({
    try: validate,
    catch: (cause) => new ReleaseValidationFailed({ operation, cause }),
  });

type Options = Pick<ChildProcess.CommandOptions, "cwd" | "env">;

export const runReleaseCommand = (
  command: string,
  args: readonly string[],
  options: Options = {},
) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const exitCode = yield* spawner.exitCode(
      ChildProcess.make(command, args, {
        ...options,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      }),
    );
    if (exitCode !== 0) return yield* new ReleaseCommandFailed({ command, exitCode });
  });

export const captureReleaseCommand = (
  command: string,
  args: readonly string[],
  options: Options = {},
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const child = yield* spawner.spawn(
        ChildProcess.make(command, args, {
          ...options,
          stdout: "pipe",
          stderr: "inherit",
        }),
      );
      // Drain stdout while waiting for exit so a full pipe cannot deadlock the child.
      const [output, exitCode] = yield* Effect.all(
        [
          Stream.runFold(
            Stream.decodeText(child.stdout),
            () => "",
            (text, chunk) => text + chunk,
          ),
          child.exitCode,
        ],
        { concurrency: 2 },
      );
      if (exitCode !== 0) return yield* new ReleaseCommandFailed({ command, exitCode });
      return output.trim();
    }),
  );
