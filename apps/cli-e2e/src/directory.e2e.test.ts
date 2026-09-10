import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { createTempDir, runCli } from "./e2e/utils.js";

const settingsPath = (root: string): string => path.join(root, "axm.json");

describe("global directory flag", () => {
  it("characterizes the first repeated directory option", async () => {
    const invoking = createTempDir("axm-directory-default-");
    const first = createTempDir("axm-directory-first-");
    const second = createTempDir("axm-directory-second-");
    try {
      const duplicate = await runCli(
        [
          "--directory",
          first.path,
          "-C",
          second.path,
          "setup",
          "--yes",
          "--scope",
          "project",
          "--agent",
          "claude-code",
          "--non-interactive",
        ],
        { cwd: invoking.path },
      );

      expect(duplicate.exitCode, duplicate.stdout + duplicate.stderr).toBe(0);
      expect(fs.existsSync(settingsPath(first.path))).toBe(true);
      expect(fs.existsSync(settingsPath(second.path))).toBe(false);
    } finally {
      invoking.cleanup();
      first.cleanup();
      second.cleanup();
    }
  });

  it("treats an empty directory value as the launch directory", async () => {
    const invoking = createTempDir("axm-directory-empty-");
    try {
      const result = await runCli(
        [
          "--directory=",
          "setup",
          "--yes",
          "--scope",
          "project",
          "--agent",
          "claude-code",
          "--non-interactive",
          "--json",
        ],
        { cwd: invoking.path },
      );

      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      // Temp-dir paths may or may not be symlink-resolved depending on the
      // platform, so compare real paths instead of raw strings.
      expect(
        fs.realpathSync(path.resolve(invoking.path, JSON.parse(result.stdout).result.settingsPath)),
      ).toBe(fs.realpathSync(path.join(invoking.path, "axm.json")));
    } finally {
      invoking.cleanup();
    }
  });
});
