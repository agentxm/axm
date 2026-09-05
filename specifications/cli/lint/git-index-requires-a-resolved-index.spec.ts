import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { isolatedGitEnvironment } from "axm.sh/specification-harness";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeDirectoryFixture } from "../../support/directory-harness.js";
import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/lint/git-index-requires-a-resolved-index",
  title: "Git-index lint requires a repository with no unresolved index entries",
  statement:
    "When lint selects the Git index outside a Git repository or while its index contains unresolved merge entries, AXM shall report why that view cannot be evaluated without changing the index or working tree.",
  class: "constraint",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "Real Git repositories supply unresolved index stages, and the built CLI exposes the refusal and selected-view explanation while real index and file observations establish preservation.",
  methods: ["example"],
  derivedFrom: [
    "cli/lint/observes-selected-filesystem-view",
    "packages/workspace-lint/src/run/staged-workspace.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const git = (root: string, args: ReadonlyArray<string>): string =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", env: isolatedGitEnvironment() });

const workingTree = (root: string) =>
  Object.fromEntries(
    Object.entries(snapshotWorkspaceContent(root)).filter(
      ([name]) => name !== ".git" && !name.startsWith(".git/"),
    ),
  );

const lintIndex = [
  "lint",
  "--view",
  "git-index",
  "--scope",
  "project",
  "--non-interactive",
  "--json",
];

describe("Git-index lint admissibility", () => {
  it("explains that a Git repository is required without creating workspace or index state", async () => {
    const fixture = makeDirectoryFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.selected, "keep.txt"),
        "Untracked content remains intact\n",
      );
      const before = snapshotWorkspaceContent(fixture.selected);

      const result = await fixture.run(["-C", fixture.selected, ...lintIndex]);

      expect(result.exitCode, result.stdout + result.stderr).toBe(9);
      const document: unknown = JSON.parse(result.stdout);
      expect(document).toMatchObject({
        ok: false,
        code: "validation",
        title: "Git index unavailable",
        detail: expect.stringContaining("requires a Git repository"),
      });
      expect(snapshotWorkspaceContent(fixture.selected)).toEqual(before);
    } finally {
      fixture.cleanup();
    }
  });

  it("explains that merge entries must be resolved while preserving every stage and working file", async () => {
    const fixture = makeDirectoryFixture();
    try {
      const root = fixture.selected;
      const target = path.join(root, "conflict.txt");
      git(root, ["init", "--quiet", "--initial-branch=main"]);
      git(root, ["config", "user.email", "test@example.com"]);
      git(root, ["config", "user.name", "Test"]);
      fs.writeFileSync(target, "base\n");
      git(root, ["add", "."]);
      git(root, ["commit", "--quiet", "-m", "base"]);
      git(root, ["checkout", "-q", "-b", "other"]);
      fs.writeFileSync(target, "other\n");
      git(root, ["commit", "--quiet", "-a", "-m", "other"]);
      git(root, ["checkout", "-q", "main"]);
      fs.writeFileSync(target, "main\n");
      git(root, ["commit", "--quiet", "-a", "-m", "main"]);
      expect(() => git(root, ["merge", "other"])).toThrow();
      const statusBefore = git(root, ["status", "--porcelain=v2", "-z"]);
      const stagesBefore = git(root, ["ls-files", "--stage", "-z"]);
      expect(git(root, ["ls-files", "--unmerged", "-z"])).not.toBe("");
      const filesBefore = workingTree(root);

      const result = await fixture.run(["-C", root, ...lintIndex]);

      expect(result.exitCode, result.stdout + result.stderr).toBe(9);
      const document: unknown = JSON.parse(result.stdout);
      expect(document).toMatchObject({
        ok: false,
        code: "validation",
        detail: expect.stringContaining("unmerged entries"),
      });
      expect(document).toMatchObject({ detail: expect.stringContaining("--view git-index") });
      expect(workingTree(root)).toEqual(filesBefore);
      expect(git(root, ["status", "--porcelain=v2", "-z"])).toBe(statusBefore);
      expect(git(root, ["ls-files", "--stage", "-z"])).toBe(stagesBefore);
    } finally {
      fixture.cleanup();
    }
  });
});
