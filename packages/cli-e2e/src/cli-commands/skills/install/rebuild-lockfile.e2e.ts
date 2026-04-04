import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";
import { expectDefined, getOutput } from "../../../test-helpers.js";

const TEST_NAMESPACE = "@test";

const writeJson = (filePath: string, value: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const setupCrossTypeManagedState = (workspacePath: string) => {
  const settingsPath = path.join(workspacePath, ".axm", "settings.json");
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

  settings.profile = TEST_NAMESPACE;
  settings.skills = {
    ...(settings.skills ?? {}),
    "managed-skill": `${TEST_NAMESPACE}/skills/managed-skill@^1.0.0`,
  };
  settings.commands = {
    ...(settings.commands ?? {}),
    "managed-command": `${TEST_NAMESPACE}/commands/managed-command@^1.0.0`,
  };
  settings.mcpServers = {
    ...(settings.mcpServers ?? {}),
    "managed-mcp": `${TEST_NAMESPACE}/mcp-servers/managed-mcp@^1.0.0`,
  };
  settings.packs = {
    ...(settings.packs ?? {}),
    "managed-pack": `${TEST_NAMESPACE}/packs/managed-pack@^1.0.0`,
  };

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  writeJson(
    path.join(
      workspacePath,
      ".axm",
      "extensions",
      TEST_NAMESPACE,
      "skills",
      "managed-skill",
      "axm-skill.json",
    ),
    {
      owner: TEST_NAMESPACE,
      type: "skill",
      name: "managed-skill",
      version: "1.0.0",
      agents: ["claude-code"],
    },
  );

  writeJson(
    path.join(
      workspacePath,
      ".axm",
      "extensions",
      TEST_NAMESPACE,
      "commands",
      "managed-command",
      "axm-command.json",
    ),
    {
      owner: TEST_NAMESPACE,
      type: "command",
      name: "managed-command",
      version: "1.0.0",
    },
  );

  writeJson(
    path.join(
      workspacePath,
      ".axm",
      "extensions",
      TEST_NAMESPACE,
      "mcp-servers",
      "managed-mcp",
      "axm-mcp-server.json",
    ),
    {
      owner: TEST_NAMESPACE,
      type: "mcp-server",
      name: "managed-mcp",
      version: "1.0.0",
    },
  );

  writeJson(
    path.join(
      workspacePath,
      ".axm",
      "extensions",
      TEST_NAMESPACE,
      "packs",
      "managed-pack",
      "axm-pack.json",
    ),
    {
      owner: TEST_NAMESPACE,
      type: "pack",
      name: "managed-pack",
      version: "1.0.0",
      skills: {},
      commands: {},
      "mcp-servers": {},
    },
  );
};

describe("lockfile rebuild on missing/invalid lockfile", () => {
  it("regenerates full active-scope snapshot across extension types when lockfile is deleted", async () => {
    const temp = createTempDir();
    try {
      await runCli(["init", "--yes", "--non-interactive"], { cwd: temp.path });
      setupCrossTypeManagedState(temp.path);

      const lockfilePath = path.join(temp.path, ".axm", "axm-lock.yaml");
      fs.rmSync(lockfilePath, { force: true });

      const result = await runCli(
        ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "another-skill", "--yes"],
        { cwd: temp.path },
      );

      expect(result.exitCode).toBe(0);

      const lock = YAML.parse(fs.readFileSync(lockfilePath, "utf-8"));
      expect(lock.skills?.["managed-skill"]).toBeDefined();
      expect(lock.skills?.["another-skill"]).toBeDefined();
      expect(lock.commands?.["managed-command"]).toBeDefined();
      expect(lock.mcpServers?.["managed-mcp"]).toBeDefined();
      expect(lock.packs?.["managed-pack"]).toBeDefined();
    } finally {
      temp.cleanup();
    }
  });

  it("backs up invalid lockfile before regeneration", async () => {
    const temp = createTempDir();
    try {
      await runCli(["init", "--yes", "--non-interactive"], { cwd: temp.path });
      setupCrossTypeManagedState(temp.path);

      const axmDir = path.join(temp.path, ".axm");
      const lockfilePath = path.join(axmDir, "axm-lock.yaml");
      const invalidLockfile = "lockfileVersion: [broken\n";
      fs.writeFileSync(lockfilePath, invalidLockfile);

      const result = await runCli(
        ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "another-skill", "--yes"],
        { cwd: temp.path },
      );

      expect(result.exitCode).toBe(0);

      const backupFiles = fs
        .readdirSync(axmDir)
        .filter((file) => /^axm-lock\.yaml\.bak\.\d{14}$/.test(file));
      expect(backupFiles).toHaveLength(1);
      expect(fs.readFileSync(path.join(axmDir, expectDefined(backupFiles[0])), "utf-8")).toBe(
        invalidLockfile,
      );

      const lock = YAML.parse(fs.readFileSync(lockfilePath, "utf-8"));
      expect(lock.commands?.["managed-command"]).toBeDefined();
      expect(lock.mcpServers?.["managed-mcp"]).toBeDefined();
      expect(lock.packs?.["managed-pack"]).toBeDefined();
      expect(lock.skills?.["another-skill"]).toBeDefined();
    } finally {
      temp.cleanup();
    }
  });

  it("keeps --preview strict dry-run even with invalid lockfile", async () => {
    const temp = createTempDir();
    try {
      await runCli(["init", "--yes", "--non-interactive"], { cwd: temp.path });
      setupCrossTypeManagedState(temp.path);

      const axmDir = path.join(temp.path, ".axm");
      const lockfilePath = path.join(axmDir, "axm-lock.yaml");
      const invalidLockfile = "lockfileVersion: [broken\n";
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

      expect(result.exitCode).toBe(0);
      expect(getOutput(result)).toContain("Previewing changes...");
      expect(fs.readFileSync(lockfilePath, "utf-8")).toBe(invalidLockfile);

      const backupFiles = fs
        .readdirSync(axmDir)
        .filter((file) => /^axm-lock\.yaml\.bak\.\d{14}$/.test(file));
      expect(backupFiles).toHaveLength(0);

      expect(
        fs.existsSync(
          path.join(temp.path, ".axm", "extensions", "external", "skills", "another-skill"),
        ),
      ).toBe(false);
    } finally {
      temp.cleanup();
    }
  });
});
