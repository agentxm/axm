/**
 * Process evidence for `cli/trusted-publishing/ci-identity-becomes-one-workload-token`.
 *
 * The specification lives beside the workload credential source in
 * `packages/supporting/registry-access/src/credentials/`. These rows keep what
 * it cannot observe: a built CLI running with the environment a GitHub Actions
 * job granted `id-token: write` has, asking a real HTTP ID-token endpoint and a
 * real HTTP Registry, with no stored secret anywhere, and every command layer
 * of one invocation sharing a single exchange.
 */

import { describe, expect, it } from "vitest";

import { defineExecutionBinding } from "@agentxm/specification-metadata";

import { startGitHubActionsIdTokenServer } from "./e2e/github-actions-id-token-server.js";
import { startHttpRegistry } from "./e2e/http-registry-server.js";
import { initWorkspace } from "./test-support/published-registry.js";
import { createTempDir, runCli, writeUserDefaultRegistry } from "./utils.js";

export const executionBinding = defineExecutionBinding({
  requirements: ["cli/trusted-publishing/ci-identity-becomes-one-workload-token"],
  boundary: "process",
  rationale:
    "Only a built CLI invoked with a CI job's environment against real HTTP endpoints shows the ID token requested for the Registry audience, one exchange shared by every command layer of the invocation, and the workload token carrying a publish with no stored secret.",
});

const ID_TOKEN = "e2e-github-actions-id-token";
const WORKLOAD_TOKEN = `axmw_${"e".repeat(30)}${"2".repeat(6)}`;
const OWNER = "@test";

/** A CI job: persistence disabled, no explicit token, an ID token on offer. */
const jobEnvironment = (
  home: string,
  idTokenEnvironment: Readonly<Record<string, string>>,
): Record<string, string> => ({
  HOME: home,
  AXM_USER_HOME: home,
  AXM_TOKEN: "",
  AXM_TOKEN_FILE: "",
  AXM_TRUSTED_PUBLISHING: "",
  AXM_NO_UPDATE_CHECK: "1",
  ...idTokenEnvironment,
});

const setup = async (refuse = false) => {
  const idTokens = await startGitHubActionsIdTokenServer({ idToken: ID_TOKEN });
  const registry = await startHttpRegistry({
    trustedPublishing: {
      subjectToken: ID_TOKEN,
      accessToken: WORKLOAD_TOKEN,
      publisherName: "release",
      refuse,
    },
  });
  const home = createTempDir();
  writeUserDefaultRegistry(home.path, registry.url);
  return {
    idTokens,
    registry,
    home,
    env: jobEnvironment(home.path, idTokens.environment),
    cleanup: async () => {
      home.cleanup();
      await registry.close();
      await idTokens.close();
    },
  };
};

describe("Trusted publishing from a GitHub Actions job", () => {
  it("names the trusted publisher after exactly one exchange", async () => {
    const world = await setup();
    try {
      const result = await runCli(["whoami", "--json"], { env: world.env });
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: true,
        result: {
          user: OWNER,
          credentialType: "oidc",
          trustedPublisher: { name: "release" },
        },
      });
      expect(result.stdout + result.stderr).not.toContain(WORKLOAD_TOKEN);
      expect(result.stdout + result.stderr).not.toContain(world.idTokens.requestToken);

      expect(world.idTokens.requests).toEqual([
        {
          audience: world.registry.url,
          apiVersion: "2.0",
          authorization: `Bearer ${world.idTokens.requestToken}`,
        },
      ]);
      expect(world.registry.tokenExchanges).toEqual([
        {
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          subject_token: ID_TOKEN,
          subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
          audience: world.registry.url,
          requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
        },
      ]);
      const identityReads = world.registry.requests.filter(
        (request) => request.path === "/v1/auth/me",
      );
      expect(identityReads.map((request) => request.authorization)).toEqual([
        `Bearer ${WORKLOAD_TOKEN}`,
      ]);
    } finally {
      await world.cleanup();
    }
  });

  it("reads anonymously without asking for an ID token", async () => {
    const world = await setup();
    try {
      const result = await runCli(["view", "@test/skills/absent", "--json"], { env: world.env });
      expect(JSON.parse(result.stdout), result.stdout + result.stderr).toMatchObject({
        ok: false,
        code: "not_found",
      });
      expect(world.idTokens.requests).toEqual([]);
      expect(world.registry.tokenExchanges).toEqual([]);
      const reads = world.registry.requests.filter((request) => request.method === "GET");
      expect(reads.length).toBeGreaterThan(0);
      expect(reads.map((request) => request.authorization)).toEqual(reads.map(() => undefined));
    } finally {
      await world.cleanup();
    }
  });

  it("writes the workload token when it is the effective credential", async () => {
    const world = await setup();
    try {
      const result = await runCli(["token", "show", "--plain"], {
        env: world.env,
        exactOutput: true,
      });
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toBe(`${WORKLOAD_TOKEN}\n`);
      expect(world.registry.tokenExchanges).toHaveLength(1);
    } finally {
      await world.cleanup();
    }
  });

  it("publishes with no stored secret", async () => {
    const world = await setup();
    const workspace = createTempDir();
    try {
      await initWorkspace(workspace.path, world.registry.url, OWNER);
      const created = await runCli(["skills", "new", "release-notes", "--owner", OWNER], {
        cwd: workspace.path,
        env: world.env,
      });
      expect(created.exitCode, created.stdout + created.stderr).toBe(0);
      const published = await runCli(["skills", "publish", `${OWNER}/skills/release-notes`], {
        cwd: workspace.path,
        env: world.env,
      });
      expect(published.exitCode, published.stdout + published.stderr).toBe(0);
      expect(world.registry.publishes.map((record) => record.authorization)).toEqual([
        `Bearer ${WORKLOAD_TOKEN}`,
      ]);
    } finally {
      workspace.cleanup();
      await world.cleanup();
    }
  });

  it("asks for a person when no trusted publisher accepts the job", async () => {
    const world = await setup(true);
    try {
      const result = await runCli(["whoami", "--json"], { env: world.env });
      expect(result.exitCode, result.stdout + result.stderr).toBe(13);
      const document: unknown = JSON.parse(result.stdout);
      expect(document).toMatchObject({ ok: false, code: "auth_required" });
      expect(result.stdout).toContain("`id-token` with `write`");
      expect(result.stdout).toContain("trusted publisher");
      // Neither the identity token nor the request that carried it is reported.
      expect(result.stdout + result.stderr).not.toContain(ID_TOKEN);
      expect(result.stdout + result.stderr).not.toContain("subject_token");
      expect(result.stdout + result.stderr).not.toContain(world.idTokens.requestToken);
      expect(world.registry.tokenExchanges).toHaveLength(1);
      expect(world.registry.requests.filter((request) => request.path === "/v1/auth/me")).toEqual(
        [],
      );
    } finally {
      await world.cleanup();
    }
  });

  it("leaves a job that opted out on its explicit sources", async () => {
    const world = await setup();
    try {
      const result = await runCli(["whoami", "--json"], {
        env: { ...world.env, AXM_TRUSTED_PUBLISHING: "0" },
      });
      // Persistence is disabled in CI and nothing explicit was supplied.
      expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, code: "auth_required" });
      expect(world.idTokens.requests).toEqual([]);
      expect(world.registry.tokenExchanges).toEqual([]);
    } finally {
      await world.cleanup();
    }
  });
});
