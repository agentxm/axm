/**
 * E2E tests for `axm login`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { startDeviceAuthServer } from "../../../e2e/device-auth-server.js";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli, writeUserDefaultRegistry } from "../../../e2e/utils.js";

export const executionBinding = {
  requirements: [
    "cli/login/starts-resumable-device-sign-in",
    "cli/login/resumes-approved-authorization",
    "cli/login/terminal-authorization-failures-preserve-credentials",
    "cli/login/device-sign-in-waits-in-one-invocation",
  ],
  boundary: "process",
  rationale:
    "Exercises persisted device authorization and credential storage across separate CLI processes against a controlled HTTP Registry.",
} as const;

describe("axm login", () => {
  it("shows the device-code login flags and examples", async () => {
    const result = await runCli(["login", "--help"]);

    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("Sign in with a code; recommended for SSH");
    expect(output).toContain("headless environments");
    expect(output).toContain("Replace an existing pending device sign-in intentionally");
    expect(output).toContain("axm login");
    expect(output).toContain("axm login --device-code");
    expect(output).toContain("--wait-for-human");
    expect(output).toContain("axm login --device-code --wait-for-human 300 --json");
    expect(output).toContain("--restart");
    expect(output).not.toContain("--timeout");
    expect(output).not.toContain("--device-auth");
  });

  it("rejects the unsupported --device-auth spelling", async () => {
    const result = await runCli(["login", "--device-auth"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout + result.stderr).toContain("device-auth");
  });

  it("starts, persists, and resumes device login across processes", async () => {
    const auth = await startDeviceAuthServer();
    const home = createTempDir();
    try {
      writeUserDefaultRegistry(home.path, auth.url);
      const env = { HOME: home.path, AXM_USER_HOME: home.path };
      const started = await runCli(["login", "--device-code", "--json", "--non-interactive"], {
        env,
      });
      expect(started.exitCode).toBe(0);
      expect(started.stdout).toContain('"status": "pending-human"');
      expect(started.stdout).toContain('"userCode": "ABCD-1234"');
      expect(started.stdout).toContain(
        '"resume": "axm login --device-code --wait-for-human 300 --json"',
      );
      expect(started.stdout).toContain('"verificationUri": "' + auth.url + '/device"');
      expect(started.stdout).toContain(auth.url + "/device?user_code=ABCD-1234");

      auth.setOutcome("approved");
      const resumed = await runCli(
        ["login", "--device-code", "--wait-for-human", "5", "--json", "--non-interactive"],
        { env, timeout: 10_000 },
      );
      expect(resumed.exitCode).toBe(0);
      expect(JSON.parse(resumed.stdout)).toMatchObject({
        result: { status: "logged-in", handle: "@alice" },
      });
    } finally {
      home.cleanup();
      await auth.close();
    }
  });

  it("starts, waits for, and saves a device sign-in in one invocation", async () => {
    const auth = await startDeviceAuthServer();
    const home = createTempDir();
    try {
      writeUserDefaultRegistry(home.path, auth.url);
      const env = { HOME: home.path, AXM_USER_HOME: home.path };
      auth.setOutcome("approved");
      // A bounded wait selects device sign-in without --device-code.
      const signedIn = await runCli(
        ["login", "--wait-for-human", "5", "--json", "--non-interactive"],
        { env, timeout: 10_000 },
      );

      expect(signedIn.exitCode, signedIn.stderr).toBe(0);
      // One final document: the pending handoff crosses stderr, not stdout.
      expect(JSON.parse(signedIn.stdout)).toMatchObject({
        ok: true,
        result: { status: "logged-in", handle: "@alice" },
      });
      expect(signedIn.stderr).toContain("ABCD-1234");

      const whoami = await runCli(["whoami", "--json"], { env });
      expect(whoami.exitCode).toBe(0);
      expect(whoami.stdout).toContain("@alice");
    } finally {
      home.cleanup();
      await auth.close();
    }
  });

  it("returns the dedicated expired code and clears the pending flow", async () => {
    const auth = await startDeviceAuthServer("expired");
    const home = createTempDir();
    try {
      writeUserDefaultRegistry(home.path, auth.url);
      const env = { HOME: home.path, AXM_USER_HOME: home.path };
      expect(
        (
          await runCli(["login", "--device-code", "--json", "--non-interactive"], {
            env,
          })
        ).exitCode,
      ).toBe(0);
      const expired = await runCli(
        ["login", "--device-code", "--wait-for-human", "5", "--json", "--non-interactive"],
        { env, timeout: 10_000 },
      );
      expect(expired.exitCode).toBe(14);
      expect(expired.stdout).toContain('"code": "auth_expired"');

      // The expired flow was cleared, so the next sign-in starts a new one.
      const restarted = await runCli(["login", "--device-code", "--json", "--non-interactive"], {
        env,
      });
      expect(restarted.exitCode).toBe(0);
      expect(restarted.stdout).toContain('"flow": "started"');
    } finally {
      home.cleanup();
      await auth.close();
    }
  });
});
