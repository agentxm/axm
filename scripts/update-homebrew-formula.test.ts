import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { EXPECTED_BINARY_ASSETS, generateReleaseChecksums } from "./release-checksums.js";

const temporaryDirectories: Array<string> = [];

const git = (cwd: string, args: ReadonlyArray<string>, env: NodeJS.ProcessEnv): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8", env });

const isolatedGitEnvironment = (): NodeJS.ProcessEnv => {
  const directory = mkdtempSync(join(tmpdir(), "axm-homebrew-git-config-"));
  temporaryDirectories.push(directory);
  const globalConfig = join(directory, "global.gitconfig");
  writeFileSync(globalConfig, "", "utf8");

  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of Object.keys(env)) {
    if (name.startsWith("GIT_")) delete env[name];
  }
  env["GIT_CONFIG_GLOBAL"] = globalConfig;
  env["GIT_CONFIG_NOSYSTEM"] = "1";
  env["GIT_TERMINAL_PROMPT"] = "0";
  return env;
};

const formula = `class Axm < Formula
  version "0.0.0"
  url "https://example.test/axm-darwin-arm64"
  sha256 "old"
  url "https://example.test/axm-darwin-x64"
  sha256 "old"
  url "https://example.test/axm-linux-arm64"
  sha256 "old"
  url "https://example.test/axm-linux-x64"
  sha256 "old"
end
`;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const makeTap = () => {
  const root = mkdtempSync(join(tmpdir(), "axm-homebrew-formula-"));
  temporaryDirectories.push(root);
  const remote = join(root, "remote.git");
  const tap = join(root, "homebrew-tap");
  const assets = join(root, "release-assets");
  const env = isolatedGitEnvironment();

  git(root, ["init", "--bare", "--quiet", "--initial-branch=main", remote], env);
  git(root, ["clone", "--quiet", remote, tap], env);
  mkdirSync(join(tap, "Formula"), { recursive: true });
  writeFileSync(join(tap, "Formula", "axm.rb"), formula, "utf8");
  git(tap, ["add", "Formula/axm.rb"], env);
  git(
    tap,
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "--quiet",
      "-m",
      "fixture",
    ],
    env,
  );
  git(tap, ["push", "--quiet", "--set-upstream", "origin", "main"], env);

  mkdirSync(assets, { recursive: true });
  for (const name of EXPECTED_BINARY_ASSETS) {
    writeFileSync(join(assets, name), `contents:${name}`, "utf8");
  }
  generateReleaseChecksums(assets);

  const publish = (version = "1.2.3") =>
    spawnSync("bun", [resolve("scripts/update-homebrew-formula.ts"), version], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...env, GITHUB_REPO: "example/axm", HOMEBREW_TAP_DIR: tap, RELEASE_ASSET_DIR: assets },
    });
  return { root, tap, remote, assets, env, publish };
};

describe("Homebrew formula update", () => {
  it("uses a command-scoped fallback identity without changing the tap config", () => {
    const { tap, env, publish } = makeTap();
    const publication = publish();
    expect(publication.status, publication.stderr).toBe(0);
    const localName = spawnSync("git", ["config", "--local", "--get", "user.name"], {
      cwd: tap,
      encoding: "utf8",
      env,
    });
    const localEmail = spawnSync("git", ["config", "--local", "--get", "user.email"], {
      cwd: tap,
      encoding: "utf8",
      env,
    });

    expect(localName.status).toBe(1);
    expect(localEmail.status).toBe(1);
    expect(git(tap, ["log", "-1", "--format=%an <%ae>|%cn <%ce>"], env).trim()).toBe(
      "github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>|github-actions[bot] <41898282+github-actions[bot]@users.noreply.github.com>",
    );
  });
});

describe("Homebrew rerun and concurrency", () => {
  it("reuses the exact formula without another commit and rejects changed same-version bytes", () => {
    const { tap, remote, assets, env, publish } = makeTap();
    expect(publish().status).toBe(0);
    const commit = git(tap, ["rev-parse", "HEAD"], env).trim();
    expect(publish().status).toBe(0);
    expect(git(tap, ["rev-parse", "HEAD"], env).trim()).toBe(commit);
    writeFileSync(join(assets, "axm-darwin-arm64"), "conflicting bytes");
    generateReleaseChecksums(assets);
    const conflict = publish();
    expect(conflict.status).not.toBe(0);
    expect(conflict.stderr).toContain("integrity conflict");
    expect(git(remote, ["rev-parse", "main"], env).trim()).toBe(commit);
  });
  it("stops an older rerun without moving the formula backward", () => {
    const { tap, publish } = makeTap();
    expect(publish("1.3.0").status).toBe(0);
    const before = readFileSync(join(tap, "Formula/axm.rb"), "utf8");
    const older = publish();
    expect(older.status).not.toBe(0);
    expect(older.stderr).toContain("Superseded candidate");
    expect(readFileSync(join(tap, "Formula/axm.rb"), "utf8")).toBe(before);
  });
  it("fails one rejected tap push without retrying or replacing concurrent remote state", () => {
    const { root, tap, remote, env, publish } = makeTap();
    const base = git(tap, ["rev-parse", "HEAD"], env).trim();
    const tree = git(tap, ["rev-parse", "HEAD^{tree}"], env).trim();
    const concurrent = git(
      remote,
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "commit-tree",
        tree,
        "-p",
        base,
        "-m",
        "Concurrent tap change",
      ],
      env,
    ).trim();
    const hooks = join(tap, ".git/hooks");
    const log = join(root, "push-attempts");
    writeFileSync(
      join(hooks, "pre-push"),
      '#!/bin/sh\nprintf "attempt\\n" >> "$TAP_PUSH_LOG"\ngit --git-dir="$TAP_REMOTE" update-ref refs/heads/main "$TAP_CONCURRENT"\n',
      { mode: 0o755 },
    );
    env["TAP_PUSH_LOG"] = log;
    env["TAP_REMOTE"] = remote;
    env["TAP_CONCURRENT"] = concurrent;
    const result = publish();
    expect(result.status).not.toBe(0);
    expect(git(remote, ["rev-parse", "main"], env).trim()).toBe(concurrent);
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(["attempt"]);
  });
});
