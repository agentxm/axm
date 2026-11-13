import { expect, it } from "vitest";
import { createBinaryRunner } from "@agentxm/client-e2e-utils";
import { defineExecutionBinding } from "@agentxm/specification-metadata";
import { resolveHostBinaryPath } from "./distribution-targets.js";
import {
  makeEnvironmentProcessFixture,
  withEnvironmentRegistry,
} from "./test-support/environment-process-fixture.js";
import { writeLocalSkillPackage } from "./test-support/spec-file-store.js";

export const executionBinding = defineExecutionBinding({
  requirements: [
    "cli/list/ordinary-inventory-is-local",
    "cli/lint/local-inspection-requires-no-registry",
  ],
  boundary: "process",
  rationale:
    "The compiled CLI inspects a real installed local Skill while its configured Registry returns 503 to every request. An independent HTTP journal stays empty for local inspection and observes an explicit remote-read control.",
});

it("local inspection succeeds without contacting an unavailable configured Registry", async () => {
  const fixture = makeEnvironmentProcessFixture(createBinaryRunner(resolveHostBinaryPath()));
  const environment = { AXM_TOKEN: "e2e-test-token", AXM_TELEMETRY: "0", AXM_TRACE: "0" };
  try {
    await withEnvironmentRegistry(
      () => ({
        status: 503,
        body: JSON.stringify({
          type: "https://registry.agentxm.ai/v1/problems/unavailable",
          title: "Unavailable",
          status: 503,
          detail: "Controlled Registry outage",
          code: "unavailable",
        }),
      }),
      async (origin, requests) => {
        fixture.writeProjectSettings({
          owner: "@acme",
          agents: ["claude-code"],
          sources: [{ name: "test", type: "registry", location: origin }],
          defaultRegistry: "test",
          skills: {},
        });
        const source = writeLocalSkillPackage(fixture.root, { name: "local-review" });
        const installed = await fixture.run(
          ["install", source, "--skill", "local-review", "--json"],
          environment,
        );
        expect(installed.exitCode, installed.stdout + installed.stderr).toBe(0);
        expect(requests).toEqual([]);
        for (const command of [
          ["list"],
          ["skills", "show", "local-review"],
          ["lint"],
          ["lock", "export", "--format", "cyclonedx"],
          ["cache", "status"],
        ]) {
          const result = await fixture.run([...command, "--json"], environment);
          expect(result.exitCode, `${command.join(" ")}\n${result.stdout}\n${result.stderr}`).toBe(
            0,
          );
          expect(() => JSON.parse(result.stdout)).not.toThrow();
          if (command[0] === "list" || command[0] === "skills" || command[0] === "lock")
            expect(result.stdout).toContain("local-review");
          expect(requests).toEqual([]);
        }
        const remote = await fixture.run(
          ["view", "@acme/skills/remote", "--registry", origin, "--json"],
          environment,
        );
        expect(remote.exitCode).not.toBe(0);
        expect(requests.length).toBeGreaterThan(0);
      },
    );
  } finally {
    fixture.cleanup();
  }
});
