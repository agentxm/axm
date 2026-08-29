import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

describe("Homebrew formula update", () => {
  it("uses a command-scoped fallback identity without changing the tap config", () => {
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

    execFileSync("bash", [resolve("scripts/update-homebrew-formula.sh"), "1.2.3"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...env,
        GITHUB_REPO: "example/axm",
        HOMEBREW_TAP_DIR: tap,
        RELEASE_ASSET_DIR: assets,
      },
    });

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
