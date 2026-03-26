import { expect } from "vitest";

import type { CliResult, RunCliOptions } from "./types.js";

export const expectStderr = (result: CliResult, pattern: string | RegExp): void => {
  if (typeof pattern === "string") {
    expect(result.stderr).toContain(pattern);
  } else {
    expect(result.stderr).toMatch(pattern);
  }
};

export const expectStdout = (result: CliResult, pattern: string | RegExp): void => {
  if (typeof pattern === "string") {
    expect(result.stdout).toContain(pattern);
  } else {
    expect(result.stdout).toMatch(pattern);
  }
};

export const expectExitCode = (result: CliResult, code: number): void => {
  if (result.exitCode !== code) {
    throw new Error(
      `Expected exit code ${code}, got ${result.exitCode}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }
};

export const parseJsonOutput = (result: CliResult): unknown => {
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`Expected valid JSON on stdout, got:\n${result.stdout}`);
  }
};

export const parseNdjsonOutput = (result: CliResult): ReadonlyArray<unknown> => {
  return result.stdout
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Invalid JSON on line ${i + 1}: ${line}`);
      }
    });
};

export const getOutput = (result: CliResult): string => result.stdout + result.stderr;

export const expectNonInteractiveSuccess = async (
  runCli: (args: ReadonlyArray<string>, options?: RunCliOptions) => Promise<CliResult>,
  args: ReadonlyArray<string>,
): Promise<CliResult> => {
  const result = await runCli([...args, "--non-interactive"]);
  expectExitCode(result, 0);
  return result;
};

export const expectNonInteractiveFailure = async (
  runCli: (args: ReadonlyArray<string>, options?: RunCliOptions) => Promise<CliResult>,
  args: ReadonlyArray<string>,
): Promise<CliResult> => {
  const result = await runCli([...args, "--non-interactive"]);
  if (result.exitCode === 0) {
    throw new Error(
      `Expected non-zero exit code, got 0\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }
  return result;
};
