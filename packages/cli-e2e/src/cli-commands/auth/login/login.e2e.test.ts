/**
 * E2E tests for `axm login`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as http from "node:http";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "../../../e2e/utils.js";

type DeviceOutcome = "approved" | "denied" | "expired" | "pending";

const sendJson = (response: http.ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

const startDeviceAuthServer = async (initialOutcome: DeviceOutcome = "pending") => {
  let outcome = initialOutcome;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (request.method === "POST" && pathname === "/v1/auth/device/code") {
      const address = server.address();
      if (address === null || typeof address === "string") {
        sendJson(response, 500, { error: "server_address_unavailable" });
        return;
      }
      const verificationUri = `http://127.0.0.1:${address.port}/device`;
      sendJson(response, 200, {
        device_code: "device-secret",
        user_code: "ABCD-1234",
        verification_uri: verificationUri,
        verification_uri_complete: `${verificationUri}?user_code=ABCD-1234`,
        interval: 1,
        expires_in: 60,
      });
      return;
    }
    if (request.method === "POST" && pathname === "/v1/auth/token") {
      if (outcome === "approved") {
        sendJson(response, 200, {
          access_token: "axm_ses_e2e",
          refresh_token: "axm_ref_e2e",
          token_type: "Bearer",
          expires_in: 3600,
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        });
        return;
      }
      const error =
        outcome === "denied"
          ? "access_denied"
          : outcome === "expired"
            ? "expired_token"
            : "authorization_pending";
      sendJson(response, 400, {
        kind: "DeviceTokenOAuthError",
        error,
        error_description: error,
      });
      return;
    }
    if (request.method === "GET" && pathname === "/v1/auth/me") {
      sendJson(response, 200, {
        user: {
          id: "user_01h455vb4pexka56gq5w2r7cpc",
          handle: "@alice",
          email: "alice@example.com",
        },
        orgs: [],
        token: {
          id: "tok_01h455vb4pexka56gq5w2r7cpc",
          type: "session",
          name: null,
          permissions: null,
          scopes: ["extensions:read", "account:read"],
          resource_restrictions: { extensions: null },
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        },
      });
      return;
    }
    sendJson(response, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Expected TCP address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    setOutcome: (next: DeviceOutcome) => {
      outcome = next;
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
};

describe("axm login", () => {
  it("shows the device-code login flags and examples", async () => {
    const result = await runCli(["login", "--help"]);

    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("Use OAuth device-code sign-in; recommended for SSH and");
    expect(output).toContain("headless environments");
    expect(output).toContain("Log in again without prompting when already authenticated");
    expect(output).toContain("axm login");
    expect(output).toContain("axm login --device-code");
    expect(output).toContain("--wait");
    expect(output).toContain("--timeout");
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
      const env = { HOME: home.path, AXM_USER_HOME: home.path, AXM_REGISTRY_URL: auth.url };
      const started = await runCli(["login", "--device-code", "--json", "--non-interactive"], {
        env,
      });
      expect(started.exitCode).toBe(0);
      expect(started.stdout).toContain('"status": "pending-human"');
      expect(started.stdout).toContain('"userCode": "ABCD-1234"');
      expect(started.stdout).toContain('"resume": "axm login --wait --json"');
      expect(started.stdout).not.toContain("user_code=ABCD-1234");

      auth.setOutcome("approved");
      const resumed = await runCli(
        ["login", "--wait", "--timeout", "5", "--json", "--non-interactive"],
        { env, timeout: 10_000 },
      );
      expect(resumed.exitCode).toBe(0);
      expect(resumed.stdout).toContain('"status": "logged-in"');
      expect(resumed.stdout).toContain('"handle": "@alice"');
    } finally {
      home.cleanup();
      await auth.close();
    }
  });

  it("returns the dedicated expired code and clears the pending flow", async () => {
    const auth = await startDeviceAuthServer("expired");
    const home = createTempDir();
    try {
      const env = { HOME: home.path, AXM_USER_HOME: home.path, AXM_REGISTRY_URL: auth.url };
      expect(
        (
          await runCli(["login", "--device-code", "--json", "--non-interactive"], {
            env,
          })
        ).exitCode,
      ).toBe(0);
      const expired = await runCli(
        ["login", "--wait", "--timeout", "5", "--json", "--non-interactive"],
        { env, timeout: 10_000 },
      );
      expect(expired.exitCode).toBe(14);
      expect(expired.stdout).toContain('"code": "auth_expired"');

      const missing = await runCli(["login", "--wait", "--json", "--non-interactive"], {
        env,
      });
      expect(missing.exitCode).toBe(3);
      expect(missing.stdout).toContain('"code": "not_found"');
    } finally {
      home.cleanup();
      await auth.close();
    }
  });
});
