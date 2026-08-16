import * as Duration from "effect/Duration";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as ServiceMap from "effect/Context";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import type { ChildProcessSpawner as ChildProcessSpawnerService } from "effect/unstable/process/ChildProcessSpawner";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

export interface CommandResult {
  readonly executionState: "not-started" | "exited" | "timed-out";
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutTruncated?: boolean;
  readonly stderrTruncated?: boolean;
}

export interface RunCommandOptions {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly redactValues?: ReadonlyArray<string>;
}

export interface SubprocessService {
  readonly run: (
    command: string,
    args: ReadonlyArray<string>,
    options?: RunCommandOptions,
  ) => Effect.Effect<CommandResult>;
  readonly resolveExecutable: (command: string) => Effect.Effect<string | null>;
}

export class Subprocess extends ServiceMap.Service<Subprocess, SubprocessService>()(
  "axm.sh/root/upgrade/subprocess",
) {}

const defaultTimeoutMs = 120_000;
const MAX_RETAINED_OUTPUT_BYTES = 8 * 1024;

const ansiPattern =
  // eslint-disable-next-line no-control-regex -- intentionally strips terminal control sequences
  /[\u001B\u009B][[\]()#;?]*(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/gu;
const controlsPattern =
  // eslint-disable-next-line no-control-regex -- external process output is untrusted
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu;
const credentialUrlPattern = /(https?:\/\/)([^/\s:@]+):([^/@\s]+)@/giu;
const bearerPattern = /\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/giu;
const authorizationPattern = /\b(authorization|token|api[_-]?key|password)\s*[:=]\s*[^\s]+/giu;

export interface SanitizedOutput {
  readonly value: string;
  readonly truncated: boolean;
}

export const sanitizeExternalOutput = (
  input: string,
  redactValues: ReadonlyArray<string>,
): SanitizedOutput => {
  let value = input
    .replace(ansiPattern, "")
    .replace(controlsPattern, "")
    .replace(credentialUrlPattern, "$1[REDACTED]@")
    .replace(bearerPattern, "$1[REDACTED]")
    .replace(authorizationPattern, "$1=[REDACTED]");
  for (const secret of redactValues) {
    if (secret.length > 0) value = value.split(secret).join("[REDACTED]");
  }

  const encoded = new TextEncoder().encode(value);
  if (encoded.length <= MAX_RETAINED_OUTPUT_BYTES) {
    return { value, truncated: false };
  }
  value = new TextDecoder("utf-8", { fatal: false }).decode(
    encoded.slice(0, MAX_RETAINED_OUTPUT_BYTES),
  );
  return { value, truncated: true };
};

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

const unavailableResult = (
  executionState: "not-started" | "timed-out",
  detail: string,
): CommandResult => ({
  executionState,
  exitCode: null,
  stdout: "",
  stderr: detail,
});

const makeRunCommand =
  (spawner: ChildProcessSpawnerService["Service"]): SubprocessService["run"] =>
  (command, args, options) => {
    const timeoutMs = options?.timeoutMs ?? defaultTimeoutMs;

    return Effect.gen(function* () {
      const spawned = yield* spawner
        .spawn(
          ChildProcess.make(command, args, {
            cwd: options?.cwd,
            env: { ...(options?.env ?? {}) },
            extendEnv: true,
          }),
        )
        .pipe(Effect.option);
      if (Option.isNone(spawned)) {
        return unavailableResult("not-started", `Failed to execute ${command}`);
      }

      const completed = yield* Effect.all(
        {
          stdout: collectBytes(spawned.value.stdout),
          stderr: collectBytes(spawned.value.stderr),
          exitCode: spawned.value.exitCode,
        },
        { concurrency: "unbounded" },
      ).pipe(
        Effect.option,
        Effect.timeoutOrElse({
          duration: Duration.millis(timeoutMs),
          orElse: () => Effect.succeed(Option.none()),
        }),
      );
      if (Option.isNone(completed)) {
        return unavailableResult("timed-out", `Timed out executing ${command}`);
      }

      const stdout = sanitizeExternalOutput(completed.value.stdout, options?.redactValues ?? []);
      const stderr = sanitizeExternalOutput(completed.value.stderr, options?.redactValues ?? []);
      return {
        executionState: "exited",
        exitCode: Number(completed.value.exitCode),
        stdout: stdout.value,
        stderr: stderr.value,
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated,
      } satisfies CommandResult;
    }).pipe(Effect.scoped);
  };

const makeResolveExecutable =
  (fs: FileSystem.FileSystem, pathService: Path.Path): SubprocessService["resolveExecutable"] =>
  (command) =>
    Effect.gen(function* () {
      const pathValue = yield* Config.string("PATH").pipe(Config.withDefault(""), Effect.orDie);
      const extensions =
        process.platform === "win32"
          ? yield* Config.string("PATHEXT").pipe(
              Config.withDefault(".COM;.EXE;.BAT;.CMD"),
              Config.map((value) => value.split(";")),
              Effect.orDie,
            )
          : [""];
      const candidates = pathService.isAbsolute(command)
        ? [command]
        : pathValue
            .split(process.platform === "win32" ? ";" : ":")
            .filter((entry) => entry.length > 0)
            .flatMap((entry) =>
              extensions.map((extension) => pathService.join(entry, `${command}${extension}`)),
            );
      for (const candidate of candidates) {
        const info = yield* fs.stat(candidate).pipe(Effect.option);
        if (
          Option.isSome(info) &&
          info.value.type === "File" &&
          (process.platform === "win32" || (info.value.mode & 0o111) !== 0)
        ) {
          return candidate;
        }
      }
      return null;
    });

export const SubprocessLive = Layer.effect(
  Subprocess,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const fs = yield* FileSystem.FileSystem;
    const pathService = yield* Path.Path;
    return {
      run: makeRunCommand(spawner),
      resolveExecutable: makeResolveExecutable(fs, pathService),
    };
  }),
);
