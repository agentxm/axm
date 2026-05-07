/**
 * E2E tests for `axm subagents publish`.
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
  settings.owner = owner;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
};

const createManagedSubagent = (
  workspacePath: string,
  owner: string,
  name: string,
  version: string,
) => {
  const extensionDir = path.join(workspacePath, ".axm", "extensions", owner, "subagents", name);
  const srcDir = path.join(extensionDir, "src");

  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(
    path.join(srcDir, `${name}.md`),
    ["---", `name: "${name}"`, 'description: "A test subagent"', "---", "", `# ${name}`, ""].join(
      "\n",
    ),
  );
  fs.writeFileSync(
    path.join(extensionDir, "subagent.json"),
    JSON.stringify(
      {
        owner,
        type: "subagent",
        name,
        version,
      },
      null,
      2,
    ) + "\n",
  );
};

describe("axm subagents publish", () => {
  it("publishes a subagent with manifest and <name>.md in the archive", async () => {
    const temp = createTempDir();
    const registryDir = createTempDir("axm-registry-");

    try {
      await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });
      configureWorkspaceRegistry(temp.path, registryDir.path, "@test");
      createManagedSubagent(temp.path, "@test", "researcher", "1.0.0");

      const publishResult = await runCli(
        ["subagents", "publish", "@test/subagents/researcher", "--yes"],
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
        "subagents",
        "researcher",
      );
      const registryIndexPath = path.join(extensionDir, "index.json");
      expect(fs.existsSync(registryIndexPath)).toBe(true);

      const index = JSON.parse(fs.readFileSync(registryIndexPath, "utf-8"));
      expect(index.name).toBe("researcher");
      expect(index.owner).toBe("@test");
      expect(index.type).toBe("subagent");
      expect(index.versions).toHaveLength(1);
      expect(index.versions[0]?.version).toBe("1.0.0");
      expect(index.versions[0]?.integrity).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/);

      const archivePath = path.join(extensionDir, "1.0.0.zip");
      expect(fs.existsSync(archivePath)).toBe(true);

      const archiveEntries = Object.keys(unzipSync(fs.readFileSync(archivePath)));
      expect(archiveEntries).toContain("subagent.json");
      expect(archiveEntries).toContain("src/researcher.md");
    } finally {
      temp.cleanup();
      registryDir.cleanup();
    }
  });
});
