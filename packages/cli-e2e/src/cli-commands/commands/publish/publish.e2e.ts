/**
 * E2E tests for `axm commands publish`.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "../../../e2e/utils.js";

const configureWorkspaceRegistry = (workspacePath: string, registryPath: string, owner: string) => {
  const settingsPath = path.join(workspacePath, ".axm", "settings.json");
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  settings.sources = [{ name: "local", type: "registry", location: `file://${registryPath}` }];
  settings.profile = owner;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
};

const createManagedCommand = (
  workspacePath: string,
  owner: string,
  name: string,
  version: string,
) => {
  const extensionDir = path.join(workspacePath, ".axm", "extensions", owner, "commands", name);
  const srcDir = path.join(extensionDir, "src");

  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(srcDir, "COMMAND.md"),
    `---\nname: "${name}"\ndescription: "A test command"\n---\n\n# ${name}\n`,
  );
  fs.writeFileSync(
    path.join(extensionDir, "command.json"),
    JSON.stringify(
      {
        owner,
        type: "command",
        name,
        version,
      },
      null,
      2,
    ) + "\n",
  );
};

describe("axm commands publish", () => {
  it("publishes a command with manifest and COMMAND.md in the archive", async () => {
    const temp = createTempDir();
    const registryDir = createTempDir("axm-registry-");

    try {
      await runCli(["init", "--yes", "--non-interactive"], { cwd: temp.path });
      configureWorkspaceRegistry(temp.path, registryDir.path, "@test");
      createManagedCommand(temp.path, "@test", "my-command", "1.0.0");

      const publishResult = await runCli(
        ["commands", "publish", "@test/commands/my-command", "--yes"],
        {
          cwd: temp.path,
          env: { AXM_TOKEN: "e2e-test-token" },
        },
      );
      expect(publishResult.exitCode).toBe(0);

      const extensionDir = path.join(
        registryDir.path,
        "extensions",
        "@test",
        "commands",
        "my-command",
      );
      const registryIndexPath = path.join(extensionDir, "index.json");
      expect(fs.existsSync(registryIndexPath)).toBe(true);

      const index = JSON.parse(fs.readFileSync(registryIndexPath, "utf-8"));
      expect(index.name).toBe("my-command");
      expect(index.owner).toBe("@test");
      expect(index.type).toBe("command");
      expect(index.versions).toHaveLength(1);
      expect(index.versions[0]?.version).toBe("1.0.0");
      expect(index.versions[0]?.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/);

      const archivePath = path.join(extensionDir, "1.0.0.zip");
      expect(fs.existsSync(archivePath)).toBe(true);

      const archiveEntries = Object.keys(unzipSync(fs.readFileSync(archivePath)));
      expect(archiveEntries).toContain("command.json");
      expect(archiveEntries).toContain("src/COMMAND.md");
    } finally {
      temp.cleanup();
      registryDir.cleanup();
    }
  });

  it("publishes a command scaffolded by `commands new`", async () => {
    const temp = createTempDir();
    const registryDir = createTempDir("axm-registry-");

    try {
      await runCli(["init", "--yes", "--non-interactive"], { cwd: temp.path });
      configureWorkspaceRegistry(temp.path, registryDir.path, "@test");

      const newResult = await runCli(
        ["commands", "new", "fresh-command", "--profile", "@test", "--yes"],
        { cwd: temp.path },
      );
      expect(newResult.exitCode).toBe(0);

      const managedDir = path.join(
        temp.path,
        ".axm",
        "extensions",
        "@test",
        "commands",
        "fresh-command",
      );
      expect(fs.existsSync(path.join(managedDir, "command.json"))).toBe(true);
      expect(fs.existsSync(path.join(managedDir, "src", "COMMAND.md"))).toBe(true);

      const publishResult = await runCli(
        ["commands", "publish", "@test/commands/fresh-command", "--yes"],
        {
          cwd: temp.path,
          env: { AXM_TOKEN: "e2e-test-token" },
        },
      );
      expect(publishResult.exitCode).toBe(0);

      const extensionDir = path.join(
        registryDir.path,
        "extensions",
        "@test",
        "commands",
        "fresh-command",
      );
      const archivePath = path.join(extensionDir, "0.1.0.zip");
      expect(fs.existsSync(path.join(extensionDir, "index.json"))).toBe(true);
      expect(fs.existsSync(archivePath)).toBe(true);

      const archiveEntries = Object.keys(unzipSync(fs.readFileSync(archivePath)));
      expect(archiveEntries).toContain("command.json");
      expect(archiveEntries).toContain("src/COMMAND.md");
    } finally {
      temp.cleanup();
      registryDir.cleanup();
    }
  });
});
