/**
 * E2E test utilities for CLI testing.
 *
 * Provides helpers for spawning the CLI as a subprocess and managing
 * temporary test directories.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execa } from "execa";

/**
 * Path to the CLI entry point.
 */
const CLI_PATH = path.resolve(import.meta.dirname, "../main.ts");

/**
 * Path to the dev CLI entry point.
 */
const DEV_CLI_PATH = path.resolve(import.meta.dirname, "../dev-main.ts");

/**
 * Result from running the CLI.
 */
export interface CliResult {
  /** Exit code (0 = success) */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
}

/**
 * Options for running the CLI.
 */
export interface RunCliOptions {
  /** Working directory for the CLI process */
  cwd?: string;
  /** Environment variables to set */
  env?: Record<string, string>;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
}

async function run(
  entryPoint: string,
  args: ReadonlyArray<string>,
  options: RunCliOptions = {},
): Promise<CliResult> {
  const { cwd = process.cwd(), env = {}, timeout = 30000 } = options;

  const result = await execa("bun", ["run", entryPoint, ...args], {
    cwd,
    env: { ...process.env, ...env, NO_COLOR: "1" },
    timeout,
    reject: false,
  });

  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout as string,
    stderr: result.stderr as string,
  };
}

/**
 * Run the CLI with the given arguments.
 *
 * @param args - Command-line arguments to pass to the CLI
 * @param options - Options for the CLI process
 * @returns The CLI result including exit code, stdout, and stderr
 *
 * @example
 * ```ts
 * const result = await runCli(["init", "--yes"], { cwd: tempDir });
 * expect(result.exitCode).toBe(0);
 * ```
 */
export async function runCli(
  args: ReadonlyArray<string>,
  options: RunCliOptions = {},
): Promise<CliResult> {
  return run(CLI_PATH, args, options);
}

/**
 * Run the dev CLI with the given arguments.
 *
 * @param args - Command-line arguments to pass to the dev CLI
 * @param options - Options for the CLI process
 * @returns The CLI result including exit code, stdout, and stderr
 *
 * @example
 * ```ts
 * const result = await runDevCli(["tui", "log"]);
 * expect(result.exitCode).toBe(0);
 * ```
 */
export async function runDevCli(
  args: ReadonlyArray<string>,
  options: RunCliOptions = {},
): Promise<CliResult> {
  return run(DEV_CLI_PATH, args, options);
}

/**
 * Context for a temporary test directory.
 */
export interface TempDirContext {
  /** Path to the temporary directory */
  path: string;
  /** Clean up the temporary directory */
  cleanup: () => void;
}

/**
 * Create a temporary directory for testing.
 *
 * The directory is created in the system temp folder with the given prefix.
 * Call `cleanup()` when done to remove it.
 *
 * @param prefix - Prefix for the temp directory name (default: "axm-e2e-")
 * @returns Context with the temp directory path and cleanup function
 *
 * @example
 * ```ts
 * const temp = createTempDir();
 * try {
 *   // Use temp.path for testing
 *   const result = await runCli(["init"], { cwd: temp.path });
 * } finally {
 *   temp.cleanup();
 * }
 * ```
 */
export function createTempDir(prefix = "axm-e2e-"): TempDirContext {
  const tempPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  return {
    path: tempPath,
    cleanup: () => {
      try {
        fs.rmSync(tempPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Path to the test fixtures directory.
 */
export const FIXTURES_PATH = path.resolve(import.meta.dirname, "fixtures");

/**
 * Path to the mock skills repository fixture.
 */
export const SKILLS_REPO_FIXTURE = path.join(FIXTURES_PATH, "skills-repo");

/**
 * Copy the skills repo fixture to a temporary directory.
 *
 * Useful when tests need to modify the fixture without affecting other tests.
 *
 * @returns Context with the copied fixture path and cleanup function
 */
export function copySkillsRepoFixture(): TempDirContext {
  const temp = createTempDir("axm-fixture-");
  fs.cpSync(SKILLS_REPO_FIXTURE, temp.path, { recursive: true });
  return temp;
}
