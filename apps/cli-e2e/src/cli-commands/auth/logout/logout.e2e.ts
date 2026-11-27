/**
 * E2E tests for `axm logout`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "vitest";
import { runCli } from "../../../utils.js";

describe("axm logout", () => {
  it("displays 'Not signed in' with no credentials and exits 0", async () => {
    const result = await runCli(["logout"], {
      env: { AXM_TOKEN: "" },
    });
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("Not signed in");
  });
});
