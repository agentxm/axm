import * as Effect from "effect/Effect";
import { CliError } from "effect/unstable/cli";
import { Buffer } from "node:buffer";
import { format as formatConsoleArgs } from "node:util";

import { handleError } from "./handle-error.js";
import { withGracefulShutdown } from "./graceful-shutdown.js";
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

const bufferStdout = (): {
  readonly discard: () => void;
  readonly flushToStderr: () => void;
  readonly flushToStdout: () => void;
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
    discard: () => {
      chunks.length = 0;
    },
    flushToStderr: () => {
      for (const chunk of chunks) {
        originalStderrWrite(chunk);
      }
      chunks.length = 0;
    },
    flushToStdout: () => {
      for (const chunk of chunks) {
        originalWrite(chunk);
      }
      chunks.length = 0;
    },
    restore: () => {
      process.stdout.write = originalWrite;
      console.log = originalConsoleLog;
    },
  };
};

const bufferStderr = (): {
  readonly discard: () => void;
  readonly flushToStderr: () => void;
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
    flushToStderr: () => {
      for (const chunk of chunks) {
        originalWrite(chunk);
      }
      chunks.length = 0;
    },
    restore: () => {
      process.stderr.write = originalWrite;
    },
  };
};

const isUsageHelpError = (error: unknown): boolean =>
  CliError.isCliError(error) && error._tag === "ShowHelp" && error.errors.length > 0;

// Raw async/await: bootstraps the CLI before the Effect runtime is configured.
export const runCliMain = async (
  execute: (args: ReadonlyArray<string>) => Effect.Effect<void, unknown, never>,
  options?: {
    readonly args?: ReadonlyArray<string> | undefined;
  },
): Promise<void> => {
  const args = options?.args ?? process.argv.slice(2);
  const format = resolveFormatFromArgv(args);
  const stdoutBuffer = bufferStdout();
  const stderrBuffer = format === "text" ? bufferStderr() : undefined;

  try {
    await Effect.runPromise(withGracefulShutdown(execute(args)));
    stdoutBuffer.flushToStdout();
    stderrBuffer?.flushToStderr();
  } catch (error) {
    const isUsageHelp = isUsageHelpError(error);
    if (isUsageHelp) {
      if (format === "text") {
        stderrBuffer?.discard();
        stdoutBuffer.flushToStderr();
      } else {
        stdoutBuffer.discard();
      }
    } else {
      stdoutBuffer.flushToStdout();
      stderrBuffer?.flushToStderr();
    }
    stdoutBuffer.restore();
    stderrBuffer?.restore();
    handleError(error, format);
  } finally {
    stdoutBuffer.restore();
    stderrBuffer?.restore();
  }
};
