import { expect, it } from "vitest";
import { defineExecutionBinding } from "@agentxm/specification-metadata";
import { createBinaryRunner } from "@agentxm/client-e2e-utils";
import { resolveHostBinaryPath } from "./distribution-targets.js";
import { startHttpRegistry } from "@agentxm/client-e2e-utils/http-registry";
import { makeEnvironmentProcessFixture } from "./test-support/environment-process-fixture.js";
import { publishExtension } from "./test-support/registry-workspace.js";

export const executionBinding = defineExecutionBinding({
  requirements: [
    "cli/view/reports-published-native-hook-facts",
    "registry-client/cached-archives-require-current-authorization",
  ],
  boundary: "process",
  rationale:
    "The compiled CLI warms a remote Hook archive cache, then refuses its content after current access is revoked while public metadata stays available; the independent HTTP journal observes verification-purpose traffic.",
});

it("published Hook view refuses a warm archive after content access is revoked", async () => {
  const registry = await startHttpRegistry();
  const fixture = makeEnvironmentProcessFixture(createBinaryRunner(resolveHostBinaryPath()));
  const environment = { AXM_TOKEN: "e2e-test-token", AXM_TELEMETRY: "0", AXM_TRACE: "0" };
  try {
    await publishExtension({
      registryLocation: registry.url,
      owner: "@test",
      plural: "hooks",
      name: "cached-audit",
      versionChange: "major",
    });
    fixture.writeProjectSettings({
      agents: ["claude-code"],
      sources: [{ name: "test", type: "registry", location: registry.url }],
      defaultRegistry: "test",
      minimumReleaseAge: "0s",
    });
    const command = ["view", "@test/hooks/cached-audit", "--registry", registry.url, "--json"];
    const warm = await fixture.run(command, environment);
    expect(warm.exitCode, warm.stdout + warm.stderr).toBe(0);
    expect(warm.stdout).toContain("published-static-only");
    const cache = await fixture.run(["cache", "status", "--json"], environment);
    expect(cache.exitCode, cache.stdout + cache.stderr).toBe(0);
    expect(JSON.parse(cache.stdout)).toMatchObject({ ok: true, result: { entries: 1 } });
    expect(registry.requests.some((request) => request.usagePurpose === "verification")).toBe(true);
    registry.denyContent("hooks/cached-audit");
    const before = registry.requests.length;
    const denied = await fixture.run(command, environment);
    expect(denied.exitCode, denied.stdout + denied.stderr).not.toBe(0);
    expect(denied.stdout).not.toContain("published-static-only");
    const reads = registry.requests.slice(before);
    expect(reads.some((request) => request.path === "/v1/resolutions")).toBe(true);
    expect(reads.some((request) => request.path.endsWith("/archive"))).toBe(false);
  } finally {
    fixture.cleanup();
    await registry.close();
  }
});
