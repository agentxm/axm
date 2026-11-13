/**
 * E2E tests for `axm login`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import { startDeviceAuthServer } from "@agentxm/test-support/auth-server";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
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

const invoke = (...args: Parameters<typeof runCli>) => Effect.tryPromise(() => runCli(...args));
const fixture = (outcome: Parameters<typeof startDeviceAuthServer>[0] = "pending") =>
  Effect.gen(function* () {
    const auth = yield* Effect.acquireRelease(startDeviceAuthServer(outcome), (server) =>
      server.close.pipe(Effect.orDie),
    );
    const home = yield* Effect.acquireRelease(Effect.sync(createTempDir), (directory) =>
      Effect.sync(directory.cleanup),
    );
    writeUserDefaultRegistry(home.path, auth.url);
    return { auth, env: { HOME: home.path, AXM_USER_HOME: home.path } };
  });

describe("axm login", () => {
  it.live("shows the device-code login flags and examples", () =>
    Effect.gen(function* () {
      const result = yield* invoke(["login", "--help"]);

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
    }),
  );

  it.live("rejects the unsupported --device-auth spelling", () =>
    Effect.gen(function* () {
      const result = yield* invoke(["login", "--device-auth"]);

      expect(result.exitCode).toBe(2);
      expect(result.stdout + result.stderr).toContain("device-auth");
    }),
  );

  it.live("starts, persists, and resumes device login across processes", () =>
    Effect.gen(function* () {
      const { auth, env } = yield* fixture();
      const started = yield* invoke(["login", "--device-code", "--json", "--non-interactive"], {
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
      const resumed = yield* invoke(
        ["login", "--device-code", "--wait-for-human", "5", "--json", "--non-interactive"],
        { env, timeout: 10_000 },
      );
      expect(resumed.exitCode).toBe(0);
      expect(JSON.parse(resumed.stdout)).toMatchObject({
        result: { status: "logged-in", handle: "@alice" },
      });
    }).pipe(Effect.scoped),
  );

  it.live("starts, waits for, and saves a device sign-in in one invocation", () =>
    Effect.gen(function* () {
      const { auth, env } = yield* fixture();
      auth.setOutcome("approved");
      // A bounded wait selects device sign-in without --device-code.
      const signedIn = yield* invoke(
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

      const whoami = yield* invoke(["whoami", "--json"], { env });
      expect(whoami.exitCode).toBe(0);
      expect(whoami.stdout).toContain("@alice");
    }).pipe(Effect.scoped),
  );

  it.live("returns the dedicated expired code and clears the pending flow", () =>
    Effect.gen(function* () {
      const { env } = yield* fixture("expired");
      expect(
        (yield* invoke(["login", "--device-code", "--json", "--non-interactive"], {
          env,
        })).exitCode,
      ).toBe(0);
      const expired = yield* invoke(
        ["login", "--device-code", "--wait-for-human", "5", "--json", "--non-interactive"],
        { env, timeout: 10_000 },
      );
      expect(expired.exitCode).toBe(14);
      expect(expired.stdout).toContain('"code": "auth_expired"');

      // The expired flow was cleared, so the next sign-in starts a new one.
      const restarted = yield* invoke(["login", "--device-code", "--json", "--non-interactive"], {
        env,
      });
      expect(restarted.exitCode).toBe(0);
      expect(restarted.stdout).toContain('"flow": "started"');
    }).pipe(Effect.scoped),
  );
});
