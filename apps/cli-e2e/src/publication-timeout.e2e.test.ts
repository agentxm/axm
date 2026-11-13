import { expect, it } from "vitest";
import { createBinaryRunner } from "@agentxm/client-e2e-utils";
import { defineExecutionBinding } from "@agentxm/specification-metadata";
import { resolveHostBinaryPath } from "./distribution-targets.js";
import { startHttpRegistry } from "@agentxm/client-e2e-utils/http-registry";
import { makeEnvironmentProcessFixture } from "./test-support/environment-process-fixture.js";

export const executionBinding = defineExecutionBinding({
  requirements: ["cli/publish/outcomes-distinguish-unresolved-uploads"],
  boundary: "process",
  rationale:
    "The compiled CLI uses its production five-minute publication deadline over a real socket. The server commits but never answers the PUT; independent arrival and publication journals distinguish readback settlement from replay.",
});

it("settles a committed upload after its real deadline without replay", async () => {
  const registry = await startHttpRegistry({ commitThenHangPublishOnce: ["skills/deadline"] });
  const binary = createBinaryRunner(resolveHostBinaryPath());
  const fixture = makeEnvironmentProcessFixture((args, options) =>
    binary(args, { ...options, timeout: 330_000 }),
  );
  const environment = { AXM_TOKEN: "e2e-test-token", AXM_TELEMETRY: "0", AXM_TRACE: "0" };
  try {
    fixture.writeProjectSettings({
      owner: "@test",
      agents: [],
      skills: {},
      sources: [{ name: "test", type: "registry", location: registry.url }],
      defaultRegistry: "test",
      minimumReleaseAge: "0s",
    });
    const created = await fixture.run(
      ["skills", "new", "deadline", "--owner", "@test", "--json"],
      environment,
    );
    expect(created.exitCode, created.stdout + created.stderr).toBe(0);
    const committed = registry.nextHungPublish();
    const started = performance.now();
    const pending = fixture.run(["publish", "@test/skills/deadline", "--json"], environment);
    await committed;
    expect(registry.publishes).toHaveLength(1);
    const result = await pending;
    expect(performance.now() - started).toBeGreaterThanOrEqual(300_000);
    const wire = registry.requests.map(({ method, path, status }) => ({ method, path, status }));
    expect(result.exitCode, result.stdout + result.stderr + JSON.stringify(wire)).toBe(0);
    expect(JSON.parse(result.stdout).result.execution.outcomes).toMatchObject([
      { name: "deadline", status: "success", settlement: "readback" },
    ]);
    expect(registry.publishes).toHaveLength(1);
    expect(wire.filter((request) => request.method === "PUT")).toHaveLength(1);
  } finally {
    fixture.cleanup();
    await registry.close();
  }
}, 360_000);
