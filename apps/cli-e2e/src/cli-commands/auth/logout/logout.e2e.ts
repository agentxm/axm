/**
 * E2E tests for `axm logout`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "vitest";
import { runCli } from "../../../e2e/utils.js";

describe("axm logout", () => {
  it("displays 'Not logged in.' with no credentials and exits 0", async () => {
    const result = await runCli(["logout"], {
      env: { AXM_TOKEN: "" },
    });
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("Not logged in");
  });
});
