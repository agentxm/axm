/**
 * E2E tests for `axm login`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "vitest";
import { runCli } from "../../../e2e/utils.js";

describe("axm login", () => {
  it("fails with auth in non-interactive mode", async () => {
    const result = await runCli(["login", "--non-interactive"], {
      env: { AXM_TOKEN: "" },
    });
    expect(result.exitCode).toBe(4);
    expect(result.stdout + result.stderr).toContain("(auth)");
    expect(result.stderr).toContain("Set the AXM_TOKEN environment variable");
  });
});
