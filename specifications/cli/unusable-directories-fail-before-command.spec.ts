import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeDirectoryFixture, unattendedProjectSetup } from "../support/directory-harness.js";
import { snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/unusable-directories-fail-before-command",
  title: "Unusable directories fail before the command runs",
  statement:
    "When a selected directory is missing, is a file, or cannot be traversed, AXM shall report a usage failure before executing the command or changing workspace state.",
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

describe("Unusable directories fail before the command runs", () => {
  it.each(["missing", "file", "restricted"])(
    "rejects a %s directory without running setup",
    async (kind) => {
      const fixture = makeDirectoryFixture();
      const target = path.join(fixture.root, "unusable");
      try {
        if (kind === "file") fs.writeFileSync(target, "file");
        if (kind === "restricted") {
          fs.mkdirSync(target);
          fs.chmodSync(target, 0o600);
        }
        const before = snapshotWorkspaceContent(fixture.invoking);
        const result = await fixture.run(["-C", target, ...unattendedProjectSetup]);
        expect(result.exitCode, result.stdout + result.stderr).toBe(2);
        const document: unknown = JSON.parse(result.stdout);
        expect(document).toMatchObject({ ok: false, code: "usage" });
        expect(snapshotWorkspaceContent(fixture.invoking)).toEqual(before);
        expect(fs.existsSync(path.join(target, "axm.json"))).toBe(false);
        if (kind === "missing") expect(fs.existsSync(target)).toBe(false);
        if (kind === "file") expect(fs.readFileSync(target, "utf8")).toBe("file");
        if (kind === "restricted") expect(fs.readdirSync(target)).toEqual([]);
      } finally {
        if (kind === "restricted" && fs.existsSync(target)) fs.chmodSync(target, 0o700);
        fixture.cleanup();
      }
    },
  );
});
