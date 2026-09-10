import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  captureIn,
  foreignGitEnvironment,
  requireForeignGitRoot,
  runIn,
} from "./release-command.js";

const directories: string[] = [];

const makeRepository = (name: string): string => {
  const directory = mkdtempSync(join(tmpdir(), `${name}-`));
  directories.push(directory);
  execFileSync("git", ["init", "--quiet"], { cwd: directory });
  execFileSync("git", ["config", "user.email", "release-command@example.invalid"], {
    cwd: directory,
  });
  execFileSync("git", ["config", "user.name", "Release command test"], { cwd: directory });
  writeFileSync(join(directory, "tracked.txt"), `${name}\n`);
  execFileSync("git", ["add", "."], { cwd: directory });
  execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: directory });
  return directory;
};

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("foreign Git commands", () => {
  it("removes repository-local inherited state and verifies the intended root", () => {
    const outer = makeRepository("axm-release-outer");
    const foreign = makeRepository("axm-release-foreign");
    const outerHead = captureIn(outer, "git", ["rev-parse", "HEAD"]);
    const hostile = {
      ...process.env,
      GIT_DIR: join(outer, ".git"),
      GIT_WORK_TREE: outer,
      GIT_INDEX_FILE: join(outer, ".git", "index"),
    };

    const isolated = foreignGitEnvironment(hostile);
    expect(isolated["GIT_DIR"]).toBeUndefined();
    expect(isolated["GIT_WORK_TREE"]).toBeUndefined();
    requireForeignGitRoot(foreign, foreign, hostile);
    runIn(foreign, "git", ["status", "--short"], isolated);

    expect(captureIn(outer, "git", ["rev-parse", "HEAD"])).toBe(outerHead);
    // Git reports the canonical path, so compare canonical identity: the
    // fixture root comes from `mkdtempSync`, which on macOS hands back a
    // `/var/…` spelling of a `/private/var/…` directory.
    expect(
      realpathSync(captureIn(foreign, "git", ["rev-parse", "--show-toplevel"], isolated)),
    ).toBe(realpathSync(foreign));
  });

  it("accepts an intended root reached through a symbolic link", () => {
    const foreign = makeRepository("axm-release-symlinked");
    const linkRoot = mkdtempSync(join(tmpdir(), "axm-release-link-"));
    directories.push(linkRoot);
    const link = join(linkRoot, "checkout");
    symlinkSync(foreign, link, "dir");

    // The release flow builds this path itself (`join(temporary, "tap")` under
    // a `mkdtempSync` root), so a symlinked temporary directory must not read
    // as a foreign checkout and abort the publication.
    expect(() => {
      requireForeignGitRoot(link, link);
    }).not.toThrow();
  });

  it("rejects an intended root that is not the checkout Git resolves", () => {
    const outer = makeRepository("axm-release-unrelated-outer");
    const foreign = makeRepository("axm-release-unrelated-foreign");

    expect(() => {
      requireForeignGitRoot(foreign, outer);
    }).toThrow(/Foreign Git root mismatch/);
  });
});
