import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { afterEach } from "vitest";

import {
  isolatedGitEnvironment,
  LintResultDocumentSchema,
  runLintCommand,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { installBundledAxmSkill, makeLintSpecWorkspace } from "../../support/lint-harness.js";

export const specification = defineSpecification({
  requirement: "cli/lint/observes-selected-filesystem-view",
  title: "Lint observes only the selected filesystem view",
  statement:
    "When a lint view is selected, lint shall evaluate only that view, reporting the staged content and its fingerprint for git-index and the working tree for workspace with diagnostic paths in the selected workspace, and shall change neither the Git index nor the working tree.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity", "machine-automation"],
  boundary: "process",
  boundaryRationale:
    "Only a real Git index and working tree, driven through the git executable, can hold staged content that differs from the working tree, yield the index fingerprint, and show afterwards that the index, status, and files were left untouched; an in-memory run has no Git index to observe.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const decodeDocument = Schema.decodeUnknownEffect(LintResultDocumentSchema);

const git = (root: string, args: ReadonlyArray<string>): string =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    env: isolatedGitEnvironment(),
  });

const initializeGit = (root: string): void => {
  git(root, ["init", "--quiet", "--initial-branch=main"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
};

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
    {
      ...settings,
      skills: { ...skills, demo: "@acme/skills/demo" },
    },
    null,
    2,
  )}\n`;
};

describe("Selected lint filesystem view", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("distinguishes the exact Git index from the working tree without changing either", () =>
    Effect.gen(function* () {
      const workspace = makeLintSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      yield* installBundledAxmSkill.pipe(Effect.provide(workspace.layer));
      initializeGit(workspace.root);
      git(workspace.root, ["add", "."]);
      git(workspace.root, ["commit", "--quiet", "-m", "fixture"]);

      const settingsPath = path.join(workspace.root, "axm.json");
      const validSettings = fs.readFileSync(settingsPath, "utf8");
      fs.writeFileSync(settingsPath, addDeclaredSkill(validSettings));
      git(workspace.root, ["add", "axm.json"]);
      fs.writeFileSync(settingsPath, validSettings);

      const statusBefore = git(workspace.root, ["status", "--porcelain=v2", "-z"]);
      const indexBefore = git(workspace.root, ["ls-files", "--stage", "-z"]);

      const stagedExit = yield* runLintCommand({
        path: Option.some(workspace.root),
        scope: "project",
        strict: false,
        details: false,
        fix: false,
        view: "git-index",
      }).pipe(Effect.provide(workspace.layer), Effect.exit);
      expect(Exit.isFailure(stagedExit)).toBe(true);
      const stagedEntry = workspace.rendererState.results.at(-1);
      expect(stagedEntry?.ok).toBe(false);
      const stagedDocument = yield* decodeDocument(stagedEntry?.data);
      const stagedInput = stagedDocument.result.input;
      expect(stagedInput.view).toBe("git-index");
      if (stagedInput.view !== "git-index") {
        return yield* Effect.die(new Error("Expected a Git-index lint result"));
      }
      expect(stagedInput.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
      const stagedFinding = stagedDocument.result.findings.find(
        ({ ruleId }) => ruleId === "workspace/configured-but-not-installed",
      );
      if (stagedFinding === undefined) throw new Error("Expected the staged missing-Skill finding");
      expect(stagedFinding).toMatchObject({
        authority: "axm.json",
        location: { file: "axm.json" },
      });
      // The screen may display workspace-relative paths; every displayed location
      // must still resolve to the original workspace, never its temporary index copy.
      const displayedRoot = path.resolve(workspace.root, stagedFinding.displayRoot);
      expect(displayedRoot).toBe(workspace.root);
      expect(path.resolve(displayedRoot, stagedFinding.path)).toBe(settingsPath);
      expect(path.resolve(displayedRoot, stagedFinding.subject)).toBe(settingsPath);
      expect(fs.existsSync(settingsPath)).toBe(true);

      const liveExit = yield* runLintCommand({
        path: Option.some(workspace.root),
        scope: "project",
        strict: false,
        details: false,
        fix: false,
        view: "workspace",
      }).pipe(Effect.provide(workspace.layer), Effect.exit);
      expect(Exit.isSuccess(liveExit)).toBe(true);
      const liveEntry = workspace.rendererState.results.at(-1);
      expect(liveEntry?.ok).toBe(true);
      const liveDocument = yield* decodeDocument(liveEntry?.data);
      expect(liveDocument.result.input).toEqual({ view: "workspace" });
      expect(liveDocument.result.findings).toEqual([]);

      expect(git(workspace.root, ["status", "--porcelain=v2", "-z"])).toBe(statusBefore);
      expect(git(workspace.root, ["ls-files", "--stage", "-z"])).toBe(indexBefore);
      expect(fs.readFileSync(settingsPath, "utf8")).toBe(validSettings);
    }),
  );
});
