import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { withoutLocalGitEnvironment } from "@agentxm/client-e2e-utils";
import { makeEnvironmentProcessFixture } from "./test-support/environment-process-fixture.js";

it("installs a Git source under an inherited hook environment without modifying the caller repository", async () => {
  const fixture = makeEnvironmentProcessFixture();
  try {
    const environment = withoutLocalGitEnvironment(process.env);
    const git = (cwd: string, ...args: string[]) =>
      execFileSync("git", args, { cwd, env: environment, encoding: "utf8" }).trim();
    const sentinel = path.join(fixture.root, "sentinel");
    const linked = path.join(fixture.root, "linked");
    fs.mkdirSync(sentinel);
    const source = fixture.selected;
    const skill = path.join(source, ".agents/skills/review");
    const payload = "---\nname: review\ndescription: Review changes.\n---\n# Review\n";
    fs.mkdirSync(skill, { recursive: true });
    fs.writeFileSync(path.join(skill, "SKILL.md"), payload);
    for (const directory of [sentinel, source]) {
      git(directory, "init", "--quiet", "--initial-branch=main");
      git(directory, "config", "user.name", "Fixture");
      git(directory, "config", "user.email", "fixture@example.invalid");
      git(directory, "add", ".");
      git(directory, "commit", "--allow-empty", "--quiet", "-m", "Fixture");
    }
    git(sentinel, "worktree", "add", "--detach", linked);
    git(sentinel, "remote", "add", "sentinel", source);
    const refs = git(sentinel, "show-ref");
    const remotes = git(sentinel, "remote", "-v");
    const result = await fixture.run(
      [
        "install",
        "--skill",
        ".agents/skills/review",
        pathToFileURL(source).href,
        "--agent",
        "claude-code",
        "--json",
        "--non-interactive",
      ],
      {
        GIT_DIR: git(linked, "rev-parse", "--absolute-git-dir"),
        GIT_EXEC_PATH: path.join(fixture.root, "caller-helpers"),
        GIT_WORK_TREE: linked,
        GIT_INDEX_FILE: path.join(sentinel, ".git", "index"),
      },
    );
    expect(git(sentinel, "config", "--bool", "core.bare")).toBe("false");
    expect(git(sentinel, "show-ref")).toBe(refs);
    expect(git(sentinel, "remote", "-v")).toBe(remotes);
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(
      fs.readFileSync(path.join(fixture.invoking, ".claude/skills/review/SKILL.md"), "utf8"),
    ).toBe(payload);
  } finally {
    fixture.cleanup();
  }
});
