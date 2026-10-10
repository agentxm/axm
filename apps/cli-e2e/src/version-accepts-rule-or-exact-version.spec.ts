import * as fs from "node:fs";
import * as path from "node:path";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";

import { makeDirectoryFixture } from "./test-support/directory-harness.js";
import { ErrorEnvelope } from "./test-support/machine-documents.js";
import { snapshotTree } from "@agentxm/test-support";

export const specification = defineSpecification({
  requirement: "cli/version/accepts-rule-or-exact-version",
  title: "Version accepts a rule or exact semantic version in one bump slot",
  statement:
    "The version command shall accept major, minor, patch, prerelease, or an exact semantic version in its required bump positional. Preview shall describe the same version without changing the workspace; apply shall change only the selected authored manifest version. The command shall reject set, ranges, unknown words, missing bumps, and extra version arguments as usage errors before reading invalid workspace settings.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "actionable-diagnostics", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "A built CLI process establishes the published positional grammar, parser error precedence, preview purity, and applied manifest behavior.",
  methods: ["example", "decision-table"],
  derivedFrom: [
    "cli/version/refuses-invalid-or-unowned-targets",
    "apps/cli/src/root/version/command.ts",
  ],
  supersedes: ["cli/version/argument-errors-offer-runnable-recovery"],
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
  { bump: "major", expected: "2.0.0" },
  { bump: "minor", expected: "1.1.0" },
  { bump: "patch", expected: "1.0.1" },
  { bump: "prerelease", expected: "1.0.1-0" },
  { bump: "2.0.0", expected: "2.0.0" },
  { bump: "2.1.0-beta.1", expected: "2.1.0-beta.1" },
] as const;

describe("Version bump grammar", () => {
  it.each(rows)(
    "previews and applies $bump in the second positional",
    async ({ bump, expected }) => {
      const fixture = makeDirectoryFixture();
      try {
        fs.writeFileSync(
          path.join(fixture.invoking, "axm.json"),
          JSON.stringify({ owner: "@acme", agents: [], skills: { review: "workspace" } }),
        );
        writeAuthoredSkill(fixture.invoking, "1.0.0");
        fs.writeFileSync(
          path.join(fixture.invoking, "unrelated.txt"),
          "Preserved authored content.\n",
        );
        const manifestBefore = readManifest(fixture.invoking);
        if (typeof manifestBefore !== "object" || manifestBefore === null)
          throw new Error("Expected the fixture manifest");
        const before = snapshotTree(fixture.invoking);
        const args = ["version", "--json", "--non-interactive", handle, bump];
        const preview = await fixture.run([...args, "--preview"]);
        expect(preview.exitCode, preview.stdout + preview.stderr).toBe(0);
        expect(snapshotTree(fixture.invoking)).toEqual(before);
        const applied = await fixture.run(args);
        expect(applied.exitCode, applied.stdout + applied.stderr).toBe(0);
        expect(readManifest(fixture.invoking)).toEqual({ ...manifestBefore, version: expected });
        const withoutManifest = (snapshot: Readonly<Record<string, string>>) =>
          Object.fromEntries(
            Object.entries(snapshot).filter(([relative]) => relative !== manifestPath),
          );
        expect(withoutManifest(snapshotTree(fixture.invoking))).toEqual(withoutManifest(before));
      } finally {
        fixture.cleanup();
      }
    },
  );

  for (const args of [[], ["set"], ["set", "2.0.0"], ["^1.0.0"], ["latest"], ["patch", "2.0.0"]]) {
    it(`rejects ${JSON.stringify(args)} before reading malformed settings`, async () => {
      const fixture = makeDirectoryFixture();
      try {
        fs.writeFileSync(path.join(fixture.invoking, "axm.json"), "{ malformed settings");
        const before = snapshotTree(fixture.invoking);
        const failure = await fixture.run([
          "version",
          "--json",
          "--non-interactive",
          handle,
          ...args,
        ]);
        expect(failure.exitCode, failure.stdout + failure.stderr).toBe(2);
        const parsed: unknown = JSON.parse(failure.stdout);
        expect(decodeError(parsed)).toMatchObject({ ok: false, code: "usage" });
        expect(snapshotTree(fixture.invoking)).toEqual(before);
      } finally {
        fixture.cleanup();
      }
    });
  }
});
