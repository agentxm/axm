import * as fs from "node:fs";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeDirectoryFixture } from "../support/directory-harness.js";
import { writeMalformedWorkspaceState } from "../support/malformed-workspace-fixture.js";
import { snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/version-output-identifies-running-release",
  title: "Version output identifies the running release",
  statement:
    "When the version flag is requested, AXM shall report the running CLI release version, using a structured version document when machine output is selected.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "actionable-diagnostics"],
  boundary: "process",
  boundaryRationale:
    "The built CLI process must report its package release identity through the actual global formatter in both human and machine modes.",
  methods: ["contract", "example"],
  derivedFrom: [
    "packages/cli/help/topics/machine-output.md",
    "packages/cli-e2e/src/smoke.e2e.test.ts",
    "packages/cli-e2e/src/binary-smoke.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "These examples exercise the built JavaScript entrypoint through Bun. Compiled and externally installed release identities require evidence for those exact artifacts.",
      retirementCondition:
        "Bind exact version readback to identified compiled and installed release artifacts.",
    },
  ],
});

const manifest: unknown = JSON.parse(
  fs.readFileSync(new URL("../../packages/cli/package.json", import.meta.url), "utf8"),
);
if (
  typeof manifest !== "object" ||
  manifest === null ||
  !("version" in manifest) ||
  typeof manifest.version !== "string"
) {
  throw new Error("The CLI package must identify its release version");
}
const expectedVersion = manifest.version;

describe("CLI release identity", () => {
  for (const state of ["absent", "malformed populated"] as const)
    it.each([
      { label: "human", flags: ["--version"], machine: false },
      { label: "machine after version", flags: ["--version", "--json"], machine: true },
      { label: "machine before version", flags: ["--json", "--version"], machine: true },
    ])(
      `$label identifies the running release with ${state} workspace state`,
      async ({ flags, machine }) => {
        const fixture = makeDirectoryFixture();
        try {
          if (state === "malformed populated")
            writeMalformedWorkspaceState(fixture.invoking, fixture.home);
          const before = snapshotWorkspaceContent(fixture.root);
          const result = await fixture.run(flags);
          expect(result.exitCode, result.stdout + result.stderr).toBe(0);
          expect(result.stderr).toBe("");
          if (machine) {
            const document: unknown = JSON.parse(result.stdout);
            expect(document).toEqual({ type: "version", name: "axm", version: expectedVersion });
          } else {
            expect(result.stdout.trim()).toBe(expectedVersion);
          }
          expect(snapshotWorkspaceContent(fixture.root)).toEqual(before);
        } finally {
          fixture.cleanup();
        }
      },
    );
});
