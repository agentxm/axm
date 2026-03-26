import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { execa } from "execa";

import type { CliResult, RunCliOptions } from "./types.js";

const DEFAULT_TIMEOUT = 30000;

const resolveArtifactPath = (artifactPath: string | URL): string =>
  artifactPath instanceof URL
    ? fileURLToPath(artifactPath)
    : path.resolve(process.cwd(), artifactPath);

export const createCliRunner =
  (artifactPath: string | URL) =>
  async (args: ReadonlyArray<string>, options: RunCliOptions = {}): Promise<CliResult> => {
    const cliPath = resolveArtifactPath(artifactPath);
    const { cwd = process.cwd(), env = {}, timeout = DEFAULT_TIMEOUT } = options;

    if (!fs.existsSync(cliPath)) {
      throw new Error(`Built CLI not found at ${cliPath}. Run the matching Nx build first.`);
    }

    const result = await execa("bun", ["run", cliPath, ...args], {
      cwd,
      // eslint-disable-next-line no-restricted-properties -- E2E runner needs parent env for child process
      env: { ...process.env, ...env, NO_COLOR: "1", AXM_TELEMETRY: "0" },
      timeout,
      reject: false,
    });

    return {
      exitCode: result.exitCode ?? 1,
      stdout: typeof result.stdout === "string" ? result.stdout : String(result.stdout),
      stderr: typeof result.stderr === "string" ? result.stderr : String(result.stderr),
    };
  };
