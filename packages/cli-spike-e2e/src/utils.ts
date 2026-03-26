/**
 * Distribution E2E test utilities.
 *
 * Spawns the BUILT cli-spike artifact as a subprocess.
 * No source-level imports from cli-spike — tests exercise the shipped binary.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execa } from "execa";

/**
 * Path to the built CLI entry point.
 *
 * Resolves to cli-spike/dist/src/main.js — the artifact produced by `nx build cli-spike`.
 */
const CLI_PATH = path.resolve(
  import.meta.dirname,
  "../../cli-spike/dist/src/main.js",
);

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunCliOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

/**
 * Run the built cli-spike binary with the given arguments.
 */
export async function runCli(
  args: ReadonlyArray<string>,
  options: RunCliOptions = {},
): Promise<CliResult> {
  const { cwd = process.cwd(), env = {}, timeout = 30000 } = options;

  if (!fs.existsSync(CLI_PATH)) {
    throw new Error(
      `Built CLI not found at ${CLI_PATH}. Run "nx build cli-spike" first.`,
    );
  }

  const result = await execa("bun", ["run", CLI_PATH, ...args], {
    cwd,
    env: { ...process.env, ...env, NO_COLOR: "1", AXM_TELEMETRY: "0" },
    timeout,
    reject: false,
  });

  return {
    exitCode: result.exitCode ?? 1,
    stdout: typeof result.stdout === "string" ? result.stdout : String(result.stdout),
    stderr: typeof result.stderr === "string" ? result.stderr : String(result.stderr),
  };
}

export interface TempDirContext {
  path: string;
  cleanup: () => void;
}

/**
 * Create a temporary directory for testing.
 */
export function createTempDir(prefix = "spke-e2e-"): TempDirContext {
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
