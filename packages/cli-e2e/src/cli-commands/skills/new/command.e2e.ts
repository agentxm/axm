/**
 * E2E tests for the `axm skills new` command.
 *
 * Tests: scaffolding, owner override, already-exists error, agent narrowing.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "../../../e2e/utils.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupWorkspace() {
  const temp = createTempDir();

  const settingsPath = path.join(temp.path, ".axm", "settings.json");

  const readSettings = () => JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

  return { temp, settingsPath, readSettings };
}

function configureScope(settingsPath: string, owner = "@test") {
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  settings.profile = owner;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("axm skills new", () => {
  it("scaffolds a new skill end-to-end", async () => {
    const { temp, settingsPath, readSettings } = setupWorkspace();
    try {
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureScope(settingsPath);

      const result = await runCli(["skills", "new", "my-skill", "--yes"], { cwd: temp.path });
      expect(result.exitCode).toBe(0);

      // Verify manifest
      const manifestPath = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@test",
        "skills",
        "my-skill",
        "axm-skill.json",
      );
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.owner).toBe("@test");
      expect(manifest.type).toBe("skill");
      expect(manifest.name).toBe("my-skill");
      expect(manifest.version).toBe("0.0.1");

      // Verify SKILL.md
      const skillMdPath = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@test",
        "skills",
        "my-skill",
        "src",
        "SKILL.md",
      );
      expect(fs.existsSync(skillMdPath)).toBe(true);
      const skillMd = fs.readFileSync(skillMdPath, "utf-8");
      expect(skillMd).toContain("---");
      expect(skillMd).toContain("name: my-skill");

      // Verify settings entry
      const settings = readSettings();
      expect(settings.skills).toBeDefined();
      expect(settings.skills["my-skill"]).toBeDefined();

      // Verify agent symlink
      const symlinkPath = path.join(temp.path, ".claude", "skills", "my-skill");
      expect(fs.existsSync(symlinkPath)).toBe(true);
      const linkTarget = fs.readlinkSync(symlinkPath);
      expect(linkTarget).toContain(path.join("@test", "skills", "my-skill", "src"));
    } finally {
      temp.cleanup();
    }
  });

  it("respects --profile override", async () => {
    const { temp, settingsPath } = setupWorkspace();
    try {
      await runCli(["init", "--yes", "--non-interactive"], { cwd: temp.path });
      configureScope(settingsPath);

      const result = await runCli(["skills", "new", "my-skill", "--profile", "@custom", "--yes"], {
        cwd: temp.path,
      });
      expect(result.exitCode).toBe(0);

      const manifestPath = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@custom",
        "skills",
        "my-skill",
        "axm-skill.json",
      );
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.owner).toBe("@custom");
      expect(manifest.type).toBe("skill");
      expect(manifest.name).toBe("my-skill");
    } finally {
      temp.cleanup();
    }
  });

  it("fails if skill already exists", async () => {
    const { temp, settingsPath } = setupWorkspace();
    try {
      await runCli(["init", "--yes", "--non-interactive"], { cwd: temp.path });
      configureScope(settingsPath);

      await runCli(["skills", "new", "dup-skill", "--yes"], { cwd: temp.path });
      const result = await runCli(["skills", "new", "dup-skill", "--yes"], { cwd: temp.path });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("already exists");
    } finally {
      temp.cleanup();
    }
  });

  it("narrows agent symlinks with --agent flag", async () => {
    const { temp, settingsPath } = setupWorkspace();
    try {
      // Init with multiple agents
      await runCli(["init", "--yes", "--agent", "claude-code", "--agent", "amp"], {
        cwd: temp.path,
      });
      configureScope(settingsPath);

      // Create skill targeting only claude-code via --agent
      const result = await runCli(
        ["skills", "new", "narrow-skill", "--agent", "claude-code", "--yes"],
        { cwd: temp.path },
      );
      expect(result.exitCode).toBe(0);

      // claude-code symlink should exist
      const claudeSymlink = path.join(temp.path, ".claude", "skills", "narrow-skill");
      expect(fs.existsSync(claudeSymlink)).toBe(true);
    } finally {
      temp.cleanup();
    }
  });
});
