// Raw node:fs/node:path and Git subprocesses are the repository convention for
// constructing mutable integration fixtures around Effect filesystem code.
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { NoProjectionParticipants } from "@agentxm/workspace-projection/testing";
import { defineSpecification } from "@agentxm/specification-metadata";

import { OfflineHttpClient } from "../test-helpers.js";
import { lintWorkspaceServices, makeOfficialAxmSkillWorkspace } from "../testing.js";
import { admitLintRequest, lintSelectionRoot, queryLintWorkspace } from "./lint-workspace.js";
import { isolatedGitEnvironment } from "./staged-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/lint/observes-selected-filesystem-view",
  title: "Lint observes only the selected filesystem view",
  statement:
    "When lint runs without --fix, it shall evaluate only the selected view — the staged content and its index fingerprint for git-index, the working tree for workspace — report diagnostic locations against the selected workspace rather than any snapshot of it, and leave the Git index unchanged.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity", "machine-automation"],
  boundary: "process",
  boundaryRationale:
    "Only a real Git index, driven through the git executable, can hold staged content that differs from the working tree, yield the index fingerprint, and show afterwards that the index and status were left untouched; an in-memory run has no Git index to observe.",
  methods: ["example"],
  derivedFrom: ["cli/lint/reports-facts-without-mutation"],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "How should an explicit lint path select a nested workspace inside a Git index, and how should user scope combine with a supplied path? Current root-selection precedence remains an implementation observation.",
  ],
});

const git = (root: string, args: ReadonlyArray<string>): string =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", env: isolatedGitEnvironment() });

const initializeGit = (root: string): void => {
  git(root, ["init", "--quiet", "--initial-branch=main"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
};

/** Declare one more Skill than the workspace has installed. */
const addDeclaredSkill = (settingsText: string): string => {
  const settings: unknown = JSON.parse(settingsText);
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
    throw new Error("Expected object-valued workspace settings");
  }
  const configuredSkills = "skills" in settings ? settings.skills : undefined;
  const skills =
    typeof configuredSkills === "object" &&
    configuredSkills !== null &&
    !Array.isArray(configuredSkills)
      ? configuredSkills
      : {};
  return `${JSON.stringify(
    { ...settings, skills: { ...skills, demo: "@acme/skills/demo" } },
    null,
    2,
  )}\n`;
};

describe("Selected lint filesystem view", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("distinguishes the exact Git index from the working tree without changing it", () => {
    const workspace = makeOfficialAxmSkillWorkspace("official-compatible");
    cleanups.push(workspace.cleanup);
    initializeGit(workspace.root);
    git(workspace.root, ["add", "."]);
    git(workspace.root, ["commit", "--quiet", "-m", "fixture"]);

    const settingsPath = nodePath.join(workspace.root, "axm.json");
    const validSettings = fs.readFileSync(settingsPath, "utf8");
    fs.writeFileSync(settingsPath, addDeclaredSkill(validSettings));
    git(workspace.root, ["add", "axm.json"]);
    fs.writeFileSync(settingsPath, validSettings);

    const statusBefore = git(workspace.root, ["status", "--porcelain=v2", "-z"]);
    const indexBefore = git(workspace.root, ["ls-files", "--stage", "-z"]);

    const lint = (view: "workspace" | "git-index") =>
      Effect.gen(function* () {
        const selection = yield* admitLintRequest({
          path: workspace.root,
          scope: "project",
          view,
          fix: false,
          cwd: workspace.root,
          userHome: workspace.root,
        });
        const result = yield* queryLintWorkspace(selection, { strict: false }).pipe(
          Effect.provide(
            lintWorkspaceServices({
              workspaceRoot: lintSelectionRoot(selection),
              cliVersion: workspace.cliVersion,
            }),
          ),
        );
        return result;
      }).pipe(Effect.scoped);

    return Effect.gen(function* () {
      const staged = yield* lint("git-index");

      expect(staged.outcome).toBe("fail");
      const stagedInput = staged.document.input;
      expect(stagedInput.view).toBe("git-index");
      if (stagedInput.view !== "git-index") {
        return yield* Effect.die(new Error("Expected a Git-index lint result"));
      }
      expect(stagedInput.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
      const stagedFinding = staged.document.findings.find(
        ({ ruleId }) => ruleId === "workspace/configured-but-not-installed",
      );
      if (stagedFinding === undefined) throw new Error("Expected the staged missing-Skill finding");
      expect(stagedFinding).toMatchObject({
        authority: "axm.json",
        location: { file: "axm.json" },
      });
      // Displayed locations are workspace-relative; every one must resolve to
      // the selected workspace, never to its temporary index copy.
      const displayedRoot = nodePath.resolve(workspace.root, stagedFinding.displayRoot);
      expect(displayedRoot).toBe(workspace.root);
      expect(nodePath.resolve(displayedRoot, stagedFinding.path)).toBe(settingsPath);
      expect(nodePath.resolve(displayedRoot, stagedFinding.subject)).toBe(settingsPath);
      expect(fs.existsSync(settingsPath)).toBe(true);

      const live = yield* lint("workspace");

      expect(live.outcome).toBe("success");
      expect(live.document.input).toEqual({ view: "workspace" });
      expect(live.document.findings).toEqual([]);

      expect(git(workspace.root, ["ls-files", "--stage", "-z"])).toBe(indexBefore);
      expect(git(workspace.root, ["status", "--porcelain=v2", "-z"])).toBe(statusBefore);
      expect(fs.readFileSync(settingsPath, "utf8")).toBe(validSettings);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(NodeServices.layer, OfflineHttpClient, NoProjectionParticipants),
      ),
    );
  });
});
