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
import { refreshAuthoredWorkspacePackState } from "../../../e2e/workspace-pack-state.js";

/** Set up a workspace with registry source and owner. */
const setupWorkspace = async (tempPath: string, registryPath: string, owner: string) => {
  await runCli(["setup", "--yes", "--scope", "project", "--agent", "claude-code"], {
    cwd: tempPath,
  });
  const settingsPath = path.join(tempPath, "axm.json");
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  settings.sources = [{ name: "agentxm", type: "registry", location: `file://${registryPath}` }];
  settings.owner = owner;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
};

/** Create an authored skill extension. */
const createManagedSkill = (tempPath: string, owner: string, name: string, version = "1.0.0") => {
  const extensionDir = path.join(tempPath, "skills", name);
  const srcDir = path.join(extensionDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(srcDir, "SKILL.md"),
    `---\nname: "${name}"\ndescription: "Test skill"\n---\n\n# ${name}\n`,
  );
  fs.writeFileSync(
    path.join(extensionDir, "skill.json"),
    JSON.stringify(
      {
        owner,
        type: "skill",
        name,
        version,
      },
      null,
      2,
    ) + "\n",
  );
  const settingsPath = path.join(tempPath, "axm.json");
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  settings.skills = { ...settings.skills, [name]: "workspace" };
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
};

/** Create an authored pack with a pack.json manifest. */
const createManagedPack = async (
  tempPath: string,
  owner: string,
  name: string,
  manifest: {
    version: string;
    dependencies: Record<string, string>;
  },
) => {
  const createResult = await runCli(["packs", "new", name, "--owner", owner], {
    cwd: tempPath,
  });
  expect(createResult.exitCode, createResult.stderr).toBe(0);

  const packDir = path.join(tempPath, "packs", name);
  fs.writeFileSync(
    path.join(packDir, "pack.json"),
    JSON.stringify(
      {
        owner,
        type: "pack",
        name,
        ...manifest,
      },
      null,
      2,
    ) + "\n",
  );
  refreshAuthoredWorkspacePackState(tempPath, owner, name);
};

describe("axm packs publish", () => {
  describe("--include-dependencies", () => {
    it("publishes dependencies and pack", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        const owner = "@test";

        await setupWorkspace(temp.path, registryDir.path, owner);

        // Create dependency skills locally
        createManagedSkill(temp.path, owner, "dep-skill-a", "1.0.0");
        createManagedSkill(temp.path, owner, "dep-skill-b", "2.0.0");

        // Create the pack with dependencies referencing those skills
        await createManagedPack(temp.path, owner, "my-pack", {
          version: "1.0.0",
          dependencies: {
            [`${owner}/skills/dep-skill-a`]: "^1.0.0",
            [`${owner}/skills/dep-skill-b`]: "^2.0.0",
          },
        });

        // Publish with --include-dependencies
        const result = await runCli(
          ["packs", "publish", `${owner}/packs/my-pack`, "--include-dependencies"],
          { cwd: temp.path, env: { AXM_TOKEN: "e2e-test-token" } },
        );
        expect(result.exitCode).toBe(0);

        // Verify dependency skills were published to registry
        const depAIndex = path.join(
          registryDir.path,
          "extensions",
          owner,
          "skills",
          "dep-skill-a",
          "index.json",
        );
        const depBIndex = path.join(
          registryDir.path,
          "extensions",
          owner,
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
          owner,
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
        const owner = "@test";

        await setupWorkspace(temp.path, registryDir.path, owner);

        // Create dependency skill locally
        createManagedSkill(temp.path, owner, "preview-dep", "1.0.0");

        // Create the pack referencing the dependency
        await createManagedPack(temp.path, owner, "preview-pack", {
          version: "1.0.0",
          dependencies: {
            [`${owner}/skills/preview-dep`]: "^1.0.0",
          },
        });

        // Run with --preview
        const result = await runCli(
          [
            "packs",
            "publish",
            `${owner}/packs/preview-pack`,
            "--include-dependencies",
            "--preview",
            "--non-interactive",
          ],
          { cwd: temp.path, env: { AXM_TOKEN: "e2e-test-token" } },
        );
        expect(result.exitCode).toBe(0);

        // Output should mention the dependency publish step
        const output = result.stdout + result.stderr;
        expect(output).toContain(`${owner}/skills/preview-dep`);
        expect(output).toContain(`${owner}/packs/preview-pack`);
        expect(output.indexOf(`${owner}/skills/preview-dep`)).toBeLessThan(
          output.indexOf(`${owner}/packs/preview-pack`),
        );

        // Registry should NOT have anything published (preview only)
        const depIndex = path.join(
          registryDir.path,
          "extensions",
          owner,
          "skills",
          "preview-dep",
          "index.json",
        );
        const packIndex = path.join(
          registryDir.path,
          "extensions",
          owner,
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

    it("verifies an already-published dependency and continues with the pack", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        const owner = "@test";

        await setupWorkspace(temp.path, registryDir.path, owner);
        createManagedSkill(temp.path, owner, "published-dep", "1.0.0");
        await createManagedPack(temp.path, owner, "retry-pack", {
          version: "1.0.0",
          dependencies: {
            [`${owner}/skills/published-dep`]: "^1.0.0",
          },
        });

        const dependencyResult = await runCli(
          ["skills", "publish", `${owner}/skills/published-dep`],
          { cwd: temp.path, env: { AXM_TOKEN: "e2e-test-token" } },
        );
        expect(dependencyResult.exitCode, dependencyResult.stderr).toBe(0);

        const retryResult = await runCli(
          [
            "packs",
            "publish",
            `${owner}/packs/retry-pack`,
            "--include-dependencies",
            "--on-existing",
            "verify",
            "--json",
          ],
          { cwd: temp.path, env: { AXM_TOKEN: "e2e-test-token" } },
        );
        expect(retryResult.exitCode, retryResult.stderr).toBe(0);
        expect(JSON.parse(retryResult.stdout).result.execution.outcomes).toMatchObject([
          {
            name: "published-dep",
            action: "skip",
            reason: "version_already_published",
          },
          { name: "retry-pack", action: "publish", status: "success" },
        ]);

        const packIndex = path.join(
          registryDir.path,
          "extensions",
          owner,
          "packs",
          "retry-pack",
          "index.json",
        );
        expect(fs.existsSync(packIndex)).toBe(true);
      } finally {
        temp.cleanup();
        registryDir.cleanup();
      }
    });

    it("keeps an external dependency as a Registry reference instead of an upload candidate", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        const owner = "@test";

        await setupWorkspace(temp.path, registryDir.path, owner);
        createManagedSkill(temp.path, owner, "registry-dep", "1.0.0");
        const dependencyResult = await runCli(
          ["skills", "publish", `${owner}/skills/registry-dep`],
          { cwd: temp.path, env: { AXM_TOKEN: "e2e-test-token" } },
        );
        expect(dependencyResult.exitCode, dependencyResult.stderr).toBe(0);

        const settingsPath = path.join(temp.path, "axm.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        settings.skills["registry-dep"] = `${owner}/skills/registry-dep@^1.0.0`;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

        await createManagedPack(temp.path, owner, "registry-reference-pack", {
          version: "1.0.0",
          dependencies: {
            [`${owner}/skills/registry-dep`]: "^1.0.0",
          },
        });

        const result = await runCli(
          [
            "packs",
            "publish",
            `${owner}/packs/registry-reference-pack`,
            "--include-dependencies",
            "--json",
          ],
          { cwd: temp.path, env: { AXM_TOKEN: "e2e-test-token" } },
        );
        expect(result.exitCode, result.stderr).toBe(0);
        expect(JSON.parse(result.stdout).result.execution.outcomes).toMatchObject([
          {
            name: "registry-dep",
            action: "skip",
            reason: "not_authored",
          },
          {
            name: "registry-reference-pack",
            action: "publish",
            status: "success",
          },
        ]);
      } finally {
        temp.cleanup();
        registryDir.cleanup();
      }
    });

    it("does not attempt the pack when an included dependency fails preflight", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        const owner = "@test";

        await setupWorkspace(temp.path, registryDir.path, owner);
        createManagedSkill(temp.path, owner, "invalid-dep", "1.0.0");
        await createManagedPack(temp.path, owner, "blocked-pack", {
          version: "1.0.0",
          dependencies: {
            [`${owner}/skills/invalid-dep`]: "^1.0.0",
          },
        });
        fs.writeFileSync(
          path.join(temp.path, "skills", "invalid-dep", "skill.json"),
          "{ invalid json",
        );

        const result = await runCli(
          ["packs", "publish", `${owner}/packs/blocked-pack`, "--include-dependencies"],
          { cwd: temp.path, env: { AXM_TOKEN: "e2e-test-token" } },
        );
        expect(result.exitCode).not.toBe(0);

        const packIndex = path.join(
          registryDir.path,
          "extensions",
          owner,
          "packs",
          "blocked-pack",
          "index.json",
        );
        expect(fs.existsSync(packIndex)).toBe(false);
      } finally {
        temp.cleanup();
        registryDir.cleanup();
      }
    });

    it("keeps dependency-first ordering in JSON preview output", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        const owner = "@test";

        await setupWorkspace(temp.path, registryDir.path, owner);
        createManagedSkill(temp.path, owner, "json-dep", "1.0.0");
        await createManagedPack(temp.path, owner, "json-pack", {
          version: "1.0.0",
          dependencies: {
            [`${owner}/skills/json-dep`]: "^1.0.0",
          },
        });

        const result = await runCli(
          [
            "packs",
            "publish",
            `${owner}/packs/json-pack`,
            "--include-dependencies",
            "--preview",
            "--non-interactive",
            "--json",
          ],
          { cwd: temp.path, env: { AXM_TOKEN: "e2e-test-token" } },
        );
        expect(result.exitCode, result.stderr).toBe(0);
        expect(JSON.parse(result.stdout).result.execution.outcomes).toMatchObject([
          { name: "json-dep", status: "pending" },
          { name: "json-pack", status: "pending" },
        ]);
      } finally {
        temp.cleanup();
        registryDir.cleanup();
      }
    });
  });

  describe("without --include-dependencies", () => {
    it("blocks a pack when omitted dependencies are unavailable", async () => {
      const temp = createTempDir();
      const registryDir = createTempDir("axm-registry-");
      try {
        const owner = "@test";

        await setupWorkspace(temp.path, registryDir.path, owner);

        // Create dependency skill locally (should NOT be published)
        createManagedSkill(temp.path, owner, "ignored-dep", "1.0.0");

        // Create the pack referencing the dependency
        await createManagedPack(temp.path, owner, "solo-pack", {
          version: "1.0.0",
          dependencies: {
            [`${owner}/skills/ignored-dep`]: "^1.0.0",
          },
        });

        // Publish WITHOUT --include-dependencies
        const result = await runCli(["packs", "publish", `${owner}/packs/solo-pack`], {
          cwd: temp.path,
          env: { AXM_TOKEN: "e2e-test-token" },
        });
        expect(result.exitCode).toBe(9);

        // The invalid prospective graph must produce zero writes.
        const packIndex = path.join(
          registryDir.path,
          "extensions",
          owner,
          "packs",
          "solo-pack",
          "index.json",
        );
        expect(fs.existsSync(packIndex)).toBe(false);

        // Dependency skill should NOT be published
        const depIndex = path.join(
          registryDir.path,
          "extensions",
          owner,
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
