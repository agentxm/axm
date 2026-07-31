/**
 * E2E tests for `axm token`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "vitest";
import { runCli } from "../../../e2e/utils.js";

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
    expect(result.exitCode).toBe(4);
    expect(result.stdout + result.stderr).toContain("(auth)");
    expect(result.stderr).toContain("Set the AXM_TOKEN environment variable");
  });
});
