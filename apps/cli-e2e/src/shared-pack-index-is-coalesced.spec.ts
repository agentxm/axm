import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { startHttpRegistry } from "./e2e/http-registry-server.js";
import { createTempDir, runCli } from "./e2e/utils.js";

export const specification = defineSpecification({
  requirement: "cli/shared-pack-member-index-is-coalesced",
  title: "Configured packs share one member index read and materialization",
  statement:
    "When two configured Packs depend on the same Registry member, AXM shall read that member's index once during planning, retain both Packs' constraints, and acquire the selected member archive once for the workspace transition.",
  class: "functional",
  role: "supporting",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "The real CLI process and controlled HTTP Registry count exact member-index and archive requests for one configured sync.",
  methods: ["example"],
  derivedFrom: ["docs/architecture/workspace/execution.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const OWNER = "@test";
const env = { AXM_TOKEN: "e2e-test-token" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const setupWorkspace = async (workspace: string, registryUrl: string) => {
  const setup = await runCli(["setup", "--yes", "--scope", "project", "--agent", "claude-code"], {
    cwd: workspace,
    env,
  });
  expect(setup.exitCode, setup.stderr).toBe(0);
  const settingsPath = path.join(workspace, "axm.json");
  const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  if (!isRecord(parsed)) throw new Error("Expected workspace settings");
  parsed["defaultRegistry"] = "test";
  parsed["sources"] = [{ name: "test", type: "registry", location: registryUrl }];
  parsed["owner"] = OWNER;
  parsed["minimumReleaseAge"] = "0s";
  fs.writeFileSync(settingsPath, JSON.stringify(parsed, null, 2));
  return { settingsPath, settings: parsed };
};

const authorPack = async (workspace: string, name: string) => {
  const created = await runCli(["packs", "new", name, "--owner", OWNER], {
    cwd: workspace,
    env,
  });
  expect(created.exitCode, created.stderr).toBe(0);
  const added = await runCli(["packs", "add", name, `${OWNER}/skills/shared`], {
    cwd: workspace,
    env,
  });
  expect(added.exitCode, added.stdout + added.stderr).toBe(0);
  const manifest: unknown = JSON.parse(
    fs.readFileSync(path.join(workspace, "packs", name, "pack.json"), "utf8"),
  );
  expect(manifest).toMatchObject({
    dependencies: { [`${OWNER}/skills/shared`]: expect.any(String) },
  });
};

describe("Shared configured Pack member", () => {
  it("reads one member index and downloads one selected archive", async () => {
    const publisher = createTempDir();
    const consumer = createTempDir();
    const registry = await startHttpRegistry({ enforcePackDependencies: true });
    try {
      await setupWorkspace(publisher.path, registry.url);
      const created = await runCli(["skills", "new", "shared", "--owner", OWNER], {
        cwd: publisher.path,
        env,
      });
      expect(created.exitCode, created.stderr).toBe(0);
      for (const name of ["first-pack", "second-pack"]) {
        await authorPack(publisher.path, name);
      }
      const published = await runCli(["publish", "--owner", OWNER, "--json"], {
        cwd: publisher.path,
        env,
      });
      expect(published.exitCode, published.stdout + published.stderr).toBe(0);

      const { settingsPath, settings } = await setupWorkspace(consumer.path, registry.url);
      settings["packs"] = {
        "first-pack": `${OWNER}/packs/first-pack`,
        "second-pack": `${OWNER}/packs/second-pack`,
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      const start = registry.requests.length;
      const result = await runCli(["sync", "--json"], { cwd: consumer.path, env });
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        ok: true,
        result: { outcome: "applied" },
      });
      const requests = registry.requests.slice(start);
      const memberIndex = requests.filter(
        (request) => request.method === "GET" && /\/skills\/shared(?:\?|$)/u.test(request.path),
      );
      const memberArchive = requests.filter(
        (request) =>
          request.method === "GET" && /\/skills\/shared\/[^/]+\/archive$/u.test(request.path),
      );
      expect(
        memberIndex,
        `${result.stdout}\n${JSON.stringify(
          requests.map(({ method, path: requestPath, status }) => ({
            method,
            path: requestPath,
            status,
          })),
        )}`,
      ).toHaveLength(1);
      expect(memberArchive).toHaveLength(1);
    } finally {
      await registry.close();
      publisher.cleanup();
      consumer.cleanup();
    }
  });
});
