/**
 * E2E tests for `axm auth` group and workspace-independent auth commands.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "../../e2e/utils.js";

describe("axm auth", () => {
  it("displays subcommand help listing all auth commands", async () => {
    const result = await runCli(["auth", "--help"]);
    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("login");
    expect(output).toContain("logout");
    expect(output).toContain("whoami");
    expect(output).toContain("token");
  });

  describe("auth commands work outside an axm-initialized directory", () => {
    it("logout works without .axm/settings.json", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["logout"], {
          cwd: temp.path,
          env: { AXM_TOKEN: "" },
        });
        expect(result.exitCode).toBe(0);
        const output = result.stdout + result.stderr;
        expect(output).toContain("Not logged in");
      } finally {
        temp.cleanup();
      }
    });

    it("token with AXM_TOKEN works without .axm/settings.json", async () => {
      const temp = createTempDir();
      try {
        const result = await runCli(["token"], {
          cwd: temp.path,
          env: { AXM_TOKEN: "outside-workspace-token" },
        });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("outside-workspace-token");
      } finally {
        temp.cleanup();
      }
    });
  });
});
