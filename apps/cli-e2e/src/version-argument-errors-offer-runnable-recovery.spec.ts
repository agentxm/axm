import * as fs from "node:fs";
import * as path from "node:path";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";

import { makeDirectoryFixture } from "./test-support/directory-harness.js";
import { ErrorEnvelope } from "./test-support/machine-documents.js";
import { snapshotWorkspaceContent } from "./test-support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/version/argument-errors-offer-runnable-recovery",
  title: "Version argument errors offer a command that corrects the request",
  statement:
    "When a version request for a matching workspace-authored package omits the exact version required by set or supplies one with another supported bump, AXM shall reject it as invalid usage without changing workspace content and suggest a runnable command on the root version route that corrects the arguments while preserving the selected package and bump.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "actionable-diagnostics", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "A built CLI process establishes the published error classification and executes its suggested command through the registered parser; calling a version handler alone cannot establish that recovery uses an available command route.",
  methods: ["example", "decision-table"],
  derivedFrom: [
    "cli/version/refuses-invalid-or-unowned-targets",
    "apps/cli/src/root/version/command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const handle = "@acme/skills/review";
const manifestPath = "skills/review/skill.json";
const decodeError = Schema.decodeUnknownSync(ErrorEnvelope);

/**
 * A workspace-authored skill package, written the way a person authors one.
 * An end-to-end project observes only shipped artifacts, so the fixture writes
 * the files itself rather than borrowing an application fixture.
 */
const writeAuthoredSkill = (root: string, version: string): void => {
  const packageRoot = path.join(root, "skills", "review");
  fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "skill.json"),
    `${JSON.stringify(
      {
        $schema: "https://axm.sh/schemas/skill.schema.json",
        owner: "@acme",
        type: "skill",
        name: "review",
        version,
        description: "The review skill.",
        license: "MIT",
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(packageRoot, "src", "SKILL.md"),
    "---\nname: review\ndescription: The review skill.\n---\n\n# review\n",
  );
  fs.writeFileSync(
    path.join(packageRoot, "notes.txt"),
    "Author notes preserved across the operation.\n",
  );
};

const readManifest = (root: string): unknown =>
  JSON.parse(fs.readFileSync(path.join(root, manifestPath), "utf8"));

const rows = [
  { name: "set without an exact version", bump: "set", extra: [] },
  { name: "patch with an extra exact version", bump: "patch", extra: ["2.0.0"] },
] as const;

describe("Version argument recovery", () => {
  it.each(rows)("corrects $name through the published root command", async (row) => {
    const fixture = makeDirectoryFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.invoking, "axm.json"),
        `${JSON.stringify({ owner: "@acme", agents: [], skills: { review: "workspace" } }, null, 2)}\n`,
      );
      writeAuthoredSkill(fixture.invoking, "1.0.0");
      fs.writeFileSync(
        path.join(fixture.invoking, "unrelated.txt"),
        "Unrelated authored content.\n",
      );
      const manifestBefore = readManifest(fixture.invoking);
      if (typeof manifestBefore !== "object" || manifestBefore === null)
        throw new Error("Expected the authored fixture manifest");
      const before = snapshotWorkspaceContent(fixture.invoking);
      const flags = ["--json", "--non-interactive"];

      const failure = await fixture.run(["version", handle, row.bump, ...row.extra, ...flags]);

      expect(failure.exitCode, failure.stdout + failure.stderr).toBe(2);
      const parsed: unknown = JSON.parse(failure.stdout);
      const error = decodeError(parsed);
      expect(error).toMatchObject({ ok: false, code: "usage" });
      expect(snapshotWorkspaceContent(fixture.invoking)).toEqual(before);
      const suggestion = error.suggestions?.find((candidate) => candidate.cmd !== undefined);
      if (suggestion?.cmd === undefined) throw new Error("Expected a runnable correction command");
      const command = suggestion.cmd.split(" ");
      expect(command.slice(0, 4)).toEqual(["axm", "version", handle, row.bump]);
      expect(command).toHaveLength(row.bump === "set" ? 5 : 4);
      const expectedVersion = row.bump === "set" ? command[4] : "1.0.1";
      expect(expectedVersion).toBeDefined();

      // The runner receives an argument vector, never a shell-evaluated suggestion.
      const recovery = await fixture.run([...command.slice(1), ...flags]);

      expect(recovery.exitCode, recovery.stdout + recovery.stderr).toBe(0);
      expect(readManifest(fixture.invoking)).toEqual({
        ...manifestBefore,
        version: expectedVersion,
      });
      const withoutManifest = (snapshot: Readonly<Record<string, string>>) =>
        Object.fromEntries(
          Object.entries(snapshot).filter(([relative]) => relative !== manifestPath),
        );
      expect(withoutManifest(snapshotWorkspaceContent(fixture.invoking))).toEqual(
        withoutManifest(before),
      );
    } finally {
      fixture.cleanup();
    }
  });
});
