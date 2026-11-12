/**
 * E2E tests for `axm token show`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "vitest";
import { startHttpRegistry } from "../../../e2e/http-registry-server.js";
import { createTempDir, runCli, writeUserDefaultRegistry } from "../../../e2e/utils.js";

// Process evidence for this module is bound by the auth.e2e.test.ts Vitest entrypoint.

const TOKEN_ENV = { AXM_TOKEN: "test-token-value" } as const;
describe("axm token show", () => {
  it("writes exactly the token and one newline with --plain", async () => {
    const result = await runCli(["token", "show", "--plain"], {
      env: TOKEN_ENV,
      exactOutput: true,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("test-token-value\n");
    expect(result.stderr).toBe("");
  });

  it("refuses to export without an output mode when stdout is not a terminal", async () => {
    const result = await runCli(["token", "show"], { env: TOKEN_ENV });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--plain");
    expect(result.stderr).not.toContain("test-token-value");
  });

  it("refuses JSON token output with a secret-free usage envelope", async () => {
    const result = await runCli(["token", "show", "--json"], { env: TOKEN_ENV });
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: "usage" });
    expect(result.stdout + result.stderr).not.toContain("test-token-value");
  });

  for (const args of [
    ["--plain", "--json"],
    ["--plain", "--help"],
    ["--plain", "--version"],
    ["--plain", "--unknown-flag"],
  ]) {
    it(`keeps stdout empty for a rejected raw invocation: ${args.join(" ")}`, async () => {
      const result = await runCli(["token", "show", ...args], {
        env: TOKEN_ENV,
        exactOutput: true,
      });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).not.toContain("test-token-value");
    });
  }

  it("fails without revoking anything when stdout is closed", async () => {
    const result = await runCli(["token", "show", "--plain"], {
      env: TOKEN_ENV,
      closedStdout: true,
    });
    expect(result.exitCode).toBe(11);
    expect(result.stderr).toContain("could not be fully written to stdout");
    expect(result.stderr).not.toContain("Revoked");
    expect(result.stderr).not.toContain("test-token-value");
  });

  it("fails with auth when no credentials available", async () => {
    const result = await runCli(["token", "show", "--plain"], {
      env: { AXM_TOKEN: "" },
      exactOutput: true,
    });
    expect(result.exitCode).toBe(13);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("auth_required, exit 13");
    expect(result.stderr).toContain("axm login --device-code --json");
  });

  it("points browser-only token creation to web settings without retrying", async () => {
    const registry = await startHttpRegistry({ browserOnlyTokenCreate: true });
    const home = createTempDir();
    try {
      writeUserDefaultRegistry(home.path, registry.url);
      const result = await runCli(
        ["token", "create", "e2e-browser-only", "--permission", "read", "--plain"],
        {
          env: {
            HOME: home.path,
            AXM_USER_HOME: home.path,
            AXM_TOKEN: "e2e-test-token",
          },
          exactOutput: true,
        },
      );

      expect(result.exitCode).toBe(5);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Create access tokens in web settings.");
      expect(result.stderr).toContain("https://agentxm.ai/u/settings/tokens");
      expect(registry.requests.filter((request) => request.method === "POST")).toEqual([
        expect.objectContaining({ method: "POST", path: "/v1/tokens", status: 403 }),
      ]);
      expect(registry.requests.some((request) => request.path.includes("step-up"))).toBe(false);
    } finally {
      home.cleanup();
      await registry.close();
    }
  });
});
