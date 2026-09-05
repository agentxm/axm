import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { execa } from "execa";

import { withoutLocalGitEnvironment } from "./git-environment.js";
import type { CliResult, RunCliOptions } from "./types.js";

// E2E commands run concurrently and can exceed two minutes under load even
// when the command is healthy. Keep the subprocess budget aligned with the
// longest explicit Vitest E2E ceiling so Execa does not SIGTERM a live Effect
// runtime and turn resource contention into a misleading interruption.
const DEFAULT_TIMEOUT = 600_000;

const resolveArtifactPath = (artifactPath: string | URL): string =>
  artifactPath instanceof URL
    ? fileURLToPath(artifactPath)
    : path.resolve(process.cwd(), artifactPath);

export const runCommand = async (
  command: string,
  args: ReadonlyArray<string>,
  options: RunCliOptions,
): Promise<CliResult> => {
  const { cwd = process.cwd(), env = {}, timeout = DEFAULT_TIMEOUT } = options;
  // Bun warns when FORCE_COLOR and NO_COLOR are both present. The e2e runner
  // intentionally sets NO_COLOR so stderr channel-contract tests stay stable.
  // eslint-disable-next-line no-restricted-properties -- E2E runner needs parent env for child process
  const { FORCE_COLOR: _forceColor, ...parentEnvWithGitContext } = process.env;
  const parentEnv = withoutLocalGitEnvironment(parentEnvWithGitContext);

  const result = await execa(command, [...args], {
    cwd,
    env: { ...parentEnv, CI: "", ...env, NO_COLOR: "1", AXM_TELEMETRY: "0" },
    extendEnv: false,
    timeout,
    reject: false,
  });

  return {
    exitCode: result.exitCode ?? 1,
    stdout: typeof result.stdout === "string" ? result.stdout : String(result.stdout),
    stderr: typeof result.stderr === "string" ? result.stderr : String(result.stderr),
  };
};

export const createCliRunner =
  (artifactPath: string | URL) =>
  async (args: ReadonlyArray<string>, options: RunCliOptions = {}): Promise<CliResult> => {
    const cliPath = resolveArtifactPath(artifactPath);

    if (!fs.existsSync(cliPath)) {
      throw new Error(`Built CLI not found at ${cliPath}. Run the matching Nx build first.`);
    }

    return runCommand("bun", ["run", cliPath, ...args], options);
  };

export const createBinaryRunner =
  (artifactPath: string | URL) =>
  async (args: ReadonlyArray<string>, options: RunCliOptions = {}): Promise<CliResult> => {
    const binaryPath = resolveArtifactPath(artifactPath);

    if (!fs.existsSync(binaryPath)) {
      throw new Error(`Compiled binary not found at ${binaryPath}.`);
    }

    return runCommand(binaryPath, args, options);
  };
