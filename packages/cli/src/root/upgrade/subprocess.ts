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
  readonly stdoutTruncated?: boolean;
  readonly stderrTruncated?: boolean;
}

export interface RunCommandOptions {
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly redactValues?: ReadonlyArray<string>;
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

      const stdout = sanitizeExternalOutput(result.stdout, options?.redactValues ?? []);
      const stderr = sanitizeExternalOutput(result.stderr, options?.redactValues ?? []);
      return {
        exitCode: Number(result.exitCode),
        stdout: stdout.value,
        stderr: stderr.value,
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated,
      };
    }).pipe(
      Effect.scoped,
      Effect.mapError((cause) =>
        makeAppError({
          code: "internal",
          detail: `Failed to execute ${command}`,
          suggestions: [{ description: "Check that the command is installed and on PATH." }],
          cause,
        }),
      ),
      Effect.timeoutOrElse({
        duration: Duration.millis(timeoutMs),
        orElse: () =>
          Effect.fail(
            makeAppError({
              code: "internal",
              detail: `Timed out executing ${command}`,
              suggestions: [{ description: "Check the package manager state and try again." }],
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
