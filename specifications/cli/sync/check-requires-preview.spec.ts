import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeDirectoryFixture, unattendedProjectSetup } from "../../support/directory-harness.js";
import { snapshotProtectedState } from "../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/sync/check-requires-preview",
  title: "A sync check requires preview mode",
  statement:
    "When sync is invoked with --fail-on-change without --preview, AXM shall reject the invocation as a usage error before applying workspace changes.",
  class: "constraint",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  boundary: "process",
  boundaryRationale:
    "The built CLI establishes the actual parser combination, usage error, process exit status, and persisted state after refusal.",
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/sync/handler.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Sync checks require preview", () => {
  it("refuses a check without preview before repairing a divergent projection", async () => {
    const fixture = makeDirectoryFixture();
    try {
      const setup = await fixture.run(["-C", fixture.selected, ...unattendedProjectSetup]);
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      const nativePath = path.join(fixture.selected, ".mcp.json");
      fs.writeFileSync(
        nativePath,
        JSON.stringify({
          mcpServers: {
            obsolete: {
              "x-axm": { v: 1, managed: true, ext: "@workspace/mcps/obsolete", source: "inline" },
              command: "node",
              args: ["obsolete-server.js"],
            },
          },
        }),
      );
      const before = snapshotProtectedState(fixture.selected);

      const result = await fixture.run([
        "-C",
        fixture.selected,
        "sync",
        "--fail-on-change",
        "--non-interactive",
        "--json",
      ]);

      expect(result.exitCode, result.stdout + result.stderr).toBe(2);
      const document: unknown = JSON.parse(result.stdout);
      expect(document).toMatchObject({
        ok: false,
        code: "usage",
        detail: "--fail-on-change requires --preview",
      });
      expect(snapshotProtectedState(fixture.selected)).toEqual(before);
    } finally {
      fixture.cleanup();
    }
  });
});
