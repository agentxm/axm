/**
 * E2E tests for `axm login`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { describe, expect, it } from "vitest";
import { runCli } from "../../../e2e/utils.js";

describe("axm login", () => {
  it("shows canonical login flags and examples while hiding the compatibility alias", async () => {
    const result = await runCli(["login", "--help"]);

    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("Use OAuth device-code sign-in; recommended for SSH and");
    expect(output).toContain("headless environments");
    expect(output).toContain("Log in again without prompting when already authenticated");
    expect(output).toContain("axm login");
    expect(output).toContain("axm login --device-code");
    expect(output).not.toContain("--no-browser");
    expect(output).not.toContain("--device-auth");
  });

  it("accepts the hidden --no-browser compatibility alias", async () => {
    const result = await runCli(["login", "--no-browser", "--non-interactive"], {
      env: { AXM_TOKEN: "" },
    });

    expect(result.exitCode).toBe(4);
    expect(result.stderr).not.toContain("Unknown option");
  });

  it("rejects the unsupported --device-auth spelling", async () => {
    const result = await runCli(["login", "--device-auth"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout + result.stderr).toContain("device-auth");
  });

  it("fails with auth in non-interactive mode", async () => {
    const result = await runCli(["login", "--non-interactive"], {
      env: { AXM_TOKEN: "" },
    });
    expect(result.exitCode).toBe(4);
    expect(result.stdout + result.stderr).toContain("(auth)");
    expect(result.stderr).toContain(
      "Interactive login cannot run with --non-interactive. Set AXM_TOKEN to an existing token for automated environments.",
    );
  });
});
