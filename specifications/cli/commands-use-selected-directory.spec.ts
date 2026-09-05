import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeDirectoryFixture, unattendedProjectSetup } from "../support/directory-harness.js";
import { snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/commands-use-selected-directory",
  title: "Commands use the selected working directory",
  statement:
    "AXM shall execute workspace commands in the directory selected by --directory or -C, including when that selection is a symbolic link, and shall use the launch directory when no directory is selected.",
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
  openQuestions: [
    "Should repeated or empty directory options be rejected or have an explicit selection policy?",
  ],
});

describe("Commands use the selected working directory", () => {
  it.each(["default", "long", "short", "symlink"])(
    "selects the %s directory without changing another workspace",
    async (form) => {
      const fixture = makeDirectoryFixture();
      try {
        fs.writeFileSync(path.join(fixture.invoking, "NOTES.md"), "invoking workspace\n");
        const before = snapshotWorkspaceContent(fixture.invoking);
        const alias = path.join(fixture.root, "alias");
        if (form === "symlink") fs.symlinkSync(fixture.selected, alias, "dir");
        const flags =
          form === "default"
            ? []
            : [
                form === "long" ? "--directory" : "-C",
                form === "symlink" ? alias : fixture.selected,
              ];
        const result = await fixture.run([...flags, ...unattendedProjectSetup]);
        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        const expected = form === "default" ? fixture.invoking : fixture.selected;
        expect(fs.existsSync(path.join(expected, "axm.json"))).toBe(true);
        if (form !== "default") expect(snapshotWorkspaceContent(fixture.invoking)).toEqual(before);
        else expect(snapshotWorkspaceContent(fixture.selected)).toEqual({});
      } finally {
        fixture.cleanup();
      }
    },
  );
});
