/**
 * E2E tests for the `axm skills new` command.
 *
 * Tests: scaffolding, owner override, and the already-exists error.
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

  const settingsPath = path.join(temp.path, "axm.json");

  const readSettings = () => JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

  return { temp, settingsPath, readSettings };
}

function configureScope(settingsPath: string, owner = "@test") {
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  settings.owner = owner;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("axm skills new", () => {
  it("scaffolds a new skill end-to-end", async () => {
    const { temp, settingsPath, readSettings } = setupWorkspace();
    try {
      await runCli(["setup", "--yes", "--scope", "project", "--agent", "claude-code"], {
        cwd: temp.path,
      });
      configureScope(settingsPath);

      const result = await runCli(["skills", "new", "my-skill"], { cwd: temp.path });
      expect(result.exitCode).toBe(0);

      // Verify manifest
      const manifestPath = path.join(temp.path, "skills", "my-skill", "skill.json");
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.owner).toBe("@test");
      expect(manifest.type).toBe("skill");
      expect(manifest.name).toBe("my-skill");
      expect(manifest.version).toBe("0.0.1");

      // Verify SKILL.md
      const skillMdPath = path.join(temp.path, "skills", "my-skill", "src", "SKILL.md");
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
      expect(linkTarget).toContain(path.join("skills", "my-skill", "src"));
    } finally {
      temp.cleanup();
    }
  });

  it("uses the configured owner when an explicit owner agrees", async () => {
    const { temp, settingsPath } = setupWorkspace();
    try {
      await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        { cwd: temp.path },
      );
      configureScope(settingsPath, "@custom");

      const result = await runCli(["skills", "new", "my-skill", "--owner", "@custom"], {
        cwd: temp.path,
      });
      expect(result.exitCode).toBe(0);

      const manifestPath = path.join(temp.path, "skills", "my-skill", "skill.json");
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
      await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        { cwd: temp.path },
      );
      configureScope(settingsPath);

      await runCli(["skills", "new", "dup-skill"], { cwd: temp.path });
      const result = await runCli(["skills", "new", "dup-skill"], { cwd: temp.path });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("already exists");
    } finally {
      temp.cleanup();
    }
  });
});
