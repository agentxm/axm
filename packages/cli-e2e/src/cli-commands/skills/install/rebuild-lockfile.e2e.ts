import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";
import { getOutput } from "../../../test-helpers.js";

describe("authoritative lockfile recovery boundary", () => {
  it("creates a new v4 lockfile containing only the requested external resolution", async () => {
    const temp = createTempDir();
    try {
      await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        { cwd: temp.path },
      );
      const lockfilePath = path.join(temp.path, ".axm", "axm-lock.yaml");
      fs.rmSync(lockfilePath, { force: true });

      const result = await runCli(
        ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "another-skill", "--yes"],
        { cwd: temp.path },
      );

      expect(result.exitCode, getOutput(result)).toBe(0);
      const lock = YAML.parse(fs.readFileSync(lockfilePath, "utf8"));
      expect(lock.lockfileVersion).toBe(4);
      expect(Object.keys(lock.skills)).toEqual(["another-skill"]);
      expect(lock.skills["another-skill"]).toMatchObject({ type: "local" });
    } finally {
      temp.cleanup();
    }
  });

  it("blocks mutation when the authoritative lockfile is invalid", async () => {
    const temp = createTempDir();
    try {
      await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        { cwd: temp.path },
      );
      const lockfilePath = path.join(temp.path, ".axm", "axm-lock.yaml");
      const invalidLockfile = "lockfileVersion: [broken\n";
      fs.writeFileSync(lockfilePath, invalidLockfile);

      const result = await runCli(
        ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "another-skill", "--yes"],
        { cwd: temp.path },
      );

      expect(result.exitCode).toBe(6);
      expect(getOutput(result)).toContain("authoritative lockfile is invalid");
      expect(fs.readFileSync(lockfilePath, "utf8")).toBe(invalidLockfile);
      expect(
        fs.existsSync(
          path.join(temp.path, ".axm", "extensions", "external", "skills", "another-skill"),
        ),
      ).toBe(false);
    } finally {
      temp.cleanup();
    }
  });

  it("keeps preview side-effect free while reporting an invalid lockfile blocker", async () => {
    const temp = createTempDir();
    try {
      await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        { cwd: temp.path },
      );
      const lockfilePath = path.join(temp.path, ".axm", "axm-lock.yaml");
      const invalidLockfile = "lockfileVersion: [broken\n";
      fs.writeFileSync(lockfilePath, invalidLockfile);

      const result = await runCli(
        [
          "skills",
          "install",
          SKILLS_REPO_FIXTURE,
          "--skill",
          "another-skill",
          "--preview",
          "--non-interactive",
        ],
        { cwd: temp.path },
      );

      expect(result.exitCode).toBe(6);
      expect(getOutput(result)).toContain("authoritative lockfile is invalid");
      expect(fs.readFileSync(lockfilePath, "utf8")).toBe(invalidLockfile);
    } finally {
      temp.cleanup();
    }
  });
});
