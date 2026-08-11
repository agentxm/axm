import { spawn } from "node:child_process";
import * as http from "node:http";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTempDir } from "./e2e/utils.js";

const cliPath = fileURLToPath(new URL("../../cli/dist/src/main.js", import.meta.url));

describe("signal interruption", () => {
  it("interrupts the built CLI with a visible machine result and exit 130", async () => {
    const workspace = createTempDir();
    const registryRequest = Promise.withResolvers<void>();
    const server = http.createServer((_request, _response) => registryRequest.resolve());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("HTTP interruption fixture did not bind a TCP port");
    }

    const { FORCE_COLOR: _forceColor, ...parentEnv } = process.env;

    try {
      const result = await new Promise<{
        readonly code: number | null;
        readonly stdout: string;
        readonly stderr: string;
      }>((resolve, reject) => {
        const child = spawn("bun", ["run", cliPath, "view", "@test/skills/interrupt", "--json"], {
          cwd: workspace.path,
          env: {
            ...parentEnv,
            AXM_REGISTRY_URL: `http://127.0.0.1:${address.port}`,
            AXM_TELEMETRY: "0",
            AXM_USER_HOME: workspace.path,
            HOME: workspace.path,
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

      expect(result.code, result.stdout + result.stderr).toBe(130);
      expect(JSON.parse(result.stdout)).toEqual({
        ok: false,
        result: { outcome: "failed", reason: "interrupted", signal: "SIGINT" },
      });
      const diagnostics = result.stderr
        .trim()
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line));
      expect(diagnostics).toContainEqual({
        type: "error",
        code: "interrupted",
        reason: "interrupted",
        signal: "SIGINT",
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
      workspace.cleanup();
    }
  });
});
