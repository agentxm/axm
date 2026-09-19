/**
 * E2E tests for `axm token`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { fileURLToPath } from "node:url";

import { runCommand } from "@agentxm/client-e2e-utils";
import { describe, expect, it } from "vitest";
import { startHttpRegistry } from "../../../e2e/http-registry-server.js";
import { createTempDir, runCli } from "../../../e2e/utils.js";

// Process evidence for this module is bound by the auth.e2e.test.ts Vitest entrypoint.

const TOKEN_ENV = { AXM_TOKEN: "test-token-value" } as const;
const BUILT_CLI_PATH = fileURLToPath(
  new URL("../../../../../cli/dist/src/main.js", import.meta.url),
);

describe("axm token", () => {
  it("writes exactly the token and one newline with --output token", async () => {
    const result = await runCli(["token", "--output", "token"], {
      env: TOKEN_ENV,
      exactOutput: true,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("test-token-value\n");
    expect(result.stderr).toBe("");
  });

  it("refuses to export without an output mode when stdout is not a terminal", async () => {
    const result = await runCli(["token"], { env: TOKEN_ENV });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--output token");
    expect(result.stderr).not.toContain("test-token-value");
  });

  it("refuses JSON token output with a secret-free usage envelope", async () => {
    const result = await runCli(["token", "--json"], { env: TOKEN_ENV });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: "usage" });
    expect(result.stdout + result.stderr).not.toContain("test-token-value");
  });

  for (const args of [
    ["--output", "token", "--json"],
    ["--output=token", "--help"],
    ["--output", "token", "--version"],
    ["--output", "token", "--output", "human"],
    ["--output", "token", "--unknown-flag"],
  ]) {
    it(`keeps stdout empty for a rejected raw invocation: ${args.join(" ")}`, async () => {
      const result = await runCli(["token", ...args], { env: TOKEN_ENV, exactOutput: true });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).not.toContain("test-token-value");
    });
  }

  it("fails without revoking anything when stdout is closed", async () => {
    const result = await runCli(["token", "--output", "token"], {
      env: TOKEN_ENV,
      closedStdout: true,
    });
    expect(result.exitCode).toBe(11);
    expect(result.stderr).toContain("could not be fully written to stdout");
    expect(result.stderr).not.toContain("Revoked");
    expect(result.stderr).not.toContain("test-token-value");
  });

  it("fails with auth when no credentials available", async () => {
    const result = await runCli(["token", "--output", "token"], {
      env: { AXM_TOKEN: "" },
      exactOutput: true,
    });
    expect(result.exitCode).toBe(13);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("auth_required, exit 13");
    expect(result.stderr).toContain("axm login --device-code --json");
  });

  const createArgs = [
    "token",
    "create",
    "--name",
    "e2e-step-up",
    "--permission",
    "read",
    "--wait-for-human",
    "5",
    "--output",
    "token",
  ];

  it("waits for verification and writes only the created token", async () => {
    const registry = await startHttpRegistry({ stepUpTokenCreate: true });
    try {
      const result = await runCli(createArgs, {
        env: { AXM_REGISTRY_URL: registry.url, AXM_TOKEN: "e2e-test-token" },
        exactOutput: true,
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toBe("axmt_step_up_e2e\n");
      // The verification handoff and the new token's metadata cross stderr.
      expect(result.stderr).toContain("Verify Create access token on e2e-step-up to continue.");
      expect(result.stderr).toContain("tok_01h455vb4pexka56gq5w2r7cpc");
      expect(result.stderr).not.toContain("axmt_step_up_e2e");
      expect(registry.requests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ method: "POST", path: "/v1/tokens", status: 401 }),
          expect.objectContaining({
            method: "GET",
            path: "/v1/auth/step-up/requests/step_01h455vb4pexka56gq5w2r7cpc",
            status: 200,
          }),
          expect.objectContaining({ method: "POST", path: "/v1/tokens", status: 201 }),
        ]),
      );
      expect(registry.requests.filter((request) => request.method === "DELETE")).toEqual([]);
    } finally {
      await registry.close();
    }
  });

  it("revokes a created token that stdout did not accept", async () => {
    const registry = await startHttpRegistry({ stepUpTokenCreate: true });
    try {
      const result = await runCli(createArgs, {
        env: { AXM_REGISTRY_URL: registry.url, AXM_TOKEN: "e2e-test-token" },
        closedStdout: true,
      });

      expect(result.exitCode).toBe(11);
      expect(result.stderr).toContain("Revoked token tok_01h455vb4pexka56gq5w2r7cpc");
      expect(result.stderr).not.toContain("axmt_step_up_e2e");
      expect(registry.requests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "DELETE",
            path: "/v1/tokens/tok_01h455vb4pexka56gq5w2r7cpc",
          }),
        ]),
      );
    } finally {
      await registry.close();
    }
  });

  // The published package also runs under Node, which reports a failed write
  // to the callback and then emits `error`; the compiled runtime does not.
  it("revokes an undelivered token when the built CLI runs under Node", async () => {
    const registry = await startHttpRegistry({ stepUpTokenCreate: true });
    const home = createTempDir();
    try {
      const result = await runCommand(process.execPath, [BUILT_CLI_PATH, ...createArgs], {
        env: {
          HOME: home.path,
          AXM_USER_HOME: home.path,
          AXM_REGISTRY_URL: registry.url,
          AXM_TOKEN: "e2e-test-token",
        },
        closedStdout: true,
      });

      expect(result.exitCode, result.stderr).toBe(11);
      expect(result.stderr).toContain("Revoked token tok_01h455vb4pexka56gq5w2r7cpc");
      expect(result.stderr).not.toContain("axmt_step_up_e2e");
      expect(registry.requests).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: "DELETE",
            path: "/v1/tokens/tok_01h455vb4pexka56gq5w2r7cpc",
          }),
        ]),
      );
    } finally {
      home.cleanup();
      await registry.close();
    }
  });
});
