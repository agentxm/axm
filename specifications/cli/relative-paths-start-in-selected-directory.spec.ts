import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeDirectoryFixture, unattendedProjectSetup } from "../support/directory-harness.js";
import { snapshotWorkspaceContent } from "../support/workspace-fixtures.js";
import { writeLocalSkillPackage } from "../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/relative-paths-start-in-selected-directory",
  title: "Relative paths start in the selected directory",
  statement:
    "AXM shall resolve relative command paths and configured local sources from the selected workspace directory.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "The built CLI parses global arguments and selects its execution directory before composing workspace services; a real process establishes the selected filesystem boundary.",
  methods: ["example", "decision-table"],
  derivedFrom: [
    "packages/cli-e2e/src/directory.e2e.test.ts",
    "packages/cli/help/topics/basic-usage.md",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Relative paths start in the selected directory", () => {
  it("uses the selected workspace for a relative lint path and a configured local source", async () => {
    const fixture = makeDirectoryFixture();
    try {
      const setup = await fixture.run(["-C", "../selected", ...unattendedProjectSetup]);
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      fs.writeFileSync(path.join(fixture.invoking, "axm.json"), "not json");
      const source = writeLocalSkillPackage(fixture.selected, { name: "directory-review" });
      const settings = {
        agents: [],
        skills: { "directory-review": "./vendor/directory-review" },
        minimumReleaseAge: "0s",
      };
      fs.writeFileSync(path.join(fixture.selected, "axm.json"), JSON.stringify(settings));
      const before = snapshotWorkspaceContent(fixture.invoking);
      const applied = await fixture.run([
        "-C",
        "../selected",
        "sync",
        "--non-interactive",
        "--json",
      ]);
      expect(applied.exitCode, applied.stdout + applied.stderr).toBe(0);
      expect(
        fs.readFileSync(
          path.join(
            fixture.selected,
            "agent_extensions/local/vendor/directory-review/src/SKILL.md",
          ),
          "utf8",
        ),
      ).toBe(fs.readFileSync(path.join(source, "src/SKILL.md"), "utf8"));
      const lint = await fixture.run(["-C", "../selected", "lint", ".", "--json"]);
      const document: unknown = JSON.parse(lint.stdout);
      expect(document).toMatchObject({ result: { findings: expect.any(Array) } });
      expect(lint.stdout).not.toContain("workspace/settings-schema-valid");
      expect(snapshotWorkspaceContent(fixture.invoking)).toEqual(before);
    } finally {
      fixture.cleanup();
    }
  });
});
