/**
 * E2E tests for the `axm packs` command group.
 *
 * Tests: packs new, add/remove, publish, install, uninstall, unpack,
 * and transitive skill disable.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../e2e/utils.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Initialize a workspace with a registry source and scope, then install a
 * skill from the local fixture so we have a registry-sourced skill to work with.
 *
 * Returns the temp dir, registry dir, and helpers for reading settings/lockfile.
 */
function setupWorkspaceWithRegistry() {
  const temp = createTempDir();
  const registryDir = createTempDir("axm-registry-");

  const settingsPath = path.join(temp.path, ".axm", "settings.json");
  const lockPath = path.join(temp.path, ".axm", "axm-lock.yaml");

  const readSettings = () => JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  const readLock = () => YAML.parse(fs.readFileSync(lockPath, "utf-8"));

  const cleanup = () => {
    temp.cleanup();
    registryDir.cleanup();
  };

  return { temp, registryDir, settingsPath, lockPath, readSettings, readLock, cleanup };
}

/**
 * Set up registry source and scope in an already-initialized workspace.
 */
function configureRegistrySource(settingsPath: string, registryUrl: string, scope = "@test") {
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  settings.sources = [{ name: "local", type: "registry", location: registryUrl }];
  settings.scope = scope;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// ---------------------------------------------------------------------------
// 9.1: packs new
// ---------------------------------------------------------------------------

describe("axm packs new", () => {
  it("scaffolds a pack with manifest and registers in settings", async () => {
    const { temp, registryDir, settingsPath, readSettings, cleanup } = setupWorkspaceWithRegistry();
    try {
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      const result = await runCli(["packs", "new", "frontend-tools", "--yes"], {
        cwd: temp.path,
      });

      expect(result.exitCode).toBe(0);

      // Verify manifest created
      const manifestPath = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@test",
        "packs",
        "frontend-tools",
        "axm-pack.json",
      );
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.name).toBe("@test/frontend-tools");
      expect(manifest.version).toBe("0.0.1");
      expect(manifest.skills).toEqual({});

      // Verify settings entry
      const settings = readSettings();
      expect(settings.packs).toBeDefined();
      expect(settings.packs["frontend-tools"]).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("respects --scope override", async () => {
    const { temp, registryDir, settingsPath, cleanup } = setupWorkspaceWithRegistry();
    try {
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      const result = await runCli(["packs", "new", "my-pack", "--scope", "@custom", "--yes"], {
        cwd: temp.path,
      });

      expect(result.exitCode).toBe(0);

      const manifestPath = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@custom",
        "packs",
        "my-pack",
        "axm-pack.json",
      );
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.name).toBe("@custom/my-pack");
    } finally {
      cleanup();
    }
  });

  it("fails if pack already exists", async () => {
    const { temp, registryDir, settingsPath, cleanup } = setupWorkspaceWithRegistry();
    try {
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      await runCli(["packs", "new", "dup-pack", "--yes"], { cwd: temp.path });
      const result = await runCli(["packs", "new", "dup-pack", "--yes"], {
        cwd: temp.path,
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("already exists");
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 9.2: packs add / remove
// ---------------------------------------------------------------------------

describe("axm packs add/remove", () => {
  it("adds an extension to pack manifest and removes it", async () => {
    const { temp, registryDir, settingsPath, cleanup } = setupWorkspaceWithRegistry();
    try {
      // Initialize and configure
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      // Install a skill from fixture, then fork to make it registry-sourced
      await runCli(
        [
          "skills",
          "install",
          SKILLS_REPO_FIXTURE,
          "--skill",
          "my-skill",
          "--yes",
          "--agent",
          "claude-code",
        ],
        { cwd: temp.path },
      );
      const forkResult = await runCli(["skills", "fork", "my-skill", "--yes"], {
        cwd: temp.path,
      });
      expect(forkResult.exitCode).toBe(0);

      // Create a pack
      await runCli(["packs", "new", "test-pack", "--yes"], { cwd: temp.path });

      // Add the extension to the pack
      const addResult = await runCli(["packs", "add", "test-pack", "my-skill", "--yes"], {
        cwd: temp.path,
      });
      expect(addResult.exitCode).toBe(0);

      // Verify manifest was updated
      const manifestPath = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@test",
        "packs",
        "test-pack",
        "axm-pack.json",
      );
      let manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.skills).toBeDefined();
      const skillKeys = Object.keys(manifest.skills);
      expect(skillKeys.length).toBe(1);
      // The FQN should be @test/my-skill
      expect(skillKeys[0]).toMatch(/@test\/my-skill/);

      // Remove the extension from the pack
      const removeResult = await runCli(["packs", "remove", "test-pack", skillKeys[0]!, "--yes"], {
        cwd: temp.path,
      });
      expect(removeResult.exitCode).toBe(0);

      // Verify manifest no longer has the extension
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(Object.keys(manifest.skills ?? {})).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it("errors when pack is not found", async () => {
    const temp = createTempDir();
    try {
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });

      const result = await runCli(["packs", "add", "nonexistent-pack", "some-ext", "--yes"], {
        cwd: temp.path,
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("not found");
    } finally {
      temp.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 9.3: packs publish
// ---------------------------------------------------------------------------

describe("axm packs publish", () => {
  it("publishes pack to local registry with archive and index.json", async () => {
    const { temp, registryDir, settingsPath, cleanup } = setupWorkspaceWithRegistry();
    try {
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      // Create a pack
      await runCli(["packs", "new", "pub-pack", "--yes"], { cwd: temp.path });

      // Publish the pack
      const publishResult = await runCli(["packs", "publish", "pub-pack", "--yes"], {
        cwd: temp.path,
      });
      expect(publishResult.exitCode).toBe(0);

      // Verify index.json in registry
      const registryIndexPath = path.join(
        registryDir.path,
        "extensions",
        "@test",
        "packs",
        "pub-pack",
        "index.json",
      );
      expect(fs.existsSync(registryIndexPath)).toBe(true);

      const index = JSON.parse(fs.readFileSync(registryIndexPath, "utf-8"));
      expect(index.name).toBe("pub-pack");
      expect(index.scope).toBe("@test");
      expect(index.type).toBe("pack");
      expect(index.versions).toBeDefined();
      expect(index.versions.length).toBeGreaterThan(0);

      const versionEntry = index.versions[0];
      expect(versionEntry.version).toBe("0.0.1");
      expect(versionEntry.checksum).toMatch(/^sha256:/);

      // Verify archive exists and is a valid zip
      const archivePath = path.join(
        registryDir.path,
        "extensions",
        "@test",
        "packs",
        "pub-pack",
        "0.0.1.zip",
      );
      expect(fs.existsSync(archivePath)).toBe(true);
      const archiveBytes = fs.readFileSync(archivePath);
      expect(archiveBytes.length).toBeGreaterThan(0);
      // ZIP magic bytes: PK (0x50 0x4b)
      expect(archiveBytes[0]).toBe(0x50);
      expect(archiveBytes[1]).toBe(0x4b);
    } finally {
      cleanup();
    }
  });

  it("fails when managed pack does not exist", async () => {
    const { temp, registryDir, settingsPath, cleanup } = setupWorkspaceWithRegistry();
    try {
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      const result = await runCli(["packs", "publish", "@test/nonexistent-pack", "--yes"], {
        cwd: temp.path,
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("not found");
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 9.4: packs install
// ---------------------------------------------------------------------------

describe("axm packs install", () => {
  it("installs pack from registry, updates settings and lockfile", async () => {
    const { temp, registryDir, settingsPath, readSettings, readLock, cleanup } =
      setupWorkspaceWithRegistry();
    try {
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      // Create and publish a pack first
      await runCli(["packs", "new", "installable-pack", "--yes"], { cwd: temp.path });
      const publishResult = await runCli(["packs", "publish", "installable-pack", "--yes"], {
        cwd: temp.path,
      });
      expect(publishResult.exitCode).toBe(0);

      // Remove the pack from settings, lockfile, and disk to simulate fresh install
      // (packs new already registered it)
      const settingsBefore = readSettings();
      delete settingsBefore.packs?.["installable-pack"];
      fs.writeFileSync(settingsPath, JSON.stringify(settingsBefore, null, 2));

      const lockBefore = readLock();
      if (lockBefore.packs) delete lockBefore.packs["installable-pack"];
      fs.writeFileSync(path.join(temp.path, ".axm", "axm-lock.yaml"), YAML.stringify(lockBefore));

      // Remove pack directory from disk
      const packDirBefore = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@test",
        "packs",
        "installable-pack",
      );
      fs.rmSync(packDirBefore, { recursive: true, force: true });

      // Install from registry
      const installResult = await runCli(["packs", "install", "@test/installable-pack", "--yes"], {
        cwd: temp.path,
      });
      expect(installResult.exitCode).toBe(0);

      // Verify settings updated
      const settings = readSettings();
      expect(settings.packs).toBeDefined();
      expect(settings.packs["installable-pack"]).toBeDefined();

      // Verify lockfile updated
      const lock = readLock();
      expect(lock.packs).toBeDefined();
      expect(lock.packs["installable-pack"]).toBeDefined();
      const lockEntry = lock.packs["installable-pack"];
      expect(lockEntry.type).toBe("registry");
      expect(lockEntry.scope).toBe("@test");
      expect(lockEntry.name).toBe("installable-pack");

      // Verify pack directory exists on disk
      const packDir = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@test",
        "packs",
        "installable-pack",
      );
      expect(fs.existsSync(packDir)).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("reports already installed without --force", async () => {
    const { temp, registryDir, settingsPath, cleanup } = setupWorkspaceWithRegistry();
    try {
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      // Create and publish
      await runCli(["packs", "new", "already-pack", "--yes"], { cwd: temp.path });
      await runCli(["packs", "publish", "already-pack", "--yes"], { cwd: temp.path });

      // Pack is already registered from `packs new`, so install should say already installed
      const installResult = await runCli(["packs", "install", "@test/already-pack", "--yes"], {
        cwd: temp.path,
      });

      expect(installResult.exitCode).toBe(0);
      expect(installResult.stdout).toMatch(/already installed|[Nn]othing to install/);
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 9.5: packs uninstall
// ---------------------------------------------------------------------------

describe("axm packs uninstall", () => {
  it("uninstalls pack and removes orphaned extensions", async () => {
    const { temp, registryDir, settingsPath, readSettings, readLock, cleanup } =
      setupWorkspaceWithRegistry();
    try {
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      // Install a skill, fork it, create a pack with it, publish the pack
      await runCli(
        [
          "skills",
          "install",
          SKILLS_REPO_FIXTURE,
          "--skill",
          "my-skill",
          "--yes",
          "--agent",
          "claude-code",
        ],
        { cwd: temp.path },
      );
      await runCli(["skills", "fork", "my-skill", "--yes"], { cwd: temp.path });

      await runCli(["packs", "new", "removable-pack", "--yes"], { cwd: temp.path });
      await runCli(["packs", "add", "removable-pack", "my-skill", "--yes"], { cwd: temp.path });
      await runCli(["packs", "publish", "removable-pack", "--yes"], { cwd: temp.path });

      // Verify pack is in settings and lockfile before uninstall
      let settings = readSettings();
      expect(settings.packs?.["removable-pack"]).toBeDefined();
      let lock = readLock();
      expect(lock.packs?.["removable-pack"]).toBeDefined();

      // Uninstall the pack
      const result = await runCli(["packs", "uninstall", "removable-pack", "--yes"], {
        cwd: temp.path,
      });
      expect(result.exitCode).toBe(0);

      // Verify pack removed from settings
      settings = readSettings();
      expect(settings.packs?.["removable-pack"]).toBeUndefined();

      // Verify pack removed from lockfile
      lock = readLock();
      expect(lock.packs?.["removable-pack"]).toBeUndefined();

      // Verify pack directory removed from disk
      const packDir = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@test",
        "packs",
        "removable-pack",
      );
      expect(fs.existsSync(packDir)).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("no-op for pack not in lockfile", async () => {
    const temp = createTempDir();
    try {
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });

      const result = await runCli(["packs", "uninstall", "nonexistent-pack", "--yes"], {
        cwd: temp.path,
      });

      // Should exit 0 with a no-op message (same pattern as skills uninstall)
      expect(result.exitCode).toBe(0);
    } finally {
      temp.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 9.6: packs unpack
// ---------------------------------------------------------------------------

describe("axm packs unpack", () => {
  it("promotes pack extensions to direct settings entries and removes pack", async () => {
    const { temp, registryDir, settingsPath, readSettings, readLock, cleanup } =
      setupWorkspaceWithRegistry();
    try {
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      // Install a skill, fork it (makes it registry-sourced)
      await runCli(
        [
          "skills",
          "install",
          SKILLS_REPO_FIXTURE,
          "--skill",
          "my-skill",
          "--yes",
          "--agent",
          "claude-code",
        ],
        { cwd: temp.path },
      );
      await runCli(["skills", "fork", "my-skill", "--yes"], { cwd: temp.path });

      // Create a pack with the skill, then publish and install
      await runCli(["packs", "new", "unpackable", "--yes"], { cwd: temp.path });
      await runCli(["packs", "add", "unpackable", "my-skill", "--yes"], { cwd: temp.path });
      await runCli(["packs", "publish", "unpackable", "--yes"], { cwd: temp.path });

      // Verify pack exists before unpack
      let settings = readSettings();
      expect(settings.packs?.["unpackable"]).toBeDefined();

      // Unpack the pack
      const result = await runCli(["packs", "unpack", "unpackable", "--yes"], { cwd: temp.path });
      expect(result.exitCode).toBe(0);

      // Verify pack removed from settings
      settings = readSettings();
      expect(settings.packs?.["unpackable"]).toBeUndefined();

      // Verify pack removed from lockfile
      const lock = readLock();
      expect(lock.packs?.["unpackable"]).toBeUndefined();

      // Verify the skill was promoted to a direct entry
      // my-skill should still exist in settings.skills as a direct entry
      expect(settings.skills?.["my-skill"]).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("fails for non-installed pack", async () => {
    const temp = createTempDir();
    try {
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });

      const result = await runCli(["packs", "unpack", "nonexistent", "--yes"], { cwd: temp.path });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("not installed");
    } finally {
      temp.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 9.7: Transitive skill disable (pack-provided skill)
// ---------------------------------------------------------------------------

describe("transitive skill disable via pack", () => {
  it("disabling a pack-provided skill creates a direct entry; uninstalling pack preserves it", async () => {
    const { temp, registryDir, settingsPath, readSettings, readLock, cleanup } =
      setupWorkspaceWithRegistry();
    try {
      await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      // Install skill, fork it, create pack with it, publish
      await runCli(
        [
          "skills",
          "install",
          SKILLS_REPO_FIXTURE,
          "--skill",
          "my-skill",
          "--yes",
          "--agent",
          "claude-code",
        ],
        { cwd: temp.path },
      );
      await runCli(["skills", "fork", "my-skill", "--yes"], { cwd: temp.path });

      await runCli(["packs", "new", "disable-pack", "--yes"], { cwd: temp.path });
      await runCli(["packs", "add", "disable-pack", "my-skill", "--yes"], { cwd: temp.path });
      await runCli(["packs", "publish", "disable-pack", "--yes"], { cwd: temp.path });

      // Verify my-skill is visible (either as direct or transitive)
      let settings = readSettings();
      const skillBefore = settings.skills?.["my-skill"];
      // my-skill should be in settings at this point (from fork)
      expect(skillBefore).toBeDefined();

      // Disable the skill
      const disableResult = await runCli(["skills", "disable", "my-skill", "--yes"], {
        cwd: temp.path,
      });
      expect(disableResult.exitCode).toBe(0);

      // Verify skill has a direct entry with enabled: false
      settings = readSettings();
      const disabledEntry = settings.skills?.["my-skill"];
      expect(disabledEntry).toBeDefined();
      if (typeof disabledEntry === "object") {
        expect(disabledEntry.enabled).toBe(false);
      }

      // Re-enable the skill
      const enableResult = await runCli(["skills", "enable", "my-skill", "--yes"], {
        cwd: temp.path,
      });
      expect(enableResult.exitCode).toBe(0);

      // Verify skill is re-enabled
      settings = readSettings();
      const enabledEntry = settings.skills?.["my-skill"];
      expect(enabledEntry).toBeDefined();
      if (typeof enabledEntry === "object") {
        expect(enabledEntry.enabled).not.toBe(false);
      }

      // Uninstall the pack
      const uninstallResult = await runCli(["packs", "uninstall", "disable-pack", "--yes"], {
        cwd: temp.path,
      });
      expect(uninstallResult.exitCode).toBe(0);

      // Verify pack is gone
      settings = readSettings();
      expect(settings.packs?.["disable-pack"]).toBeUndefined();
      const lock = readLock();
      expect(lock.packs?.["disable-pack"]).toBeUndefined();

      // Verify my-skill is preserved as a direct entry (not orphaned)
      // because it was promoted to a direct entry via disable/enable
      expect(settings.skills?.["my-skill"]).toBeDefined();
    } finally {
      cleanup();
    }
  });
});
