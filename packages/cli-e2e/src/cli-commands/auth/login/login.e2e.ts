/**
 * E2E tests for `axm login`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "vitest";
import { runCli } from "../../../e2e/utils.js";

describe("axm login", () => {
  it("fails with AUTH_LOGIN_REQUIRED in non-interactive mode", async () => {
    const result = await runCli(["login", "--non-interactive"], {
      env: { AXM_TOKEN: "" },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("AUTH_LOGIN_REQUIRED");
    expect(result.stderr).toContain("interactive terminal");
  });
});
