import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { makeDirectoryFixture, unattendedProjectSetup } from "./test-support/directory-harness.js";
import { snapshotTree } from "@agentxm/test-support";

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
  derivedFrom: ["apps/cli-e2e/src/directory.e2e.test.ts", "apps/cli/help/topics/basic-usage.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Should repeated or empty directory options be rejected or have an explicit selection policy?",
  ],
});

describe("Commands use the selected working directory", () => {
  it("discovers dependencies from the selected directory without setup", async () => {
    const fixture = makeDirectoryFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.selected, "package.json"),
        JSON.stringify({ dependencies: { react: "18.2.0" } }),
      );
      const installed = path.join(fixture.selected, "node_modules/react");
      fs.mkdirSync(installed, { recursive: true });
      fs.writeFileSync(
        path.join(installed, "package.json"),
        JSON.stringify({ name: "react", version: "18.2.0" }),
      );
      const before = snapshotTree(fixture.invoking);
      const result = await fixture.run(["-C", fixture.selected, "discover", "--json"]);
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      const output: unknown = JSON.parse(result.stdout);
      expect(output).toMatchObject({ ok: true, result: { totalDetected: 1, count: 0 } });
      expect(snapshotTree(fixture.invoking)).toEqual(before);
      expect(fs.existsSync(path.join(fixture.selected, "axm.json"))).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it.each(["default", "long", "short", "symlink"])(
    "selects the %s directory without changing another workspace",
    async (form) => {
      const fixture = makeDirectoryFixture();
      try {
        fs.writeFileSync(path.join(fixture.invoking, "NOTES.md"), "invoking workspace\n");
        const before = snapshotTree(fixture.invoking);
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
        if (form !== "default") expect(snapshotTree(fixture.invoking)).toEqual(before);
        else expect(snapshotTree(fixture.selected)).toEqual({});
      } finally {
        fixture.cleanup();
      }
    },
  );
});
