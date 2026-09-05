/**
 * E2E tests for `axm token`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "vitest";
import { startHttpRegistry } from "../../../e2e/http-registry-server.js";
import { runCli } from "../../../e2e/utils.js";

export const executionBinding = {
  requirements: [
    "cli/token/returns-effective-token",
    "cli/credentials-follow-explicit-source-precedence",
    "cli/token/completes-required-human-verification",
  ],
  boundary: "process",
  rationale:
    "Observes raw and JSON process stdout and real HTTP verification followed by token creation.",
} as const;

describe("axm token", () => {
  it("outputs the token when AXM_TOKEN env var is set", async () => {
    const result = await runCli(["token"], {
      env: { AXM_TOKEN: "test-token-value" },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("test-token-value");
    expect(result.stderr).toBe("");
  });

  it("outputs structured JSON when --json is set", async () => {
    const result = await runCli(["token", "--json"], {
      env: { AXM_TOKEN: "test-token-value" },
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      result: { data: { token: "test-token-value" } },
    });
  });

  it("fails with auth when no credentials available", async () => {
    const result = await runCli(["token"], {
      env: { AXM_TOKEN: "" },
    });
    expect(result.exitCode).toBe(13);
    expect(result.stdout + result.stderr).toContain("(auth_required)");
    expect(result.stderr).toContain("axm login --device-code --json");
  });

  it("completes a durable step-up request and retries token creation", async () => {
    const registry = await startHttpRegistry({ stepUpTokenCreate: true });
    try {
      const result = await runCli(
        ["token", "create", "--name", "e2e-step-up", "--permission", "read", "--json"],
        {
          env: {
            AXM_REGISTRY_URL: registry.url,
            AXM_TOKEN: "e2e-test-token",
          },
        },
      );

      expect(result.exitCode, `${result.stderr}\n${result.stdout}`).toBe(0);
      const document = JSON.parse(result.stdout);
      expect(document.result).toMatchObject({
        result: {
          status: "created",
          tokenId: "tok_01h455vb4pexka56gq5w2r7cpc",
          stepUpCompleted: true,
        },
        data: { token: "axmt_step_up_e2e" },
      });
      expect(result.stderr).toContain("Action: Create access token");
      expect(result.stderr).toContain("Target: e2e-step-up");
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
    } finally {
      await registry.close();
    }
  });
});
