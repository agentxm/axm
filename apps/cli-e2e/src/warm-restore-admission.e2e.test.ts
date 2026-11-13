import * as fs from "node:fs";
import * as path from "node:path";
import { expect, it } from "vitest";
import { createBinaryRunner } from "@agentxm/client-e2e-utils";
import { defineExecutionBinding } from "@agentxm/specification-metadata";
import { resolveHostBinaryPath } from "./distribution-targets.js";
import { startHttpRegistry } from "./e2e/http-registry-server.js";
import { makeEnvironmentProcessFixture } from "./test-support/environment-process-fixture.js";
import { publishSkill } from "./test-support/registry-workspace.js";

export const executionBinding = defineExecutionBinding({
  requirements: [
    "registry-client/batches-exact-content-admission",
    "registry-client/content-access-is-callback-scoped",
    "workspace/recheck-registry-exposure",
  ],
  boundary: "process",
  rationale:
    "A compiled CLI restores ten exact identities from its real warm archive cache. The independent HTTP Registry journal records batch membership and every wire request; the controlled server does not establish deployed policy behavior.",
});

it("restores ten warm identities with two bulk admission stages and no archive requests", async () => {
  const registry = await startHttpRegistry();
  const fixture = makeEnvironmentProcessFixture(createBinaryRunner(resolveHostBinaryPath()));
  const environment = { AXM_TOKEN: "e2e-test-token", AXM_TELEMETRY: "0", AXM_TRACE: "0" };
  const names = Array.from({ length: 10 }, (_, index) => `warm-${index}`);
  try {
    for (const name of names) {
      await publishSkill({
        registryLocation: registry.url,
        owner: "@test",
        name,
        body: `Exact cached guidance for ${name}.`,
      });
    }
    fixture.writeProjectSettings({
      owner: "@test",
      agents: ["claude-code"],
      sources: [{ name: "test", type: "registry", location: registry.url }],
      defaultRegistry: "test",
      minimumReleaseAge: "0s",
      skills: Object.fromEntries(names.map((name) => [name, `@test/skills/${name}`])),
    });
    const installed = await fixture.run(["sync", "--json"], environment);
    expect(installed.exitCode, installed.stdout + installed.stderr).toBe(0);
    const cached = await fixture.run(["cache", "status", "--json"], environment);
    expect(cached.exitCode, cached.stdout + cached.stderr).toBe(0);
    expect(JSON.parse(cached.stdout)).toMatchObject({ ok: true, result: { entries: 10 } });
    const lockPath = path.join(fixture.invoking, "axm.lock");
    const acceptedLock = fs.readFileSync(lockPath, "utf8");
    fs.rmSync(path.join(fixture.invoking, "agent_extensions"), { recursive: true });
    fs.rmSync(path.join(fixture.invoking, ".claude", "skills"), { recursive: true });

    const wireStart = registry.requests.length;
    const batchStart = registry.metadataRequests.length;
    const restored = await fixture.run(["sync", "--json"], environment);
    expect(restored.exitCode, restored.stdout + restored.stderr).toBe(0);
    expect(JSON.parse(restored.stdout)).toMatchObject({ ok: true, result: { outcome: "applied" } });
    const requests = registry.requests.slice(wireStart);
    const batches = registry.metadataRequests.slice(batchStart);
    const purposes = registry.metadataPurposes.slice(batchStart);
    const admissions = batches.filter((_, index) => purposes[index]?.[0] === "authorize-exact");
    const expected = names.map((name) => `@test/skill/${name}`).toSorted();
    expect(admissions.map((batch) => batch.toSorted())).toEqual([expected, expected]);
    // Exact metadata selection may precede admission; every exchange remains a
    // bulk resolution POST, never an archive download or per-item HEAD probe.
    const wire = requests.map(({ method, path, status }) => ({ method, path, status }));
    expect(wire, JSON.stringify(wire)).toHaveLength(batches.length);
    expect(
      requests.every((request) => request.method === "POST" && request.path === "/v1/resolutions"),
    ).toBe(true);
    expect(batches.every((batch) => batch.length === 10)).toBe(true);
    expect(fs.readFileSync(lockPath, "utf8")).toBe(acceptedLock);
    for (const name of names) {
      expect(
        fs.readFileSync(path.join(fixture.invoking, ".claude", "skills", name, "SKILL.md"), "utf8"),
      ).toContain(`Exact cached guidance for ${name}.`);
    }
  } finally {
    fixture.cleanup();
    await registry.close();
  }
});
