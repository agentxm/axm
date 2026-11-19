import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { createTempDir, withoutLocalGitEnvironment } from "@agentxm/client-e2e-utils";
import { defineSpecification } from "@agentxm/specification-metadata";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { resolveHostBinaryPath } from "./distribution-targets.js";

export const specification = defineSpecification({
  requirement: "cli/help/git-hook-workflows",
  title:
    "Git hook guidance connects branch changes and staged commits to the appropriate AXM check",
  statement:
    "Project users shall be able to discover and use bundled Git hook recipes to check the staged commit and check or reconcile the current checkout after branch changes, preserving local edits and surfacing planning failures separately from actionable drift.",
  class: "human-factors",
  role: "experience",
  goals: ["knowledge-access", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "Git runs hooks extracted from the compiled CLI help in a disposable two-branch project. The index, workspace lock, visible instructions, diagnostics, and exit status expose the effects.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: ["Git and a POSIX shell are available to the consumer."],
  openQuestions: [],
});

function shellExample(topic: string, after: string) {
  const start = topic.indexOf(after);
  const block = start < 0 ? undefined : topic.slice(start).match(/```sh\n([\s\S]*?)\n```/u)?.[1];
  if (!block) throw new Error("Missing shell example following " + after);
  return block + "\n";
}

function makeProject() {
  const temp = createTempDir("axm-hook-guidance-");
  const root = fs.realpathSync(temp.path);
  const cwd = path.join(root, "checkout");
  const home = path.join(root, "home");
  const bin = path.join(root, "bin");
  for (const dir of [cwd, home, bin]) fs.mkdirSync(dir);
  const binary = resolveHostBinaryPath();
  fs.symlinkSync(binary, path.join(bin, "axm"));
  const env = {
    ...withoutLocalGitEnvironment(process.env),
    HOME: home,
    AXM_USER_HOME: home,
    AXM_NO_UPDATE_CHECK: "1",
    AXM_TELEMETRY: "0",
    GIT_CONFIG_GLOBAL: path.join(home, ".gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    PATH: bin + path.delimiter + process.env["PATH"],
  };
  function run(program: string, args: string[], expected = 0) {
    const result = spawnSync(program, args, { cwd, env, encoding: "utf8" });
    if (result.error) throw result.error;
    const output = result.stdout + result.stderr;
    expect(result.status, [program, ...args].join(" ") + "\n" + output).toBe(expected);
    return output;
  }
  const git = (...args: string[]) => run("git", args);
  const read = (file: string) => fs.readFileSync(path.join(cwd, file), "utf8");
  function write(file: string, body: string) {
    const target = path.join(cwd, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  }
  const topic = run(binary, ["help", "git-hooks"]);
  function installHook(name: string, body: string) {
    const file = ".githooks/" + name;
    write(file, "#!/bin/sh\n" + body);
    fs.chmodSync(path.join(cwd, file), 0o755);
  }
  function afterGit(name: string, mode = "check") {
    installHook(
      name,
      shellExample(topic, "In `" + name + "`").replace("after-git check", "after-git " + mode),
    );
  }

  git("init", "--quiet", "--initial-branch=base");
  git("config", "user.email", "author@example.invalid");
  git("config", "user.name", "Author");
  git("config", "core.hooksPath", ".githooks");
  write(
    "axm.json",
    JSON.stringify({
      owner: "@fixture",
      agents: ["codex", "claude-code"],
      instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: true },
      rules: { team: "workspace" },
    }),
  );
  write(
    "rules/team/rule.json",
    JSON.stringify({
      type: "rule",
      owner: "@fixture",
      name: "team",
      version: "1.0.0",
      title: "Team",
      description: "Team convention",
    }),
  );
  const rule = "rules/team/src/RULE.md";
  write(rule, "Follow convention A.\n");
  write("notes", "starting notes\n");
  run(binary, ["sync", "--non-interactive"]);
  write("scripts/axm-after-git", shellExample(topic, "Keep one script"));
  git("add", ".gitignore", "axm.json", "axm.lock", "AGENTS.md", "rules", "notes", "scripts");
  git("commit", "--quiet", "-m", "Declare convention A");
  git("switch", "-qc", "incoming");
  write(rule, "Follow convention B.\n");
  git("commit", "--quiet", "-am", "Change the rule source to B");
  git("switch", "-q", "base");

  return { git, run, read, write, afterGit, installHook, topic, rule, cleanup: temp.cleanup };
}

describe("Recipes shipped in axm help git-hooks", () => {
  let project: ReturnType<typeof makeProject>;
  beforeEach(() => {
    project = makeProject();
  });
  afterEach(() => project?.cleanup());

  it.effect(
    "a fresh worktree can bootstrap its ignored alias while CI still sees a repaired tracked rule",
    () =>
      Effect.sync(() => {
        const { git, run, read } = project;
        git("worktree", "add", "../linked", "incoming");
        run("axm", ["-C", "../linked", "sync", "--preview", "--fail-on-change"], 1);
        run("axm", ["-C", "../linked", "sync", "--non-interactive"]);
        run("axm", ["-C", "../linked", "sync", "--preview", "--fail-on-change"]);
        expect(read("../linked/CLAUDE.md")).toContain("Follow convention B.");
        expect(git("-C", "../linked", "status", "--porcelain", "--", "AGENTS.md")).toContain(
          " M AGENTS.md",
        );
        expect(read("AGENTS.md")).toContain("Follow convention A.");
      }),
  );

  it.effect(
    "switching branches advises, optionally reconciles in either direction, and leaves a converged checkout alone",
    () =>
      Effect.sync(() => {
        const { git, read, afterGit } = project;
        const originalLock = read("axm.lock");
        const originalInstructions = read("AGENTS.md");
        afterGit("post-checkout");
        expect(git("switch", "incoming")).toContain("run axm sync to apply");
        expect(read("axm.lock")).toBe(originalLock);
        expect(read("AGENTS.md")).toBe(originalInstructions);
        expect(git("checkout", "--", "notes")).not.toContain("run axm sync to apply");
        expect(git("diff", "--cached", "--name-only")).toBe("");

        afterGit("post-checkout", "apply");
        git("switch", "incoming");
        expect(read("AGENTS.md")).toContain("Follow convention B.");
        const convergedLock = read("axm.lock");
        afterGit("post-checkout");
        expect(git("switch", "incoming")).not.toContain("run axm sync to apply");
        expect(read("axm.lock")).toBe(convergedLock);
        afterGit("post-checkout", "apply");
        git("switch", "base");
        expect(read("AGENTS.md")).toBe(originalInstructions);
        expect(read("axm.lock")).toBe(originalLock);
        expect(git("diff", "--cached", "--name-only")).toBe("");
      }),
  );

  it.effect(
    "a merge-based pull updates the visible rule and preserves unrelated worktree edits",
    () =>
      Effect.sync(() => {
        const { git, write, read, afterGit } = project;
        afterGit("post-merge", "apply");
        write("notes", "work in progress\n");
        git("pull", "--no-rebase", ".", "incoming");
        expect(read("AGENTS.md")).toContain("Follow convention B.");
        expect(read("notes")).toBe("work in progress\n");
        expect(git("diff", "--cached", "--name-only")).toBe("");
      }),
  );

  it.effect("a completed rebase reconciles the rule while an amend skips reconciliation", () =>
    Effect.sync(() => {
      const { git, write, read, afterGit } = project;
      afterGit("post-rewrite", "apply");
      write("notes", "topic notes\n");
      git("commit", "-am", "Topic work");
      git("rebase", "incoming");
      expect(read("AGENTS.md")).toContain("Follow convention B.");
      write(project.rule, "Uncommitted convention.\n");
      git("commit", "--amend", "--no-edit");
      expect(read("AGENTS.md")).toContain("Follow convention B.");
    }),
  );

  it.effect(
    "a merge conflict leaves resolution to the author and the manual check works after recovery",
    () =>
      Effect.sync(() => {
        const { git, run, write, read, afterGit, rule } = project;
        afterGit("post-merge", "apply");
        write(rule, "Local convention.\n");
        git("commit", "-am", "Conflicting rule change");
        run("git", ["merge", "incoming"], 1);
        expect(read("AGENTS.md")).toContain("Follow convention A.");
        expect(git("ls-files", "--unmerged")).toContain(rule);
        write(rule, "Agreed convention.\n");
        git("add", rule);
        git("commit", "--no-edit");
        expect(run("sh", ["scripts/axm-after-git", "check"])).toContain("run axm sync to apply");
        run("sh", ["scripts/axm-after-git", "apply"]);
        expect(read("AGENTS.md")).toContain("Agreed convention.");
      }),
  );

  it.effect(
    "a blocked plan reports the AXM failure after the switch and preserves the malformed input",
    () =>
      Effect.sync(() => {
        const { git, run, write, read, afterGit } = project;
        afterGit("post-checkout");
        write("axm.json", "{broken");
        const lock = read("axm.lock");
        const result = run("git", ["switch", "incoming"], 1);
        expect(result).toContain("Resolve the AXM diagnostic");
        expect(result).not.toContain("run axm sync to apply");
        expect(git("branch", "--show-current").trim()).toBe("incoming");
        expect(read("axm.json")).toBe("{broken");
        expect(read("axm.lock")).toBe(lock);
      }),
  );

  it.effect("pre-commit validates staged bytes and leaves the user's unstaged edit intact", () =>
    Effect.sync(() => {
      const { git, run, read, write, installHook, topic } = project;
      installHook("pre-commit", shellExample(topic, "## Raw Git hook"));
      write("notes", "staged notes\n");
      const stagedSettings = read("axm.json") + "\n";
      write("axm.json", stagedSettings);
      git("add", "notes", "axm.json");
      write("notes", "unstaged notes\n");
      write("axm.json", "{broken");
      git("commit", "-m", "Commit only the staged content");
      expect(git("show", "HEAD:axm.json")).toBe(stagedSettings);
      expect(git("show", "HEAD:notes")).toBe("staged notes\n");
      expect(read("notes")).toBe("unstaged notes\n");
      git("add", "axm.json");
      run("git", ["commit", "-m", "Malformed staged settings"], 1);
      expect(git("show", ":axm.json")).toBe("{broken");
    }),
  );
});
