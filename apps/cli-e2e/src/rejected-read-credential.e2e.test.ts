/**
 * Process evidence for `cli/reads-carry-the-invocations-credential`.
 *
 * The specification lives beside the auth middleware in
 * `packages/supporting/registry-access/src/adapters/`. These rows keep what it
 * cannot observe: a real invocation reading from a Registry that answers a
 * credential it cannot resolve with 401 instead of serving the read anonymously.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { defineExecutionBinding } from "@agentxm/specification-metadata";

import { startHttpRegistry } from "./e2e/http-registry-server.js";
import { createTempDir, runCli, writeUserDefaultRegistry } from "./utils.js";

export const executionBinding = defineExecutionBinding({
  requirements: ["cli/reads-carry-the-invocations-credential"],
  boundary: "process",
  rationale:
    "Only a real invocation against a real HTTP origin shows a rejected read travelling the same renewal as a rejected write, and a rejected or unreadable ambient credential reported for what it is rather than hidden behind a not-found.",
});

const READ = ["view", "@test/skills/absent", "--json"] as const;

describe("A read the Registry rejects for its credential", () => {
  it("renews the stored session once and retries the read", async () => {
    const registry = await startHttpRegistry({
      rotatingSession: {
        accessToken: "axm_ses_current",
        refreshToken: "axm_ref_stored",
        grantDelayMs: 0,
      },
    });
    const home = createTempDir();
    try {
      // The stored access token is one the Registry no longer resolves, and it
      // has not lapsed, so nothing renews it before the read is rejected.
      const directory = path.join(home.path, ".config", "axm");
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      fs.writeFileSync(
        path.join(directory, "credentials.json"),
        JSON.stringify({
          version: 1,
          registries: {
            [registry.url]: {
              accounts: {
                "@test": {
                  access_token: "axm_ses_unresolvable",
                  refresh_token: "axm_ref_stored",
                  expires_at: "2099-01-01T00:00:00.000Z",
                  active: true,
                },
              },
            },
          },
        }),
        { mode: 0o600 },
      );
      writeUserDefaultRegistry(home.path, registry.url);

      const result = await runCli(READ, {
        env: {
          HOME: home.path,
          AXM_USER_HOME: home.path,
          AXM_TOKEN: "",
          AXM_TOKEN_FILE: "",
          SSH_TTY: "/dev/ttys000",
        },
      });

      // The retried read is answered on its merits: the extension is absent,
      // and a signed-in reader is not told to sign in.
      expect(JSON.parse(result.stdout), result.stdout + result.stderr).toMatchObject({
        ok: false,
        code: "not_found",
      });
      expect(result.stdout).not.toContain("axm login");
      expect(registry.presentedRefreshTokens).toEqual(["axm_ref_stored"]);
      const reads = registry.requests.filter((request) => request.method === "GET");
      expect(reads.map((request) => [request.authorization, request.status])).toEqual([
        ["Bearer axm_ses_unresolvable", 401],
        ["Bearer axm_ses_current-r1", 404],
      ]);
    } finally {
      home.cleanup();
      await registry.close();
    }
  });

  it("reports a token file it cannot read instead of reading anonymously", async () => {
    const registry = await startHttpRegistry();
    const home = createTempDir();
    try {
      writeUserDefaultRegistry(home.path, registry.url);
      const result = await runCli(READ, {
        env: {
          HOME: home.path,
          AXM_USER_HOME: home.path,
          AXM_TOKEN: "",
          AXM_TOKEN_FILE: "/nonexistent/axm-token-file",
        },
      });

      expect(result.exitCode, result.stdout + result.stderr).toBe(4);
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: false,
        code: "auth",
        detail: "Could not read AXM_TOKEN_FILE at /nonexistent/axm-token-file.",
      });
      // Nothing was asked of the Registry as if the person were nobody.
      expect(registry.requests).toEqual([]);
    } finally {
      home.cleanup();
      await registry.close();
    }
  });

  it("reports a rejected ambient credential instead of reading anonymously", async () => {
    const registry = await startHttpRegistry();
    const home = createTempDir();
    try {
      writeUserDefaultRegistry(home.path, registry.url);
      const result = await runCli(READ, {
        env: {
          HOME: home.path,
          AXM_USER_HOME: home.path,
          AXM_TOKEN: "unresolvable-token",
        },
      });

      expect(result.exitCode, result.stdout + result.stderr).toBe(4);
      expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: "auth" });
      expect(
        registry.requests.every((request) => request.authorization === "Bearer unresolvable-token"),
      ).toBe(true);
    } finally {
      home.cleanup();
      await registry.close();
    }
  });
});
