import { spawn } from "node:child_process";
import * as http from "node:http";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "./e2e/utils.js";

const cliPath = fileURLToPath(new URL("../../cli/dist/src/main.js", import.meta.url));

interface SpawnResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Run the built CLI against an HTTP registry that accepts the first request
 * and never answers it, delivering SIGINT the moment that request arrives —
 * a deterministic mid-flight interruption.
 */
const interruptOnFirstRegistryRequest = async (
  args: ReadonlyArray<string>,
  options: { readonly cwd: string; readonly userHome: string },
): Promise<SpawnResult> => {
  const registryRequest = Promise.withResolvers<void>();
  const server = http.createServer((_request, _response) => registryRequest.resolve());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("HTTP interruption fixture did not bind a TCP port");
  }
  const { FORCE_COLOR: _forceColor, ...parentEnv } = process.env;
  try {
    return await new Promise<SpawnResult>((resolve, reject) => {
      const child = spawn("bun", ["run", cliPath, ...args], {
        cwd: options.cwd,
        env: {
          ...parentEnv,
          AXM_REGISTRY_URL: `http://127.0.0.1:${address.port}`,
          AXM_TELEMETRY: "0",
          AXM_USER_HOME: options.userHome,
          HOME: options.userHome,
          NO_COLOR: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
      void registryRequest.promise.then(() => child.kill("SIGINT"));
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error))),
    );
  }
};

describe("signal interruption", () => {
  it("C-15: interrupting a plan-family apply resolves an interrupted document and exit 130", async () => {
    const workspace = createTempDir();
    const userHome = createTempDir();
    try {
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code"],
        { cwd: workspace.path },
      );
      expect(setup.exitCode, setup.stderr).toBe(0);

      const result = await interruptOnFirstRegistryRequest(
        ["install", "@test/skills/interrupt", "--json"],
        { cwd: workspace.path, userHome: userHome.path },
      );

      expect(result.code, result.stdout + result.stderr).toBe(130);
      const document = JSON.parse(result.stdout);
      expect(document.ok).toBe(false);
      expect(document.result.contract).toBe("plan-result-v2");
      expect(document.result.outcome).toBe("interrupted");
      expect(document.result.interruption).toEqual({ signal: "SIGINT", disposition: "none" });
    } finally {
      userHome.cleanup();
      workspace.cleanup();
    }
  });

  it("interrupting a read command reports the termination on stderr and exits 130", async () => {
    const workspace = createTempDir();
    try {
      const result = await interruptOnFirstRegistryRequest(
        ["view", "@test/skills/interrupt", "--json"],
        { cwd: workspace.path, userHome: workspace.path },
      );

      expect(result.code, result.stdout + result.stderr).toBe(130);
      // A command with no operation boundary resolves nothing itself: no
      // stdout envelope, just the machine-readable termination notice.
      expect(result.stdout.trim()).toBe("");
      const diagnostics = result.stderr
        .trim()
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line));
      expect(diagnostics).toContainEqual({
        type: "error",
        code: "interrupted",
        message: "Cancelled by SIGINT.",
        reason: "interrupted",
        signal: "SIGINT",
      });
    } finally {
      workspace.cleanup();
    }
  });
});
