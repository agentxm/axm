import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { makeDirectoryFixture, unattendedProjectSetup } from "./test-support/directory-harness.js";
import { snapshotWorkspaceContent } from "./test-support/workspace-fixtures.js";
import { makeEnvironmentProcessFixture } from "./test-support/environment-process-fixture.js";
import { publishSkill } from "./test-support/published-registry.js";
import { writeLocalSkillPackage } from "./test-support/spec-file-store.js";

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
    "apps/cli-e2e/src/directory.e2e.test.ts",
    "apps/cli/help/topics/basic-usage.md",
    "apps/cli/help/topics/environment.md",
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
            "agent_extensions/path/@acme/skills/directory-review/src/SKILL.md",
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
  it("uses the Registry selected by settings in the selected directory", async () => {
    const fixture = makeEnvironmentProcessFixture();
    try {
      await publishSkill({
        registryLocation: pathToFileURL(path.join(fixture.selected, "registry")).href,
        owner: "@acme",
        name: "environment-directory",
        body: "Selected execution directory source",
      });
      await publishSkill({
        registryLocation: pathToFileURL(path.join(fixture.invoking, "registry")).href,
        owner: "@acme",
        name: "environment-directory",
        body: "Invoking directory distractor source",
      });
      fs.writeFileSync(
        path.join(fixture.selected, "axm.json"),
        JSON.stringify({
          agents: [],
          defaultRegistry: "test",
          sources: [
            {
              name: "test",
              type: "registry",
              location: pathToFileURL(path.join(fixture.selected, "registry")).href,
            },
          ],
        }),
      );
      const before = snapshotWorkspaceContent(fixture.invoking);
      const result = await fixture.run([
        "-C",
        "../selected",
        "install",
        "@acme/skills/environment-directory",
        "--non-interactive",
        "--json",
      ]);
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      const acquired = fs.readFileSync(
        path.join(
          fixture.selected,
          "agent_extensions/registry/@acme/skills/environment-directory/src/SKILL.md",
        ),
        "utf8",
      );
      expect(acquired).toContain("Selected execution directory source");
      expect(acquired).not.toContain("Invoking directory distractor source");
      expect(snapshotWorkspaceContent(fixture.invoking)).toEqual(before);
    } finally {
      fixture.cleanup();
    }
  });
});
