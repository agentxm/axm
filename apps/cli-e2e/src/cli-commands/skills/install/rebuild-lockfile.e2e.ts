import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseToml } from "smol-toml";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";
import { getOutput } from "../../../test-helpers.js";
import { LOCKFILE_VERSION, boundPackage, parseLockfile } from "../../../test-support/lockfile.js";

describe("authoritative lockfile recovery boundary", () => {
  it("recreates a current-version lockfile whose accepted resolutions are only the requested one", async () => {
    const temp = createTempDir();
    try {
      await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        { cwd: temp.path },
      );
      const lockfilePath = path.join(temp.path, "axm.lock");
      fs.rmSync(lockfilePath, { force: true });

      const result = await runCli(
        ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "another-skill"],
        { cwd: temp.path },
      );

      expect(result.exitCode, getOutput(result)).toBe(0);
      const text = fs.readFileSync(lockfilePath, "utf8");
      const lock = parseLockfile(text);
      expect(lock.version).toBe(LOCKFILE_VERSION);
      // Projection currency rows may be re-recorded beside the resolutions;
      // they are not accepted resolutions.
      const populatedResolutionSections = Object.entries(parseToml(text))
        .filter(
          ([key, value]) =>
            key !== "version" &&
            key !== "projections" &&
            typeof value === "object" &&
            value !== null &&
            Object.keys(value).length > 0,
        )
        .map(([key]) => key)
        .sort();
      expect(populatedResolutionSections).toEqual(["package", "skills"]);
      expect(Object.keys(lock.skills ?? {})).toEqual(["another-skill"]);
      expect(lock.package).toHaveLength(1);
      // A path source names only its stored path and format.
      expect(Object.keys(boundPackage(lock, "skills", "another-skill").source).sort()).toEqual([
        "format",
        "path",
      ]);
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
      const lockfilePath = path.join(temp.path, "axm.lock");
      const invalidLockfile = "version = [broken\n";
      fs.writeFileSync(lockfilePath, invalidLockfile);

      const result = await runCli(
        ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "another-skill"],
        { cwd: temp.path },
      );

      expect(result.exitCode).toBe(9);
      expect(getOutput(result)).toContain(
        `Workspace lockfile at ${fs.realpathSync(lockfilePath)} is not valid TOML`,
      );
      expect(fs.readFileSync(lockfilePath, "utf8")).toBe(invalidLockfile);
      expect(fs.existsSync(path.join(temp.path, "agent_extensions", "_local"))).toBe(false);
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
      const lockfilePath = path.join(temp.path, "axm.lock");
      const invalidLockfile = "version = [broken\n";
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

      expect(result.exitCode).toBe(9);
      expect(getOutput(result)).toContain(
        `Workspace lockfile at ${fs.realpathSync(lockfilePath)} is not valid TOML`,
      );
      expect(fs.readFileSync(lockfilePath, "utf8")).toBe(invalidLockfile);
    } finally {
      temp.cleanup();
    }
  });
});
