/**
 * E2E tests for root, workspace-independent authentication commands.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "../../e2e/utils.js";

describe("root authentication commands", () => {
  it.each([
    {
      args: ["login", "--help"],
      expected: "Sign in to a registry",
    },
    {
      args: ["logout", "--help"],
      expected: "Sign out of a registry",
    },
    {
      args: ["whoami", "--help"],
      expected: "Show current authenticated identity",
    },
    {
      args: ["token", "--help"],
      expected: "Output current auth token to stdout",
    },
  ])("exposes the root command: $args", async ({ args, expected }) => {
    const result = await runCli(args);

    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain(expected);
  });

  it.each([{ args: ["auth"] }, { args: ["auth", "login", "--help"] }])(
    "rejects the retired nested command path: $args",
    async ({ args }) => {
      const result = await runCli(args);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout + result.stderr).toContain("auth");
    },
  );

  describe("auth commands work outside an axm-initialized directory", () => {
    it("logout works without AXM workspace settings", async () => {
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

    it("token with AXM_TOKEN works without AXM workspace settings", async () => {
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
