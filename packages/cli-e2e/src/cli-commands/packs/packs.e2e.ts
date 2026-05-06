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
import { expectDefined } from "../../test-helpers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Initialize a workspace with a registry source and owner, then install a
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
 * Set up registry source and owner in an already-initialized workspace.
 */
function configureRegistrySource(settingsPath: string, registryUrl: string, owner = "@test") {
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  settings.sources = [{ name: "local", type: "registry", location: registryUrl }];
  settings.owner = owner;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function writeSkillPackage(workspaceRoot: string, name: string, version = "1.0.0") {
  const skillDir = path.join(workspaceRoot, ".axm", "extensions", "@test", "skills", name);
  const srcDir = path.join(skillDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(srcDir, "SKILL.md"),
    `---\nname: "${name}"\ndescription: "${name}"\n---\n\n# ${name}\n`,
  );
  fs.writeFileSync(
    path.join(skillDir, "skill.json"),
    JSON.stringify(
      {
        owner: "@test",
        type: "skill",
        name,
        version,
        agents: ["claude-code"],
      },
      null,
      2,
    ) + "\n",
  );
}

function writeSubagentPackage(workspaceRoot: string, name: string, version = "1.0.0") {
  const subagentDir = path.join(workspaceRoot, ".axm", "extensions", "@test", "subagents", name);
  const srcDir = path.join(subagentDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(srcDir, "SUBAGENT.md"),
    [
      "---",
      `name: "${name}"`,
      'description: "A dependency subagent"',
      "model: default",
      "toolAccess: readonly",
      "background: false",
      "---",
      "",
      `# ${name}`,
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(subagentDir, "subagent.json"),
    JSON.stringify(
      {
        owner: "@test",
        type: "subagent",
        name,
        version,
        agents: ["claude-code"],
      },
      null,
      2,
    ) + "\n",
  );
}

function updatePackManifest(
  workspaceRoot: string,
  packName: string,
  args: {
    version: string;
    skills: Record<string, string>;
  },
) {
  const manifestPath = path.join(
    workspaceRoot,
    ".axm",
    "extensions",
    "@test",
    "packs",
    packName,
    "extension-pack.json",
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  manifest.version = args.version;
  manifest.skills = args.skills;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

// ---------------------------------------------------------------------------
// 9.1: packs new
// ---------------------------------------------------------------------------

describe("axm packs new", () => {
  it("scaffolds a pack with manifest and registers in settings", async () => {
    const { temp, registryDir, settingsPath, readSettings, cleanup } = setupWorkspaceWithRegistry();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
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
        "extension-pack.json",
      );
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.owner).toBe("@test");
      expect(manifest.type).toBe("pack");
      expect(manifest.name).toBe("frontend-tools");
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

  it("respects --profile override", async () => {
    const { temp, registryDir, settingsPath, cleanup } = setupWorkspaceWithRegistry();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      const result = await runCli(["packs", "new", "my-pack", "--profile", "@custom", "--yes"], {
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
        "extension-pack.json",
      );
      expect(fs.existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.owner).toBe("@custom");
      expect(manifest.type).toBe("pack");
      expect(manifest.name).toBe("my-pack");
    } finally {
      cleanup();
    }
  });

  it("fails if pack already exists", async () => {
    const { temp, registryDir, settingsPath, cleanup } = setupWorkspaceWithRegistry();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
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
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      // Install a skill from fixture, then fork to make it registry-sourced
      await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
        cwd: temp.path,
      });
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
        "extension-pack.json",
      );
      let manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.skills).toBeDefined();
      const skillKeys = Object.keys(manifest.skills);
      expect(skillKeys.length).toBe(1);
      // The FQN should be @test/skills/my-skill
      expect(skillKeys[0]).toMatch(/@test\/skills\/my-skill/);

      // Remove the extension from the pack
      const removeResult = await runCli(
        ["packs", "remove", "test-pack", expectDefined(skillKeys[0]), "--yes"],
        {
          cwd: temp.path,
        },
      );
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
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });

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
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      // Create a pack
      await runCli(["packs", "new", "pub-pack", "--yes"], { cwd: temp.path });

      // Publish the pack
      const publishResult = await runCli(["packs", "publish", "pub-pack", "--yes"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "e2e-test-token" },
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
      expect(index.owner).toBe("@test");
      expect(index.type).toBe("pack");
      expect(index.versions).toBeDefined();
      expect(index.versions.length).toBeGreaterThan(0);

      const versionEntry = index.versions[0];
      expect(versionEntry.version).toBe("0.0.1");
      expect(versionEntry.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/);

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

  it("fails when pack does not exist", async () => {
    const { temp, registryDir, settingsPath, cleanup } = setupWorkspaceWithRegistry();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      const result = await runCli(["packs", "publish", "@test/packs/nonexistent-pack", "--yes"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "e2e-test-token" },
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
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      // Create and publish a pack first
      await runCli(["packs", "new", "installable-pack", "--yes"], { cwd: temp.path });
      const publishResult = await runCli(["packs", "publish", "installable-pack", "--yes"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "e2e-test-token" },
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

      // Install from registry (new format: @owner/packs/name)
      const installResult = await runCli(
        ["packs", "install", "@test/packs/installable-pack", "--yes"],
        { cwd: temp.path },
      );
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
      expect(lockEntry.owner).toBe("@test");
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

  it("re-installs idempotently when pack already exists", async () => {
    const { temp, registryDir, settingsPath, readSettings, readLock, cleanup } =
      setupWorkspaceWithRegistry();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      // Create and publish
      await runCli(["packs", "new", "already-pack", "--yes"], { cwd: temp.path });
      await runCli(["packs", "publish", "already-pack", "--yes"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "e2e-test-token" },
      });

      // Pack is already registered from `packs new`; install performs idempotent upsert
      const installResult = await runCli(
        ["packs", "install", "@test/packs/already-pack", "--yes"],
        { cwd: temp.path },
      );

      expect(installResult.exitCode).toBe(0);

      // Verify pack still in settings and lockfile after re-install
      const settings = readSettings();
      expect(settings.packs?.["already-pack"]).toBeDefined();
      const lock = readLock();
      expect(lock.packs?.["already-pack"]).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("installs pack with skill dependencies, records them in lockfile resolvedSkills", async () => {
    const { temp, registryDir, settingsPath, readSettings, readLock, cleanup } =
      setupWorkspaceWithRegistry();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      // Manually create a skill in .axm/extensions/ (avoids fork)
      const skillDir = path.join(temp.path, ".axm", "extensions", "@test", "skills", "dep-skill");
      const srcDir = path.join(skillDir, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, "SKILL.md"),
        '---\nname: "dep-skill"\ndescription: "A dependency skill"\n---\n\n# Dep Skill\n',
      );
      fs.writeFileSync(
        path.join(skillDir, "skill.json"),
        JSON.stringify(
          {
            owner: "@test",
            type: "skill",
            name: "dep-skill",
            version: "1.0.0",
            agents: ["claude-code"],
          },
          null,
          2,
        ) + "\n",
      );

      // Publish the skill to registry
      const settingsWithSkill = readSettings();
      settingsWithSkill.skills = {
        ...settingsWithSkill.skills,
        "dep-skill": { source: "@test/skills/dep-skill", authored: true },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settingsWithSkill, null, 2));

      const skillPublishResult = await runCli(["skills", "publish", "dep-skill", "--yes"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "e2e-test-token" },
      });
      expect(skillPublishResult.exitCode).toBe(0);

      // Create a pack and add the skill to its manifest directly
      await runCli(["packs", "new", "deps-pack", "--yes"], { cwd: temp.path });

      // Manually add the skill to the pack manifest
      const packManifestPath = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@test",
        "packs",
        "deps-pack",
        "extension-pack.json",
      );
      const packManifest = JSON.parse(fs.readFileSync(packManifestPath, "utf-8"));
      packManifest.skills = { "@test/skills/dep-skill": "1.0.0" };
      fs.writeFileSync(packManifestPath, JSON.stringify(packManifest, null, 2));

      // Publish the pack (with the skill dependency)
      const packPublishResult = await runCli(["packs", "publish", "deps-pack", "--yes"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "e2e-test-token" },
      });
      expect(packPublishResult.exitCode).toBe(0);

      // Clean up local state: remove pack from settings/lockfile/disk
      const settingsBefore = readSettings();
      delete settingsBefore.skills?.["dep-skill"];
      delete settingsBefore.packs?.["deps-pack"];
      fs.writeFileSync(settingsPath, JSON.stringify(settingsBefore, null, 2));

      const lockBefore = readLock();
      if (lockBefore.packs) delete lockBefore.packs["deps-pack"];
      fs.writeFileSync(path.join(temp.path, ".axm", "axm-lock.yaml"), YAML.stringify(lockBefore));

      fs.rmSync(path.join(temp.path, ".axm", "extensions", "@test", "packs", "deps-pack"), {
        recursive: true,
        force: true,
      });

      // Install the pack from registry
      const installResult = await runCli(["packs", "install", "@test/packs/deps-pack", "--yes"], {
        cwd: temp.path,
      });
      expect(installResult.exitCode).toBe(0);

      // Verify pack in lockfile with resolvedSkills populated
      const lock = readLock();
      expect(lock.packs).toBeDefined();
      expect(lock.packs["deps-pack"]).toBeDefined();
      const packEntry = lock.packs["deps-pack"];
      expect(packEntry.type).toBe("registry");
      expect(packEntry.resolvedVersion).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?$/);
      expect(packEntry.resolvedVersion.startsWith("^")).toBe(false);
      expect(packEntry.resolvedVersion.startsWith("~")).toBe(false);
      expect(packEntry.resolvedSkills).toBeDefined();
      const resolvedKeys = Object.keys(packEntry.resolvedSkills);
      expect(resolvedKeys.length).toBeGreaterThan(0);
      expect(resolvedKeys.some((k: string) => k.includes("dep-skill"))).toBe(true);
      const resolvedSkillVersion = packEntry.resolvedSkills["@test/skills/dep-skill"];
      expect(resolvedSkillVersion).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?$/);
      expect(resolvedSkillVersion.startsWith("^")).toBe(false);
      expect(resolvedSkillVersion.startsWith("~")).toBe(false);

      // Verify pack in settings
      const settings = readSettings();
      expect(settings.packs?.["deps-pack"]).toBeDefined();

      // Verify skill is NOT in settings (it's a pack dependency, not a direct install)
      expect(settings.skills?.["dep-skill"]).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("installs pack with subagent dependencies, records them in lockfile resolvedSubagents", async () => {
    const { temp, registryDir, settingsPath, readSettings, readLock, cleanup } =
      setupWorkspaceWithRegistry();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      writeSubagentPackage(temp.path, "dep-subagent");
      const settingsWithSubagent = readSettings();
      settingsWithSubagent.subagents = {
        ...settingsWithSubagent.subagents,
        "dep-subagent": { source: "@test/subagents/dep-subagent", authored: true },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settingsWithSubagent, null, 2));

      const subagentPublishResult = await runCli(
        ["subagents", "publish", "dep-subagent", "--yes"],
        {
          cwd: temp.path,
          env: { AXM_TOKEN: "e2e-test-token" },
        },
      );
      expect(subagentPublishResult.exitCode).toBe(0);

      await runCli(["packs", "new", "subagent-pack", "--yes"], { cwd: temp.path });

      const packManifestPath = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@test",
        "packs",
        "subagent-pack",
        "extension-pack.json",
      );
      const packManifest = JSON.parse(fs.readFileSync(packManifestPath, "utf-8"));
      packManifest.subagents = { "@test/subagents/dep-subagent": "1.0.0" };
      fs.writeFileSync(packManifestPath, JSON.stringify(packManifest, null, 2));

      const packPublishResult = await runCli(["packs", "publish", "subagent-pack", "--yes"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "e2e-test-token" },
      });
      expect(packPublishResult.exitCode).toBe(0);

      const settingsBefore = readSettings();
      delete settingsBefore.subagents?.["dep-subagent"];
      delete settingsBefore.packs?.["subagent-pack"];
      fs.writeFileSync(settingsPath, JSON.stringify(settingsBefore, null, 2));

      const lockBefore = readLock();
      if (lockBefore.packs) delete lockBefore.packs["subagent-pack"];
      fs.writeFileSync(path.join(temp.path, ".axm", "axm-lock.yaml"), YAML.stringify(lockBefore));

      fs.rmSync(path.join(temp.path, ".axm", "extensions", "@test", "packs", "subagent-pack"), {
        recursive: true,
        force: true,
      });

      const installResult = await runCli(
        ["packs", "install", "@test/packs/subagent-pack", "--yes"],
        { cwd: temp.path },
      );
      expect(installResult.exitCode).toBe(0);

      const lock = readLock();
      const packEntry = lock.packs["subagent-pack"];
      expect(packEntry.resolvedSubagents).toEqual({
        "@test/subagents/dep-subagent": "1.0.0",
      });
      expect(lock.subagents["dep-subagent"]).toBeDefined();

      const settings = readSettings();
      expect(settings.packs?.["subagent-pack"]).toBeDefined();
      expect(settings.subagents?.["dep-subagent"]).toBeUndefined();
      expect(
        fs.existsSync(
          path.join(temp.path, ".axm", "extensions", "@test", "subagents", "dep-subagent"),
        ),
      ).toBe(true);
    } finally {
      cleanup();
    }
  });

  // Skipped in Phase 7: this scenario exercised the removed `axm sync`
  // workspace-wide reconcile. The closest replacement — `axm packs
  // install @test/packs/prune-pack --yes` — does re-install the pack
  // at the newer version but promotes pack-member skills into the
  // top-level `skills` map as direct entries, which differs from
  // `sync`'s prune semantics. A follow-up OpenSpec change should
  // define how prune-on-pack-update flows through the rule-driven
  // pipeline (candidate: expand `workspace/packs-members-retained`
  // into an autofixing rule or wire a dedicated `axm packs update`
  // verb). Tracked in the Phase 7 summary.
  it.skip("prune logic removes dropped dependencies when sync re-evaluates an installed pack", async () => {
    const author = createTempDir();
    const consumer = createTempDir();
    const registryDir = createTempDir("axm-registry-");

    const authorSettingsPath = path.join(author.path, ".axm", "settings.json");
    const consumerSettingsPath = path.join(consumer.path, ".axm", "settings.json");
    const consumerLockPath = path.join(consumer.path, ".axm", "axm-lock.yaml");

    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: author.path });
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: consumer.path });

      const registryUrl = `file://${registryDir.path}`;
      configureRegistrySource(authorSettingsPath, registryUrl);
      configureRegistrySource(consumerSettingsPath, registryUrl);

      writeSkillPackage(author.path, "kept-skill");
      writeSkillPackage(author.path, "dropped-skill");

      const keptPublish = await runCli(["skills", "publish", "kept-skill", "--yes"], {
        cwd: author.path,
        env: { AXM_TOKEN: "e2e-test-token" },
      });
      expect(keptPublish.exitCode).toBe(0);

      const droppedPublish = await runCli(["skills", "publish", "dropped-skill", "--yes"], {
        cwd: author.path,
        env: { AXM_TOKEN: "e2e-test-token" },
      });
      expect(droppedPublish.exitCode).toBe(0);

      await runCli(["packs", "new", "prune-pack", "--yes"], { cwd: author.path });
      updatePackManifest(author.path, "prune-pack", {
        version: "0.0.1",
        skills: {
          "@test/skills/kept-skill": "1.0.0",
          "@test/skills/dropped-skill": "1.0.0",
        },
      });

      const initialPackPublish = await runCli(["packs", "publish", "prune-pack", "--yes"], {
        cwd: author.path,
        env: { AXM_TOKEN: "e2e-test-token" },
      });
      expect(initialPackPublish.exitCode).toBe(0);

      const installResult = await runCli(["packs", "install", "@test/packs/prune-pack", "--yes"], {
        cwd: consumer.path,
      });
      expect(installResult.exitCode).toBe(0);

      const droppedCanonicalPath = path.join(
        consumer.path,
        ".axm",
        "extensions",
        "@test",
        "skills",
        "dropped-skill",
      );
      const droppedAgentPath = path.join(consumer.path, ".claude", "skills", "dropped-skill");
      const keptCanonicalPath = path.join(
        consumer.path,
        ".axm",
        "extensions",
        "@test",
        "skills",
        "kept-skill",
      );

      expect(fs.existsSync(droppedCanonicalPath)).toBe(true);
      expect(fs.existsSync(droppedAgentPath)).toBe(true);
      expect(fs.existsSync(keptCanonicalPath)).toBe(true);

      updatePackManifest(author.path, "prune-pack", {
        version: "0.0.2",
        skills: {
          "@test/skills/kept-skill": "1.0.0",
        },
      });

      const updatedPackPublish = await runCli(["packs", "publish", "prune-pack", "--yes"], {
        cwd: author.path,
        env: { AXM_TOKEN: "e2e-test-token" },
      });
      expect(updatedPackPublish.exitCode).toBe(0);

      const syncResult = await runCli(["sync", "--yes"], {
        cwd: consumer.path,
      });
      expect(syncResult.exitCode).toBe(0);

      const lock = YAML.parse(fs.readFileSync(consumerLockPath, "utf-8"));
      const packEntry = lock.packs["prune-pack"];
      expect(packEntry.resolvedVersion).toBe("0.0.2");
      expect(packEntry.resolvedSkills).toEqual({ "@test/skills/kept-skill": "1.0.0" });
      expect(lock.skills).toEqual({});
      expect(lock.skills["dropped-skill"]).toBeUndefined();

      const settings = JSON.parse(fs.readFileSync(consumerSettingsPath, "utf-8"));
      expect(settings.skills?.["dropped-skill"]).toBeUndefined();

      expect(fs.existsSync(droppedCanonicalPath)).toBe(false);
      expect(fs.existsSync(droppedAgentPath)).toBe(false);
      expect(fs.existsSync(keptCanonicalPath)).toBe(true);
      expect(fs.existsSync(path.join(consumer.path, ".claude", "skills", "kept-skill"))).toBe(true);
    } finally {
      author.cleanup();
      consumer.cleanup();
      registryDir.cleanup();
    }
  });

  it("--preview shows plan without applying changes", async () => {
    const { temp, registryDir, settingsPath, lockPath, readSettings, readLock, cleanup } =
      setupWorkspaceWithRegistry();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      // Create and publish a pack
      await runCli(["packs", "new", "preview-pack", "--yes"], { cwd: temp.path });
      const publishResult = await runCli(["packs", "publish", "preview-pack", "--yes"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "e2e-test-token" },
      });
      expect(publishResult.exitCode).toBe(0);

      // Clean up local state
      const settingsBefore = readSettings();
      delete settingsBefore.packs?.["preview-pack"];
      fs.writeFileSync(settingsPath, JSON.stringify(settingsBefore, null, 2));

      const lockBefore = readLock();
      if (lockBefore.packs) delete lockBefore.packs["preview-pack"];
      fs.writeFileSync(path.join(temp.path, ".axm", "axm-lock.yaml"), YAML.stringify(lockBefore));

      fs.rmSync(path.join(temp.path, ".axm", "extensions", "@test", "packs", "preview-pack"), {
        recursive: true,
        force: true,
      });

      // Snapshot settings and lockfile before preview
      const settingsSnapshot = fs.readFileSync(settingsPath, "utf-8");
      const lockSnapshot = fs.readFileSync(lockPath, "utf-8");

      // Run install with --preview --non-interactive (no --yes: plan displayed but NOT applied)
      const previewResult = await runCli(
        ["packs", "install", "@test/packs/preview-pack", "--preview", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(previewResult.exitCode).toBe(0);

      // Verify stdout mentions the pack name (plan was displayed)
      const combined = previewResult.stdout + previewResult.stderr;
      expect(combined).toContain("preview-pack");

      // Verify settings and lockfile are unchanged (nothing actually installed)
      expect(fs.readFileSync(settingsPath, "utf-8")).toBe(settingsSnapshot);
      expect(fs.readFileSync(lockPath, "utf-8")).toBe(lockSnapshot);
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
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      // Install a skill, fork it, create a pack with it, publish the pack
      await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
        cwd: temp.path,
      });
      await runCli(["skills", "fork", "my-skill", "--yes"], { cwd: temp.path });

      await runCli(["packs", "new", "removable-pack", "--yes"], { cwd: temp.path });
      await runCli(["packs", "add", "removable-pack", "my-skill", "--yes"], { cwd: temp.path });
      await runCli(["packs", "publish", "removable-pack", "--yes"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "e2e-test-token" },
      });

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

  it("fails for a literal pack not in the lockfile or settings", async () => {
    const temp = createTempDir();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      const settingsPath = path.join(temp.path, ".axm", "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      settings.owner = "@test";
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      const result = await runCli(["packs", "uninstall", "nonexistent-pack", "--yes"], {
        cwd: temp.path,
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout + result.stderr).toContain("EXTENSION_NOT_FOUND");
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
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      // Install a skill, fork it (makes it registry-sourced)
      await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
        cwd: temp.path,
      });
      await runCli(["skills", "fork", "my-skill", "--yes"], { cwd: temp.path });

      // Create a pack with the skill, then publish and install
      await runCli(["packs", "new", "unpackable", "--yes"], { cwd: temp.path });
      await runCli(["packs", "add", "unpackable", "my-skill", "--yes"], { cwd: temp.path });
      await runCli(["packs", "publish", "unpackable", "--yes"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "e2e-test-token" },
      });

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
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });

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
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      // Install skill, fork it, create pack with it, publish
      await runCli(["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"], {
        cwd: temp.path,
      });
      await runCli(["skills", "fork", "my-skill", "--yes"], { cwd: temp.path });

      await runCli(["packs", "new", "disable-pack", "--yes"], { cwd: temp.path });
      await runCli(["packs", "add", "disable-pack", "my-skill", "--yes"], { cwd: temp.path });
      await runCli(["packs", "publish", "disable-pack", "--yes"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "e2e-test-token" },
      });

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
