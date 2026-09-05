import * as fs from "node:fs";
import * as path from "node:path";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { PlanResolutionDocumentSchema } from "axm.sh/specification-harness";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeDirectoryFixture, unattendedProjectSetup } from "../../support/directory-harness.js";
import { snapshotProtectedState } from "../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/sync/check-reports-convergence",
  title: "A sync check reports whether managed output needs updating",
  statement:
    "When sync --preview --fail-on-change can assess workspace reconciliation, AXM shall return exit status 0 with a no-op result when no reconciliation is needed and exit status 1 with divergence and the complete preview plan when changes are needed.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "machine-automation"],
  boundary: "process",
  boundaryRationale:
    "Separate invocations of the built CLI expose the exit status and machine result consumed by automation, including the distinction between an ordinary preview and a convergence check against the same persisted workspace.",
  methods: ["example"],
  derivedFrom: [
    "cli/sync/preview-is-pure",
    "packages/cli/src/root/sync/handler.internal.test.ts",
    "packages/cli/help/topics/workspace-state.md",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decodePlan = Schema.decodeUnknownSync(PlanResolutionDocumentSchema);
const readPlan = (stdout: string) => {
  const document: unknown = JSON.parse(stdout);
  return decodePlan(document).result;
};

describe("Sync convergence check", () => {
  it("distinguishes a current workspace from a divergent preview through the process exit status", async () => {
    const fixture = makeDirectoryFixture();
    try {
      const run = (args: ReadonlyArray<string>) =>
        fixture.run(["-C", fixture.selected, ...args, "--non-interactive", "--json"]);
      const setup = await fixture.run(["-C", fixture.selected, ...unattendedProjectSetup]);
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      const synchronized = await run(["sync"]);
      expect(synchronized.exitCode, synchronized.stdout + synchronized.stderr).toBe(0);
      const currentBefore = snapshotProtectedState(fixture.selected);

      const current = await run(["sync", "--preview", "--fail-on-change"]);

      expect(current.exitCode, current.stdout + current.stderr).toBe(0);
      const currentPlan = readPlan(current.stdout);
      expect(currentPlan).toMatchObject({
        contract: "plan-result-v3",
        outcome: "no-op",
        mode: "preview",
        counts: { committed: 0 },
        units: [],
      });
      expect(currentPlan.divergence).toBeUndefined();
      expect(snapshotProtectedState(fixture.selected)).toEqual(currentBefore);

      const nativePath = path.join(fixture.selected, ".mcp.json");
      fs.writeFileSync(
        nativePath,
        JSON.stringify(
          {
            mcpServers: {
              obsolete: {
                "x-axm": {
                  v: 1,
                  managed: true,
                  ext: "@workspace/mcps/obsolete",
                  source: "inline",
                },
                command: "node",
                args: ["obsolete-server.js"],
              },
              unrelated: { command: "node", args: ["keep-server.js"] },
            },
          },
          null,
          2,
        ),
      );
      const divergentBefore = snapshotProtectedState(fixture.selected);
      const ordinary = await run(["sync", "--preview"]);
      expect(ordinary.exitCode, ordinary.stdout + ordinary.stderr).toBe(0);
      const ordinaryPlan = readPlan(ordinary.stdout);
      expect(ordinaryPlan.outcome).toBe("previewed");
      expect(ordinaryPlan.units.length).toBeGreaterThan(0);
      expect(snapshotProtectedState(fixture.selected)).toEqual(divergentBefore);

      const divergent = await run(["sync", "--preview", "--fail-on-change"]);

      expect(divergent.exitCode, divergent.stdout + divergent.stderr).toBe(1);
      const divergentPlan = readPlan(divergent.stdout);
      expect(divergentPlan).toMatchObject({
        contract: "plan-result-v3",
        outcome: "previewed",
        mode: "preview",
        divergence: true,
        counts: { committed: 0 },
      });
      expect(divergentPlan.units).toEqual(ordinaryPlan.units);
      expect(divergentPlan.units).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: "stale managed agent projections", state: "ready" }),
        ]),
      );
      expect(snapshotProtectedState(fixture.selected)).toEqual(divergentBefore);
    } finally {
      fixture.cleanup();
    }
  }, 30000);
});
