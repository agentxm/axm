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
import { createTempDir, runCli } from "../../e2e/utils.js";
import { refreshAuthoredWorkspacePackState } from "../../e2e/workspace-pack-state.js";

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
    path.join(srcDir, `${name}.md`),
    [
      "---",
      `name: "${name}"`,
      'description: "A dependency subagent"',
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
      },
      null,
      2,
    ) + "\n",
  );
}

async function publishRegistrySkill(registryPath: string, name: string) {
  const workspace = createTempDir();
  const settingsPath = path.join(workspace.path, ".axm", "settings.json");

  try {
    await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: workspace.path });
    configureRegistrySource(settingsPath, `file://${registryPath}`);

    const createResult = await runCli(
      ["skills", "new", name, "--owner", "@test", "--agent", "claude-code", "--yes"],
      { cwd: workspace.path },
    );
    expect(createResult.exitCode).toBe(0);

    const publishResult = await runCli(["skills", "publish", `@test/skills/${name}`, "--yes"], {
      cwd: workspace.path,
      env: { AXM_TOKEN: "e2e-test-token" },
    });
    expect(publishResult.exitCode).toBe(0);
  } finally {
    workspace.cleanup();
  }
}

async function publishRegistryPack(
  registryPath: string,
  name: string,
  dependencies: Record<string, string>,
) {
  const workspace = createTempDir();
  const settingsPath = path.join(workspace.path, ".axm", "settings.json");

  try {
    const setup = await runCli(["setup", "--yes", "--agent", "claude-code"], {
      cwd: workspace.path,
    });
    expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
    configureRegistrySource(settingsPath, `file://${registryPath}`);

    const created = await runCli(["packs", "new", name, "--yes"], {
      cwd: workspace.path,
    });
    expect(created.exitCode, created.stdout + created.stderr).toBe(0);
    updatePackManifest(workspace.path, name, { version: "0.0.1", dependencies });

    const published = await runCli(["packs", "publish", `@test/packs/${name}`, "--yes", "--json"], {
      cwd: workspace.path,
      env: { AXM_TOKEN: "e2e-test-token" },
    });
    expect(published.exitCode, published.stdout + published.stderr).toBe(0);
  } finally {
    workspace.cleanup();
  }
}

function updatePackManifest(
  workspaceRoot: string,
  packName: string,
  args: {
    version: string;
    dependencies: Record<string, string>;
  },
) {
  const manifestPath = path.join(
    workspaceRoot,
    ".axm",
    "extensions",
    "@test",
    "packs",
    packName,
    "pack.json",
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  manifest.version = args.version;
  manifest.dependencies = args.dependencies;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  refreshAuthoredWorkspacePackState(workspaceRoot, "@test", packName);
}

function detachWorkspacePack(
  workspaceRoot: string,
  settingsPath: string,
  lockPath: string,
  packName: string,
) {
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  delete settings.packs?.[packName];
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  const lock = YAML.parse(fs.readFileSync(lockPath, "utf-8"));
  if (lock.packs) delete lock.packs[packName];
  fs.writeFileSync(lockPath, YAML.stringify(lock));
  fs.rmSync(path.join(workspaceRoot, ".axm", "extensions", "@test", "packs", packName), {
    recursive: true,
    force: true,
  });
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
        "pack.json",
      );
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      expect(manifest.owner).toBe("@test");
      expect(manifest.type).toBe("pack");
      expect(manifest.name).toBe("frontend-tools");
      expect(manifest.version).toBe("0.0.1");
      expect(manifest.dependencies).toEqual({});

      // Verify settings entry
      const settings = readSettings();
      expect(settings.packs).toBeDefined();
      expect(settings.packs["frontend-tools"]).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it("respects --owner override", async () => {
    const { temp, registryDir, settingsPath, cleanup } = setupWorkspaceWithRegistry();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      const result = await runCli(["packs", "new", "my-pack", "--owner", "@custom", "--yes"], {
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
        "pack.json",
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

  it("requires explicit repair for authored pack drift even with --reinstall", async () => {
    const { temp, registryDir, settingsPath, cleanup } = setupWorkspaceWithRegistry();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);
      const create = await runCli(["packs", "new", "drifted-pack", "--yes"], {
        cwd: temp.path,
      });
      expect(create.exitCode, create.stderr).toBe(0);

      const trustPath = path.join(temp.path, ".axm", "trust.json");
      const trustBefore = fs.readFileSync(trustPath, "utf8");
      const manifestPath = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@test",
        "packs",
        "drifted-pack",
        "pack.json",
      );
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      fs.writeFileSync(
        manifestPath,
        `${JSON.stringify({ ...manifest, description: "Unreviewed change" }, null, 2)}\n`,
      );

      const install = await runCli(["install", "--reinstall", "--yes"], { cwd: temp.path });

      expect(install.exitCode).not.toBe(0);
      expect(install.stderr).toContain("packs repair @test/packs/drifted-pack --preview");
      expect(fs.readFileSync(trustPath, "utf8")).toBe(trustBefore);
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 9.2: packs add / remove
// ---------------------------------------------------------------------------

describe("axm packs add/remove", () => {
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

  it("records workspace and Registry dependencies in one pack receipt", async () => {
    const { temp, registryDir, settingsPath, readLock, cleanup } = setupWorkspaceWithRegistry();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);
      await publishRegistrySkill(registryDir.path, "registry-member");
      const registrySkill = await runCli(
        ["skills", "install", "@test/skills/registry-member", "--yes"],
        { cwd: temp.path },
      );
      expect(registrySkill.exitCode, registrySkill.stderr).toBe(0);

      const workspaceSkill = await runCli(
        [
          "skills",
          "new",
          "workspace-member",
          "--owner",
          "@test",
          "--agent",
          "claude-code",
          "--yes",
        ],
        { cwd: temp.path },
      );
      expect(workspaceSkill.exitCode, workspaceSkill.stderr).toBe(0);
      const pack = await runCli(["packs", "new", "mixed-pack", "--yes"], {
        cwd: temp.path,
      });
      expect(pack.exitCode, pack.stderr).toBe(0);

      const addWorkspace = await runCli(
        ["packs", "add", "mixed-pack", "@test/skills/workspace-member", "--yes"],
        {
          cwd: temp.path,
          env: { AXM_REGISTRY_URL: "http://127.0.0.1:1" },
        },
      );
      expect(addWorkspace.exitCode, addWorkspace.stderr).toBe(0);

      const addRegistry = await runCli(
        ["packs", "add", "mixed-pack", "@test/skills/registry-member", "--yes"],
        { cwd: temp.path },
      );
      expect(addRegistry.exitCode, addRegistry.stderr).toBe(0);

      const receipt = readLock().packs["mixed-pack"].resolvedSkills;
      expect(receipt["@test/skills/workspace-member"]).toMatchObject({
        source: "workspace",
        version: "0.0.1",
        sourceIdentity: "workspace:@test/skills/workspace-member",
      });
      expect(receipt["@test/skills/workspace-member"].contentIdentity).toMatch(/^[a-f0-9]{64}$/);
      expect(receipt["@test/skills/registry-member"]).toMatchObject({
        source: "registry",
        version: "0.0.1",
        publisherBindingId: expect.stringMatching(/^hbnd_/),
        integrity: expect.stringMatching(/^sha512-/),
      });

      const unrelated = await runCli(["packs", "new", "drifted-pack", "--yes"], {
        cwd: temp.path,
      });
      expect(unrelated.exitCode, unrelated.stderr).toBe(0);
      const driftedManifestPath = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@test",
        "packs",
        "drifted-pack",
        "pack.json",
      );
      const driftedManifest = JSON.parse(fs.readFileSync(driftedManifestPath, "utf-8"));
      driftedManifest.description = "Changed outside AXM";
      fs.writeFileSync(driftedManifestPath, JSON.stringify(driftedManifest, null, 2));

      const show = await runCli(["packs", "show", "mixed-pack", "--json"], {
        cwd: temp.path,
      });
      expect(show.exitCode, show.stderr).toBe(0);
      const shown = JSON.parse(show.stdout);
      expect(shown.result.pack).toBe("@test/packs/mixed-pack");
      expect(shown.result.desiredDependencies).toHaveLength(2);
      expect(shown.result.resolvedDependencies).toHaveLength(2);
    } finally {
      cleanup();
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
      await publishRegistrySkill(registryDir.path, "pub-pack-skill");
      updatePackManifest(temp.path, "pub-pack", {
        version: "0.0.1",
        dependencies: {
          "@test/skills/pub-pack-skill": "*",
        },
      });

      // Publish the pack
      const publishResult = await runCli(["packs", "publish", "pub-pack", "--yes"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "e2e-test-token" },
      });
      expect(publishResult.exitCode, publishResult.stderr).toBe(0);

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

  it("returns a successful empty result when an explicit pack does not exist", async () => {
    const { temp, registryDir, settingsPath, cleanup } = setupWorkspaceWithRegistry();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      const result = await runCli(
        ["packs", "publish", "@test/packs/nonexistent-pack", "--yes", "--json"],
        {
          cwd: temp.path,
          env: { AXM_TOKEN: "e2e-test-token" },
        },
      );
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout).result.results).toEqual([]);
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 9.4: packs install
// ---------------------------------------------------------------------------

describe("axm packs install", () => {
  it("keeps overlapping pack installation lint-clean with an existing direct skill", async () => {
    const { temp, registryDir, settingsPath, readSettings, readLock, cleanup } =
      setupWorkspaceWithRegistry();
    const directSkill = "shared-review";
    const firstMember = "frontend-review";
    const secondMember = "backend-review";
    const firstPack = "frontend-toolkit";
    const secondPack = "backend-toolkit";

    try {
      for (const skill of [directSkill, firstMember, secondMember]) {
        await publishRegistrySkill(registryDir.path, skill);
      }
      await publishRegistryPack(registryDir.path, firstPack, {
        [`@test/skills/${directSkill}`]: "0.0.1",
        [`@test/skills/${firstMember}`]: "0.0.1",
      });
      await publishRegistryPack(registryDir.path, secondPack, {
        [`@test/skills/${directSkill}`]: "0.0.1",
        [`@test/skills/${secondMember}`]: "0.0.1",
      });

      const setup = await runCli(["setup", "--yes", "--agent", "claude-code"], {
        cwd: temp.path,
      });
      expect(setup.exitCode, setup.stdout + setup.stderr).toBe(0);
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      const directInstall = await runCli(
        ["skills", "install", `@test/skills/${directSkill}`, "--yes", "--json"],
        { cwd: temp.path },
      );
      expect(directInstall.exitCode, directInstall.stdout + directInstall.stderr).toBe(0);
      expect(JSON.parse(directInstall.stdout)).toMatchObject({
        ok: true,
        result: { outcome: "applied" },
      });

      const directDesiredEntry = readSettings().skills?.[directSkill];
      expect(directDesiredEntry).toBeDefined();
      const directCanonical = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@test",
        "skills",
        directSkill,
      );
      const directProjection = path.join(temp.path, ".claude", "skills", directSkill);
      expect(readLock().skills?.[directSkill]).toBeDefined();
      expect(
        JSON.parse(fs.readFileSync(path.join(temp.path, ".axm", "trust.json"), "utf8")).records?.[
          `skill:${directSkill}`
        ],
      ).toBeDefined();
      expect(fs.existsSync(directCanonical)).toBe(true);
      expect(fs.lstatSync(directProjection).isSymbolicLink()).toBe(true);
      expect(fs.realpathSync(directProjection)).toBe(
        fs.realpathSync(path.join(directCanonical, "src")),
      );

      const baselineLint = await runCli(["lint", "--json"], { cwd: temp.path });
      expect(baselineLint.exitCode, baselineLint.stdout + baselineLint.stderr).toBe(0);
      expect(JSON.parse(baselineLint.stdout)).toMatchObject({
        ok: true,
        result: { findings: [] },
      });

      for (const pack of [firstPack, secondPack]) {
        const installed = await runCli(
          ["packs", "install", `@test/packs/${pack}`, "--yes", "--json"],
          { cwd: temp.path },
        );
        expect(installed.exitCode, installed.stdout + installed.stderr).toBe(0);
        expect(JSON.parse(installed.stdout)).toMatchObject({
          ok: true,
          result: { outcome: "applied" },
        });
      }

      const settings = readSettings();
      expect(settings.skills?.[directSkill]).toEqual(directDesiredEntry);
      expect(settings.skills?.[firstMember]).toBeUndefined();
      expect(settings.skills?.[secondMember]).toBeUndefined();
      expect(settings.packs?.[firstPack]).toBeDefined();
      expect(settings.packs?.[secondPack]).toBeDefined();

      const lock = readLock();
      for (const skill of [directSkill, firstMember, secondMember]) {
        expect(lock.skills?.[skill]).toBeDefined();
      }
      expect(Object.keys(lock.packs?.[firstPack]?.resolvedSkills ?? {}).sort()).toEqual(
        [`@test/skills/${directSkill}`, `@test/skills/${firstMember}`].sort(),
      );
      expect(Object.keys(lock.packs?.[secondPack]?.resolvedSkills ?? {}).sort()).toEqual(
        [`@test/skills/${directSkill}`, `@test/skills/${secondMember}`].sort(),
      );

      const trust = JSON.parse(fs.readFileSync(path.join(temp.path, ".axm", "trust.json"), "utf8"));
      expect(Object.keys(trust.records ?? {})).toEqual(
        expect.arrayContaining([
          `skill:${directSkill}`,
          `skill:${firstMember}`,
          `skill:${secondMember}`,
          `pack:${firstPack}`,
          `pack:${secondPack}`,
        ]),
      );
      expect(
        Object.values(trust.records ?? {}).filter(
          (record) =>
            typeof record === "object" &&
            record !== null &&
            Reflect.get(record, "sourceIdentity") === `@test/skills/${directSkill}`,
        ),
      ).toHaveLength(1);

      for (const skill of [directSkill, firstMember, secondMember]) {
        const canonical = path.join(temp.path, ".axm", "extensions", "@test", "skills", skill);
        const projection = path.join(temp.path, ".claude", "skills", skill);
        expect(fs.existsSync(canonical), `${skill} canonical package`).toBe(true);
        expect(fs.lstatSync(projection).isSymbolicLink(), `${skill} Claude projection`).toBe(true);
        expect(fs.realpathSync(projection)).toBe(fs.realpathSync(path.join(canonical, "src")));
      }

      const finalLint = await runCli(["lint", "--json"], { cwd: temp.path });
      expect(finalLint.exitCode, finalLint.stdout + finalLint.stderr).toBe(0);
      const lintDocument = JSON.parse(finalLint.stdout);
      expect(lintDocument).toMatchObject({ ok: true, result: { findings: [] } });
      const implicatedRules = new Set([
        "workspace/skills-lockfile-aligned",
        "workspace/skills-managed",
        "workspace/packs-dependencies-resolved",
      ]);
      expect(
        (lintDocument.result?.findings ?? []).filter((finding: unknown) => {
          if (typeof finding !== "object" || finding === null) return false;
          return implicatedRules.has(Reflect.get(finding, "ruleId"));
        }),
      ).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("installs pack from registry, updates settings and lockfile", async () => {
    const { temp, registryDir, settingsPath, lockPath, readSettings, readLock, cleanup } =
      setupWorkspaceWithRegistry();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      // Create and publish a pack first
      await runCli(["packs", "new", "installable-pack", "--yes"], { cwd: temp.path });
      await publishRegistrySkill(registryDir.path, "installable-pack-skill");
      updatePackManifest(temp.path, "installable-pack", {
        version: "0.0.1",
        dependencies: {
          "@test/skills/installable-pack-skill": "*",
        },
      });
      const publishResult = await runCli(["packs", "publish", "installable-pack", "--yes"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "e2e-test-token" },
      });
      expect(publishResult.exitCode).toBe(0);

      // Remove the pack from settings, lockfile, and disk to simulate fresh install
      // (packs new already registered it)
      detachWorkspacePack(temp.path, settingsPath, lockPath, "installable-pack");

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
    const { temp, registryDir, settingsPath, lockPath, readSettings, readLock, cleanup } =
      setupWorkspaceWithRegistry();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      // Create and publish
      await runCli(["packs", "new", "already-pack", "--yes"], { cwd: temp.path });
      await publishRegistrySkill(registryDir.path, "already-pack-skill");
      updatePackManifest(temp.path, "already-pack", {
        version: "0.0.1",
        dependencies: {
          "@test/skills/already-pack-skill": "*",
        },
      });
      const publishResult = await runCli(["packs", "publish", "already-pack", "--yes"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "e2e-test-token" },
      });
      expect(publishResult.exitCode).toBe(0);

      detachWorkspacePack(temp.path, settingsPath, lockPath, "already-pack");
      const firstInstallResult = await runCli(
        ["packs", "install", "@test/packs/already-pack", "--yes"],
        { cwd: temp.path },
      );
      expect(firstInstallResult.exitCode).toBe(0);

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

      // Manually create a skill in .axm/extensions/
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
          },
          null,
          2,
        ) + "\n",
      );

      // Publish the skill to registry
      const settingsWithSkill = readSettings();
      settingsWithSkill.skills = {
        ...settingsWithSkill.skills,
        "dep-skill": "workspace:@test/skills/dep-skill",
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
        "pack.json",
      );
      const packManifest = JSON.parse(fs.readFileSync(packManifestPath, "utf-8"));
      packManifest.dependencies = { "@test/skills/dep-skill": "1.0.0" };
      fs.writeFileSync(packManifestPath, JSON.stringify(packManifest, null, 2));
      refreshAuthoredWorkspacePackState(temp.path, "@test", "deps-pack");

      // Publish the pack (with the skill dependency)
      const packPublishResult = await runCli(["packs", "publish", "deps-pack", "--yes"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "e2e-test-token" },
      });
      expect(packPublishResult.exitCode, packPublishResult.stderr).toBe(0);

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
      const resolvedSkill = packEntry.resolvedSkills["@test/skills/dep-skill"];
      expect(resolvedSkill.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?$/);
      expect(resolvedSkill.version.startsWith("^")).toBe(false);
      expect(resolvedSkill.version.startsWith("~")).toBe(false);
      expect(resolvedSkill.publisherBindingId).toMatch(/^hbnd_/);

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
        "dep-subagent": "workspace:@test/subagents/dep-subagent",
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
        "pack.json",
      );
      const packManifest = JSON.parse(fs.readFileSync(packManifestPath, "utf-8"));
      packManifest.dependencies = { "@test/subagents/dep-subagent": "1.0.0" };
      fs.writeFileSync(packManifestPath, JSON.stringify(packManifest, null, 2));
      refreshAuthoredWorkspacePackState(temp.path, "@test", "subagent-pack");

      const packPublishResult = await runCli(["packs", "publish", "subagent-pack", "--yes"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "e2e-test-token" },
      });
      expect(packPublishResult.exitCode, packPublishResult.stderr).toBe(0);

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
        "@test/subagents/dep-subagent": {
          source: "registry",
          version: "1.0.0",
          publisherBindingId: expect.stringMatching(/^hbnd_/),
          integrity: expect.stringMatching(/^sha512-/),
        },
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
  // `sync`'s prune semantics. A follow-up issue should
  // define how prune-on-pack-update flows through the rule-driven
  // pipeline (candidate: wire a dedicated `axm packs update` verb).
  // Tracked in the Phase 7 summary.
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
        dependencies: {
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
        dependencies: {
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
      await publishRegistrySkill(registryDir.path, "preview-pack-skill");
      updatePackManifest(temp.path, "preview-pack", {
        version: "0.0.1",
        dependencies: {
          "@test/skills/preview-pack-skill": "*",
        },
      });
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
  const createWorkspacePack = async (name: string) => {
    const temp = createTempDir();
    await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
    const settingsPath = path.join(temp.path, ".axm", "settings.json");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    settings.owner = "@test";
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    const created = await runCli(["packs", "new", name, "--yes"], { cwd: temp.path });
    expect(created.exitCode, created.stdout + created.stderr).toBe(0);
    return temp;
  };

  it.each(["workspace-pack", "@test/packs/workspace-pack"])(
    "previews and uninstalls a workspace-authored pack selected as %s",
    async (selector) => {
      const temp = await createWorkspacePack("workspace-pack");
      try {
        const axmDir = path.join(temp.path, ".axm");
        const settingsPath = path.join(axmDir, "settings.json");
        const lockPath = path.join(axmDir, "axm-lock.yaml");
        const trustPath = path.join(axmDir, "trust.json");
        const packageDir = path.join(axmDir, "extensions", "@test", "packs", "workspace-pack");
        const before = {
          settings: fs.readFileSync(settingsPath, "utf8"),
          lockfile: fs.readFileSync(lockPath, "utf8"),
          trust: fs.readFileSync(trustPath, "utf8"),
          manifest: fs.readFileSync(path.join(packageDir, "pack.json"), "utf8"),
        };

        const preview = await runCli(
          ["packs", "uninstall", selector, "--preview", "--json", "--non-interactive"],
          { cwd: temp.path },
        );
        expect(preview.exitCode, preview.stdout + preview.stderr).toBe(0);
        expect(JSON.parse(preview.stdout)).toMatchObject({
          result: { outcome: "previewed", planName: "Uninstall pack", totalSteps: 1 },
        });
        expect(fs.readFileSync(settingsPath, "utf8")).toBe(before.settings);
        expect(fs.readFileSync(lockPath, "utf8")).toBe(before.lockfile);
        expect(fs.readFileSync(trustPath, "utf8")).toBe(before.trust);
        expect(fs.readFileSync(path.join(packageDir, "pack.json"), "utf8")).toBe(before.manifest);

        const applied = await runCli(
          ["packs", "uninstall", selector, "--yes", "--json", "--non-interactive"],
          { cwd: temp.path },
        );
        expect(applied.exitCode, applied.stdout + applied.stderr).toBe(0);
        expect(JSON.parse(applied.stdout)).toMatchObject({ result: { outcome: "applied" } });
        expect(JSON.parse(fs.readFileSync(settingsPath, "utf8")).packs?.["workspace-pack"]).toBe(
          undefined,
        );
        expect(YAML.parse(fs.readFileSync(lockPath, "utf8")).packs?.["workspace-pack"]).toBe(
          undefined,
        );
        expect(
          JSON.parse(fs.readFileSync(trustPath, "utf8")).records?.["pack:workspace-pack"],
        ).toBe(undefined);
        expect(fs.existsSync(packageDir)).toBe(false);
      } finally {
        temp.cleanup();
      }
    },
  );

  it("treats a same-name pack under another owner as a no-op", async () => {
    const temp = await createWorkspacePack("owned-pack");
    try {
      const result = await runCli(
        ["packs", "uninstall", "@other/packs/owned-pack", "--yes", "--json"],
        { cwd: temp.path },
      );
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ result: { outcome: "no-op" } });
      expect(
        JSON.parse(fs.readFileSync(path.join(temp.path, ".axm", "settings.json"), "utf8")).packs?.[
          "owned-pack"
        ],
      ).toBe("workspace:@test/packs/owned-pack");
    } finally {
      temp.cleanup();
    }
  });

  it("makes empty previews explicit without changing JSON plan semantics", async () => {
    const temp = createTempDir();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      const human = await runCli(["packs", "uninstall", "missing-*", "--preview"], {
        cwd: temp.path,
      });
      expect(human.exitCode, human.stdout + human.stderr).toBe(0);
      expect(human.stdout + human.stderr).toContain("No packs would be uninstalled.");

      const machine = await runCli(["packs", "uninstall", "missing-*", "--preview", "--json"], {
        cwd: temp.path,
      });
      expect(machine.exitCode, machine.stdout + machine.stderr).toBe(0);
      expect(JSON.parse(machine.stdout)).toMatchObject({
        result: { outcome: "previewed", planName: "Uninstall packs", totalSteps: 0, steps: [] },
      });
    } finally {
      temp.cleanup();
    }
  });

  it("is idempotent for a literal pack not in the lockfile or settings", async () => {
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

      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(JSON.parse(fs.readFileSync(settingsPath, "utf8"))).toEqual(settings);
    } finally {
      temp.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 9.6: packs unpack
// ---------------------------------------------------------------------------

describe("axm packs unpack", () => {
  it("fails for non-installed pack", async () => {
    const temp = createTempDir();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });

      const result = await runCli(["packs", "unpack", "nonexistent", "--yes"], { cwd: temp.path });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("not configured");
    } finally {
      temp.cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 9.7: packs list
// ---------------------------------------------------------------------------

describe("axm packs list", () => {
  it("shows empty state when no packs are installed", async () => {
    const temp = createTempDir();
    try {
      await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });

      const result = await runCli(["packs", "list"], { cwd: temp.path });

      expect(result.exitCode).toBe(0);
      expect(result.stdout + result.stderr).toContain("No packs found");
    } finally {
      temp.cleanup();
    }
  });

  it("lists installed packs after install", async () => {
    const { temp, registryDir, settingsPath, cleanup } = setupWorkspaceWithRegistry();
    try {
      await runCli(["setup", "--yes", "--agent", "claude-code"], { cwd: temp.path });
      configureRegistrySource(settingsPath, `file://${registryDir.path}`);

      await runCli(["packs", "new", "listable-pack", "--yes"], { cwd: temp.path });
      await publishRegistrySkill(registryDir.path, "listable-pack-skill");
      updatePackManifest(temp.path, "listable-pack", {
        version: "0.0.1",
        dependencies: {
          "@test/skills/listable-pack-skill": "*",
        },
      });
      const publishResult = await runCli(["packs", "publish", "listable-pack", "--yes"], {
        cwd: temp.path,
        env: { AXM_TOKEN: "e2e-test-token" },
      });
      expect(publishResult.exitCode).toBe(0);

      detachWorkspacePack(
        temp.path,
        settingsPath,
        path.join(temp.path, ".axm", "axm-lock.yaml"),
        "listable-pack",
      );

      const installResult = await runCli(
        ["packs", "install", "@test/packs/listable-pack", "--yes"],
        { cwd: temp.path },
      );
      expect(installResult.exitCode).toBe(0);

      const listResult = await runCli(["packs", "list"], { cwd: temp.path });
      expect(listResult.exitCode).toBe(0);
      const output = listResult.stdout + listResult.stderr;
      expect(output).toContain("listable-pack");
      expect(output).toContain("@test");
    } finally {
      cleanup();
    }
  });

  it("works with ls alias", async () => {
    const temp = createTempDir();
    try {
      await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });

      const result = await runCli(["packs", "ls"], { cwd: temp.path });

      expect(result.exitCode).toBe(0);
      expect(result.stdout + result.stderr).toContain("No packs found");
    } finally {
      temp.cleanup();
    }
  });
});
