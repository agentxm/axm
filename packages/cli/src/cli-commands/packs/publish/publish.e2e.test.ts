/**
 * E2E tests for `axm packs publish` with dependency handling.
 *
 * Tests the --include-dependencies flag for publishing pack dependencies
 * alongside the pack itself to a local registry.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "../../../e2e/utils.js";

/** Set up a workspace with registry source and profile. */
const setupWorkspace = async (tempPath: string, registryPath: string, profile: string) => {
  await runCli(["init", "--yes", "--agent", "claude-code"], { cwd: tempPath });
  const settingsPath = path.join(tempPath, ".axm", "settings.json");
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  settings.sources = [{ name: "local", type: "registry", location: `file://${registryPath}` }];
  settings.profile = profile;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
};

/** Create a skill extension in .axm/extensions/. */
const createManagedSkill = (
  tempPath: string,
  profile: string,
  name: string,
  version: string = "1.0.0",
) => {
  const extensionDir = path.join(tempPath, ".axm", "extensions", profile, "skills", name);
  const srcDir = path.join(extensionDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(srcDir, "SKILL.md"),
    `---\nname: "${name}"\ndescription: "Test skill"\n---\n\n# ${name}\n`,
  );
  fs.writeFileSync(
    path.join(extensionDir, "axm-skill.json"),
    JSON.stringify(
      {
        profile,
        type: "skill",
        name,
        version,
        agents: ["claude-code"],
      },
      null,
      2,
    ) + "\n",
  );
};

/** Create a pack in .axm/extensions/ with an axm-pack.json manifest. */
const createManagedPack = (
  tempPath: string,
  profile: string,
  name: string,
  manifest: {
    version: string;
    skills?: Record<string, string>;
    commands?: Record<string, string>;
    "mcp-servers"?: Record<string, string>;
  },
) => {
  const packDir = path.join(tempPath, ".axm", "extensions", profile, "packs", name);
  fs.mkdirSync(packDir, { recursive: true });
  fs.writeFileSync(
    path.join(packDir, "axm-pack.json"),
    JSON.stringify(
      {
        profile,
        type: "pack",
        name,
        ...manifest,
      },
      null,
      2,
    ) + "\n",
  );
};

describe("axm packs publish", () => {
  describe("--include-dependencies", () => {
    it("publishes dependencies and pack", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        const profile = "@test";

        await setupWorkspace(temp.path, registryDir.path, profile);

        // Create dependency skills locally
        createManagedSkill(temp.path, profile, "dep-skill-a", "1.0.0");
        createManagedSkill(temp.path, profile, "dep-skill-b", "2.0.0");

        // Create the pack with dependencies referencing those skills
        createManagedPack(temp.path, profile, "my-pack", {
          version: "1.0.0",
          skills: {
            [`${profile}/skills/dep-skill-a`]: "^1.0.0",
            [`${profile}/skills/dep-skill-b`]: "^2.0.0",
          },
        });

        // Publish with --include-dependencies
        const result = await runCli(
          ["packs", "publish", `${profile}/packs/my-pack`, "--include-dependencies", "--yes"],
          { cwd: temp.path, env: { AXM_TOKEN: "e2e-test-token" } },
        );
        expect(result.exitCode).toBe(0);

        // Verify dependency skills were published to registry
        const depAIndex = path.join(
          registryDir.path,
          "extensions",
          profile,
          "skills",
          "dep-skill-a",
          "index.json",
        );
        const depBIndex = path.join(
          registryDir.path,
          "extensions",
          profile,
          "skills",
          "dep-skill-b",
          "index.json",
        );
        expect(fs.existsSync(depAIndex)).toBe(true);
        expect(fs.existsSync(depBIndex)).toBe(true);

        const depAMeta = JSON.parse(fs.readFileSync(depAIndex, "utf-8"));
        expect(depAMeta.versions[0].version).toBe("1.0.0");

        const depBMeta = JSON.parse(fs.readFileSync(depBIndex, "utf-8"));
        expect(depBMeta.versions[0].version).toBe("2.0.0");

        // Verify pack was published to registry
        const packIndex = path.join(
          registryDir.path,
          "extensions",
          profile,
          "packs",
          "my-pack",
          "index.json",
        );
        expect(fs.existsSync(packIndex)).toBe(true);

        const packMeta = JSON.parse(fs.readFileSync(packIndex, "utf-8"));
        expect(packMeta.versions[0].version).toBe("1.0.0");
      } finally {
        temp.cleanup();
        registryDir.cleanup();
      }
    });

    it("shows dependency steps in preview without applying", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        const profile = "@test";

        await setupWorkspace(temp.path, registryDir.path, profile);

        // Create dependency skill locally
        createManagedSkill(temp.path, profile, "preview-dep", "1.0.0");

        // Create the pack referencing the dependency
        createManagedPack(temp.path, profile, "preview-pack", {
          version: "1.0.0",
          skills: {
            [`${profile}/skills/preview-dep`]: "^1.0.0",
          },
        });

        // Run with --preview (no --yes)
        const result = await runCli(
          [
            "packs",
            "publish",
            `${profile}/packs/preview-pack`,
            "--include-dependencies",
            "--preview",
            "--non-interactive",
          ],
          { cwd: temp.path, env: { AXM_TOKEN: "e2e-test-token" } },
        );
        expect(result.exitCode).toBe(0);

        // Output should mention the dependency publish step
        const output = result.stdout + result.stderr;
        expect(output).toContain(`${profile}/skills/preview-dep`);
        expect(output).toContain(`${profile}/packs/preview-pack`);

        // Registry should NOT have anything published (preview only)
        const depIndex = path.join(
          registryDir.path,
          "extensions",
          profile,
          "skills",
          "preview-dep",
          "index.json",
        );
        const packIndex = path.join(
          registryDir.path,
          "extensions",
          profile,
          "packs",
          "preview-pack",
          "index.json",
        );
        expect(fs.existsSync(depIndex)).toBe(false);
        expect(fs.existsSync(packIndex)).toBe(false);
      } finally {
        temp.cleanup();
        registryDir.cleanup();
      }
    });
  });

  describe("without --include-dependencies", () => {
    it("publishes only the pack (no dependency extensions)", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        const profile = "@test";

        await setupWorkspace(temp.path, registryDir.path, profile);

        // Create dependency skill locally (should NOT be published)
        createManagedSkill(temp.path, profile, "ignored-dep", "1.0.0");

        // Create the pack referencing the dependency
        createManagedPack(temp.path, profile, "solo-pack", {
          version: "1.0.0",
          skills: {
            [`${profile}/skills/ignored-dep`]: "^1.0.0",
          },
        });

        // Publish WITHOUT --include-dependencies
        const result = await runCli(["packs", "publish", `${profile}/packs/solo-pack`, "--yes"], {
          cwd: temp.path,
          env: { AXM_TOKEN: "e2e-test-token" },
        });
        expect(result.exitCode).toBe(0);

        // Pack should be published
        const packIndex = path.join(
          registryDir.path,
          "extensions",
          profile,
          "packs",
          "solo-pack",
          "index.json",
        );
        expect(fs.existsSync(packIndex)).toBe(true);

        // Dependency skill should NOT be published
        const depIndex = path.join(
          registryDir.path,
          "extensions",
          profile,
          "skills",
          "ignored-dep",
          "index.json",
        );
        expect(fs.existsSync(depIndex)).toBe(false);
      } finally {
        temp.cleanup();
        registryDir.cleanup();
      }
    });
  });
});
