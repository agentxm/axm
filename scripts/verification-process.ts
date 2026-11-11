/** Installed verification owns each process until its streams and exit have settled. */
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

export class VerificationFailed extends Data.TaggedError("VerificationFailed")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {
  override get message(): string {
    return this.detail;
  }
}

export class VerificationCommandFailed extends Data.TaggedError("VerificationCommandFailed")<{
  readonly command: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}> {
  override get message(): string {
    return [
      `Command failed (${this.command}) with exit ${this.exitCode}.`,
      this.stdout.trim(),
      this.stderr.trim(),
    ]
      .filter((line) => line.length > 0)
      .join("\n");
  }
}

export const runVerificationCommand = Effect.fnUntraced(function* (command: ChildProcess.Command) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const child = yield* spawner.spawn(command);
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [
      Stream.runFold(
        Stream.decodeText(child.stdout),
        () => "",
        (text, chunk) => text + chunk,
      ),
      Stream.runFold(
        Stream.decodeText(child.stderr),
        () => "",
        (text, chunk) => text + chunk,
      ),
      child.exitCode,
    ],
    { concurrency: 3 },
  );
  if (exitCode !== 0)
    return yield* new VerificationCommandFailed({
      command: command._tag === "StandardCommand" ? command.command : "pipeline",
      exitCode,
      stdout,
      stderr,
    });
  return { stdout, stderr };
}, Effect.scoped);
