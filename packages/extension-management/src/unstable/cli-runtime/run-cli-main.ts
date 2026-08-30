// @effect-diagnostics anyUnknownInErrorContext:off — the sanctioned process entry accepts and renders unknown defects
import * as Effect from "effect/Effect";
import { CliError } from "effect/unstable/cli";
import { Buffer } from "node:buffer";
import { format as formatConsoleArgs } from "node:util";

import { handleError } from "./handle-error.js";
import { withGracefulShutdown } from "./graceful-shutdown.js";
import type { OutputFormat } from "./output-mode.js";
import { resolveFormatFromArgv } from "./resolve-format.js";
import { resolveVerbosityFromArgv } from "../cli-flags/resolve-verbosity.js";
import type { VerbosityLevel } from "../cli-flags/verbosity.js";

export interface CliMainContext {
  readonly verbosityLevel: VerbosityLevel;
}

/**
 * Resolve CLI context from argv before Effect runs.
 * These values are passed into `makeFoundationLayer` by callers.
 */
export const resolveCliContext = (args: ReadonlyArray<string>): CliMainContext => ({
  verbosityLevel: resolveVerbosityFromArgv(args),
});

type WriteCallback = (error?: Error | null) => void;

const chunkToString = (chunk: string | Uint8Array, encoding?: BufferEncoding): string =>
  typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(encoding);

const invokeWriteCallback = (
  encodingOrCallback: BufferEncoding | WriteCallback | undefined,
  callback: WriteCallback | undefined,
): void => {
  if (typeof encodingOrCallback === "function") {
    encodingOrCallback();
    return;
  }
  callback?.();
};

const writeChunk = (
  write: (chunk: string, callback: WriteCallback) => boolean,
  chunk: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    write(chunk, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

const flushChunks = async (
  write: (chunk: string, callback: WriteCallback) => boolean,
  chunks: Array<string>,
): Promise<void> => {
  const pending = chunks.splice(0);
  for (const chunk of pending) {
    await writeChunk(write, chunk);
  }
};

const bufferStdout = (): {
  readonly contents: () => string;
  readonly discard: () => void;
  readonly flushToStderr: () => Promise<void>;
  readonly flushToStdout: () => Promise<void>;
  readonly restore: () => void;
} => {
  const originalWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const originalConsoleLog = console.log.bind(console);
  const chunks: Array<string> = [];
  const bufferedWrite = ((
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | WriteCallback,
    callback?: WriteCallback,
  ): boolean => {
    chunks.push(
      chunkToString(chunk, typeof encodingOrCallback === "string" ? encodingOrCallback : undefined),
    );
    invokeWriteCallback(encodingOrCallback, callback);
    return true;
  }) satisfies typeof process.stdout.write;
  const bufferedLog = ((...args: ReadonlyArray<unknown>): void => {
    chunks.push(`${formatConsoleArgs(...args)}\n`);
  }) satisfies typeof console.log;

  process.stdout.write = bufferedWrite;
  console.log = bufferedLog;

  return {
    contents: () => chunks.join(""),
    discard: () => {
      chunks.length = 0;
    },
    flushToStderr: () => flushChunks(originalStderrWrite, chunks),
    flushToStdout: () => flushChunks(originalWrite, chunks),
    restore: () => {
      process.stdout.write = originalWrite;
      console.log = originalConsoleLog;
    },
  };
};

/**
 * Validate the complete buffered stdout channel before any machine output is
 * released. JSON.parse accepts exactly one JSON value plus surrounding
 * whitespace, so concatenated documents and stray human text both fail.
 *
 * Empty stdout is permitted for diagnostics-only success paths. The command
 * contract register separately identifies which commands must emit a result.
 */
const validateMachineStdout = (stdout: string): void => {
  if (stdout.trim().length === 0) return;

  try {
    JSON.parse(stdout);
  } catch (cause) {
    throw new Error(
      "Machine-output contract violation: stdout must contain at most one complete JSON document.",
      { cause },
    );
  }
};

const bufferStderr = (): {
  readonly discard: () => void;
  readonly flushToStderr: () => Promise<void>;
  readonly restore: () => void;
} => {
  const originalWrite = process.stderr.write.bind(process.stderr);
  const chunks: Array<string> = [];
  const bufferedWrite = ((
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | WriteCallback,
    callback?: WriteCallback,
  ): boolean => {
    chunks.push(
      chunkToString(chunk, typeof encodingOrCallback === "string" ? encodingOrCallback : undefined),
    );
    invokeWriteCallback(encodingOrCallback, callback);
    return true;
  }) satisfies typeof process.stderr.write;

  process.stderr.write = bufferedWrite;

  return {
    discard: () => {
      chunks.length = 0;
    },
    flushToStderr: () => flushChunks(originalWrite, chunks),
    restore: () => {
      process.stderr.write = originalWrite;
    },
  };
};

const isUsageHelpError = (error: unknown): boolean =>
  CliError.isCliError(error) && error._tag === "ShowHelp" && error.errors.length > 0;

/**
 * Whether this invocation runs in an interactive session that may render live
 * output (prompts, spinners) before the program resolves.
 *
 * Output buffering is incompatible with such sessions: an interactive prompt
 * blocks waiting for input, so the program never resolves and the buffer never
 * flushes — buffered prompt frames and spinners would never reach the terminal,
 * making it appear to hang. We only buffer non-interactive sessions, which is
 * where rerouting/deduping parser usage-help (ShowHelp) actually matters
 * (piped output, CI, `--json`, `--non-interactive`).
 *
 * Mirrors the interactivity resolution in `isNonInteractive`: explicit
 * `--non-interactive` flag → `CI` env var → stdin is not a TTY. `--json` always
 * forces machine output, so it is treated as non-interactive here.
 */
const isInteractiveSession = (args: ReadonlyArray<string>, format: OutputFormat): boolean =>
  format === "text" &&
  process.stdin.isTTY === true &&
  // eslint-disable-next-line no-restricted-properties -- Pre-runtime bootstrap: Effect Config is unavailable before the runtime is built
  process.env["CI"] !== "true" &&
  !args.includes("--non-interactive");

// Raw async/await: bootstraps the CLI before the Effect runtime is configured.
export const runCliMain = async (
  execute: (args: ReadonlyArray<string>) => Effect.Effect<void, unknown, never>,
  options?: {
    readonly args?: ReadonlyArray<string> | undefined;
  },
): Promise<void> => {
  const args = options?.args ?? process.argv.slice(2);
  const format = resolveFormatFromArgv(args);
  const interactive = isInteractiveSession(args, format);
  const stdoutBuffer = interactive ? undefined : bufferStdout();
  const stderrBuffer = !interactive && format === "text" ? bufferStderr() : undefined;

  try {
    // eslint-disable-next-line no-restricted-syntax -- runCliMain is the sanctioned CLI process-entry adapter.
    await Effect.runPromise(withGracefulShutdown(execute(args)));
    if (format === "json" && stdoutBuffer !== undefined) {
      try {
        validateMachineStdout(stdoutBuffer.contents());
      } catch (error) {
        stdoutBuffer.discard();
        throw error;
      }
    }
    await stdoutBuffer?.flushToStdout();
    await stderrBuffer?.flushToStderr();
  } catch (error) {
    const isUsageHelp = isUsageHelpError(error);
    if (isUsageHelp) {
      if (format === "text") {
        stderrBuffer?.discard();
        await stdoutBuffer?.flushToStderr();
      } else {
        stdoutBuffer?.discard();
      }
    } else {
      await stdoutBuffer?.flushToStdout();
      await stderrBuffer?.flushToStderr();
    }
    stdoutBuffer?.restore();
    stderrBuffer?.restore();
    await handleError(error, format);
  } finally {
    stdoutBuffer?.restore();
    stderrBuffer?.restore();
  }
};
