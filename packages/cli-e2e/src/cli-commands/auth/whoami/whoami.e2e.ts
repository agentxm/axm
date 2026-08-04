/**
 * E2E tests for `axm whoami`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "vitest";
import { runCli } from "../../../e2e/utils.js";

describe("axm whoami", () => {
  it("fails with auth when no credentials available", async () => {
    const result = await runCli(["whoami"], {
      env: { AXM_TOKEN: "" },
    });
    expect(result.exitCode).toBe(13);
    expect(result.stdout + result.stderr).toContain("(auth_required)");
    expect(result.stderr).toContain("axm login --device-code --json");
  });
});
