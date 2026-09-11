// Raw node:fs/node:path and Git subprocesses are the repository convention for
// constructing mutable integration fixtures around Effect filesystem code.
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { LintStagingFailed } from "./errors.js";
import { admitLintRequest } from "./lint-workspace.js";
import { isolatedGitEnvironment } from "./staged-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/lint/git-index-requires-a-resolved-index",
  title: "Git-index lint requires a resolved project index",
  statement:
    "When lint selects the Git index outside a Git repository, while its index contains unresolved merge entries, with --scope user, or together with --fix, AXM shall refuse the request explaining why that view cannot be evaluated, without changing the index or the working tree.",
  class: "constraint",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "Only a real Git repository driven through the git executable can hold an unmerged index stage, so the refusals and the untouched index and working tree are established against real repositories; the built CLI adjudicates nothing this rule decides.",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "cli/lint/observes-selected-filesystem-view",
    "packages/core/workspace-lint/src/run/staged-workspace.test.ts",
    "apps/cli/help/topics/git-hooks.md",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const git = (root: string, args: ReadonlyArray<string>): string =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", env: isolatedGitEnvironment() });

/** Every entry under a root, so an untouched working tree can be shown. */
const workingTree = (root: string): ReadonlyArray<readonly [string, string]> => {
  const entries: Array<readonly [string, string]> = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = nodePath.join(directory, entry.name);
      const relative = nodePath.relative(root, absolute);
      if (relative === ".git" || relative.startsWith(`.git${nodePath.sep}`)) continue;
      if (entry.isSymbolicLink()) {
        entries.push([relative, `symlink:${fs.readlinkSync(absolute)}`]);
        continue;
      }
      if (entry.isDirectory()) {
        entries.push([relative, "directory"]);
        walk(absolute);
        continue;
      }
      entries.push([relative, fs.readFileSync(absolute, "utf8")]);
    }
  };
  walk(root);
  return entries.sort((left, right) => left[0].localeCompare(right[0]));
};

const admitGitIndex = (args: {
  readonly path: string;
  readonly userHome: string;
  readonly scope?: "project" | "user";
  readonly fix?: boolean;
}) =>
  admitLintRequest({
    path: args.path,
    scope: args.scope ?? "project",
    view: "git-index",
    fix: args.fix ?? false,
    cwd: args.path,
    userHome: args.userHome,
  }).pipe(Effect.scoped, Effect.flip, Effect.provide(NodeServices.layer));

describe("Git-index lint admissibility", () => {
  const cleanups: Array<() => void> = [];
  const makeDirectory = (prefix: string): string => {
    const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), prefix)));
    cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));
    return root;
  };
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("explains that a Git repository is required without creating workspace state", () => {
    const root = makeDirectory("axm-lint-no-repository-");
    fs.writeFileSync(nodePath.join(root, "keep.txt"), "Untracked content remains intact\n");
    const before = workingTree(root);

    return Effect.gen(function* () {
      const failure = yield* admitGitIndex({ path: root, userHome: root });

      expect(failure).toBeInstanceOf(LintStagingFailed);
      expect(failure.category).toBe("validation");
      expect(failure.title).toBe("Git index unavailable");
      expect(failure.detail).toContain("requires a Git repository");
      expect(workingTree(root)).toEqual(before);
    });
  });

  it.effect(
    "explains that merge entries must be resolved while preserving every stage and working file",
    () => {
      const root = makeDirectory("axm-lint-unmerged-");
      const target = nodePath.join(root, "conflict.txt");
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

      return Effect.gen(function* () {
        const failure = yield* admitGitIndex({ path: root, userHome: root });

        expect(failure).toBeInstanceOf(LintStagingFailed);
        expect(failure.detail).toContain("unmerged entries");
        expect(failure.detail).toContain("--view git-index");
        expect(workingTree(root)).toEqual(filesBefore);
        expect(git(root, ["status", "--porcelain=v2", "-z"])).toBe(statusBefore);
        expect(git(root, ["ls-files", "--stage", "-z"])).toBe(stagesBefore);
      });
    },
  );

  it.effect(
    "refuses user scope for an otherwise resolved Git index without changing anything",
    () => {
      const root = makeDirectory("axm-lint-user-scope-");
      const home = makeDirectory("axm-lint-user-home-");
      git(root, ["init", "--quiet", "--initial-branch=main"]);
      fs.writeFileSync(nodePath.join(root, "keep.txt"), "Selected project content\n");
      git(root, ["add", "keep.txt"]);
      expect(git(root, ["ls-files", "--unmerged", "-z"])).toBe("");
      const indexBefore = git(root, ["ls-files", "--stage", "-z"]);
      expect(indexBefore).toContain("keep.txt");
      const statusBefore = git(root, ["status", "--porcelain=v2", "-z"]);
      const before = workingTree(root);
      const beforeHome = workingTree(home);

      return Effect.gen(function* () {
        const failure = yield* admitGitIndex({ path: root, userHome: home, scope: "user" });

        expect(failure).toBeInstanceOf(LintStagingFailed);
        expect(failure.category).toBe("validation");
        expect(failure.detail).toContain("--scope user");
        expect(failure.detail).toContain("--view git-index");
        expect(workingTree(root)).toEqual(before);
        expect(workingTree(home)).toEqual(beforeHome);
        expect(git(root, ["ls-files", "--stage", "-z"])).toBe(indexBefore);
        expect(git(root, ["status", "--porcelain=v2", "-z"])).toBe(statusBefore);
      });
    },
  );

  // The index is a snapshot of something other than the working tree, so a
  // repair of the working tree could never be the repair the report describes.
  it.effect("refuses to repair a working tree while reporting on the Git index", () => {
    const root = makeDirectory("axm-lint-fix-index-");
    git(root, ["init", "--quiet", "--initial-branch=main"]);
    fs.writeFileSync(nodePath.join(root, "keep.txt"), "Selected project content\n");
    git(root, ["add", "keep.txt"]);
    const indexBefore = git(root, ["ls-files", "--stage", "-z"]);
    const before = workingTree(root);

    return Effect.gen(function* () {
      const failure = yield* admitGitIndex({ path: root, userHome: root, fix: true });

      expect(failure).toBeInstanceOf(LintStagingFailed);
      expect(failure.category).toBe("validation");
      expect(failure.detail).toContain("--fix");
      expect(failure.detail).toContain("--view git-index");
      expect(workingTree(root)).toEqual(before);
      expect(git(root, ["ls-files", "--stage", "-z"])).toBe(indexBefore);
    });
  });
});
