/**
 * Process evidence for `cli/session/concurrent-renewal-spends-one-refresh-token`.
 *
 * The specification lives in
 * `packages/supporting/registry-access/src/credentials/`, where every
 * invocation is a refresher over one in-memory credential home. What it cannot
 * show is the thing that makes the obligation hard: separate operating-system
 * processes, sharing nothing but a directory, racing for one refresh token
 * against a Registry that ends the session when a spent one comes back.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { defineExecutionBinding } from "@agentxm/specification-metadata";

import { startHttpRegistry } from "./e2e/http-registry-server.js";
import { createTempDir, runCli, writeUserDefaultRegistry } from "./utils.js";

export const executionBinding = defineExecutionBinding({
  requirements: ["cli/session/concurrent-renewal-spends-one-refresh-token"],
  boundary: "process",
  rationale:
    "Only separate processes over one credential home exercise the cross-process file lock and the re-read under it; an in-memory permit shared by fibers proves neither.",
});

const CONCURRENT_INVOCATIONS = 10;

/** A stored session whose access token has lapsed, so every invocation renews first. */
const writeLapsedSession = (home: string, registryUrl: string) => {
  const directory = path.join(home, ".config", "axm");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    path.join(directory, "credentials.json"),
    JSON.stringify({
      version: 1,
      registries: {
        [registryUrl]: {
          accounts: {
            "@test": {
              access_token: "axm_ses_stored",
              refresh_token: "axm_ref_stored",
              expires_at: "2020-01-01T00:00:00.000Z",
              active: true,
            },
          },
        },
      },
    }),
    { mode: 0o600 },
  );
};

describe("Concurrent session renewal across processes", () => {
  it("ten invocations over one credential home spend one refresh token", async () => {
    const registry = await startHttpRegistry({
      rotatingSession: {
        accessToken: "axm_ses_stored",
        refreshToken: "axm_ref_stored",
        grantDelayMs: 300,
      },
    });
    const home = createTempDir();
    try {
      writeLapsedSession(home.path, registry.url);
      writeUserDefaultRegistry(home.path, registry.url);
      const env = {
        HOME: home.path,
        AXM_USER_HOME: home.path,
        AXM_TOKEN: "",
        AXM_TOKEN_FILE: "",
        // The restricted-file tier: the credential home is the directory
        // these processes share, never the developer's keychain.
        SSH_TTY: "/dev/ttys000",
      };

      const results = await Promise.all(
        Array.from({ length: CONCURRENT_INVOCATIONS }, () => runCli(["whoami", "--json"], { env })),
      );

      for (const result of results) {
        expect(result.exitCode, `${result.stderr}\n${result.stdout}`).toBe(0);
        expect(JSON.parse(result.stdout)).toMatchObject({
          ok: true,
          result: { data: { user: "@test", credentialType: "session" } },
        });
      }
      // One grant, for the stored token: nobody presented a spent one, so
      // the Registry never had cause to end the session.
      expect(registry.presentedRefreshTokens).toEqual(["axm_ref_stored"]);

      const stored: unknown = JSON.parse(
        fs.readFileSync(path.join(home.path, ".config", "axm", "credentials.json"), "utf8"),
      );
      expect(stored).toMatchObject({
        registries: {
          [registry.url]: {
            accounts: {
              "@test": { access_token: "axm_ses_stored-r1", refresh_token: "axm_ref_stored-r1" },
            },
          },
        },
      });
    } finally {
      home.cleanup();
      await registry.close();
    }
  }, 60_000);
});
