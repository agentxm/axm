import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { createTempDir, runCli } from "./e2e/utils.js";

const readJson = (filePath: string): Readonly<Record<string, unknown>> =>
  JSON.parse(fs.readFileSync(filePath, "utf8"));

const configureOwner = (workspacePath: string): void => {
  const settingsPath = path.join(workspacePath, "axm.json");
  const settings = readJson(settingsPath);
  fs.writeFileSync(settingsPath, `${JSON.stringify({ ...settings, owner: "@test" }, null, 2)}\n`);
};

describe("fork and native import", () => {
  it("imports without replacing native content, then forks the managed package", async () => {
    const temp = createTempDir();
    try {
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(setup.exitCode, setup.stderr).toBe(0);
      configureOwner(temp.path);

      const nativeDir = path.join(temp.path, ".agents", "skills", "native-review");
      fs.mkdirSync(nativeDir, { recursive: true });
      const original =
        "---\nname: native-review\ndescription: Review code\n---\n\nNative instructions.\n";
      fs.writeFileSync(path.join(nativeDir, "SKILL.md"), original);

      const imported = await runCli(
        ["skills", "import", nativeDir, "@test/skills/native-review", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(imported.exitCode, `${imported.stderr}\n${imported.stdout}`).toBe(0);
      expect(fs.readFileSync(path.join(nativeDir, "SKILL.md"), "utf8")).toBe(original);

      const importedDir = path.join(temp.path, "skills", "native-review");
      expect(readJson(path.join(importedDir, "skill.json"))).toMatchObject({
        owner: "@test",
        type: "skill",
        name: "native-review",
        version: "0.1.0",
      });
      expect(fs.readFileSync(path.join(importedDir, "src", "SKILL.md"), "utf8")).toContain(
        "name: native-review",
      );
      expect(readJson(path.join(temp.path, "axm.json"))).toMatchObject({
        skills: {
          "native-review": {
            source: "workspace",
            enabled: false,
          },
        },
      });

      const duplicate = await runCli(
        ["skills", "import", nativeDir, "@test/skills/native-review", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(duplicate.exitCode).not.toBe(0);
      expect(`${duplicate.stderr}\n${duplicate.stdout}`).toContain("Import target");
      expect(fs.readFileSync(path.join(importedDir, "src", "SKILL.md"), "utf8")).toContain(
        "name: native-review",
      );

      const forked = await runCli(
        [
          "fork",
          "workspace:@test/skills/native-review",
          "@test/skills/forked-review",
          "--non-interactive",
        ],
        { cwd: temp.path },
      );
      expect(forked.exitCode, forked.stderr).toBe(0);
      const forkedDir = path.join(temp.path, "skills", "forked-review");
      expect(readJson(path.join(forkedDir, "skill.json"))).toMatchObject({
        owner: "@test",
        type: "skill",
        name: "forked-review",
        version: "0.1.0",
      });
      expect(fs.readFileSync(path.join(forkedDir, "src", "SKILL.md"), "utf8")).toContain(
        "name: forked-review",
      );
    } finally {
      temp.cleanup();
    }
  });

  it("preview does not create a managed package", async () => {
    const temp = createTempDir();
    try {
      const nativeDir = path.join(temp.path, "native-skill");
      fs.mkdirSync(nativeDir, { recursive: true });
      fs.writeFileSync(
        path.join(nativeDir, "SKILL.md"),
        "---\nname: native-review\ndescription: Review code\n---\n\nNative instructions.\n",
      );
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(setup.exitCode, setup.stderr).toBe(0);
      configureOwner(temp.path);

      const preview = await runCli(
        [
          "skills",
          "import",
          nativeDir,
          "@test/skills/preview-review",
          "--preview",
          "--non-interactive",
        ],
        { cwd: temp.path },
      );
      expect(preview.exitCode, preview.stderr).toBe(0);
      expect(fs.existsSync(path.join(temp.path, "skills", "preview-review"))).toBe(false);
    } finally {
      temp.cleanup();
    }
  });

  it("imports native subagents and rejects cross-type targets before mutation", async () => {
    const temp = createTempDir();
    try {
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(setup.exitCode, setup.stderr).toBe(0);
      configureOwner(temp.path);

      const nativeFile = path.join(temp.path, "reviewer.md");
      const original = "---\nname: native-reviewer\nmodel: fast\n---\n\nReview carefully.\n";
      fs.writeFileSync(nativeFile, original);

      const mismatched = await runCli(
        ["skills", "import", nativeFile, "@test/subagents/wrong-group", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(mismatched.exitCode).not.toBe(0);
      expect(mismatched.stderr).toContain("Expected a skills target FQN");
      expect(fs.existsSync(path.join(temp.path, "subagents", "wrong-group"))).toBe(false);

      const imported = await runCli(
        ["subagents", "import", nativeFile, "@test/subagents/reviewer", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(imported.exitCode, `${imported.stderr}\n${imported.stdout}`).toBe(0);
      expect(fs.readFileSync(nativeFile, "utf8")).toBe(original);
      expect(
        readJson(path.join(temp.path, "subagents", "reviewer", "subagent.json")),
      ).toMatchObject({ owner: "@test", type: "subagent", name: "reviewer", version: "0.1.0" });
      expect(
        fs.readFileSync(
          path.join(temp.path, "subagents", "reviewer", "src", "reviewer.md"),
          "utf8",
        ),
      ).toContain("name: reviewer");
    } finally {
      temp.cleanup();
    }
  });

  it("imports a lossless remote MCP config as a disabled authored package", async () => {
    const temp = createTempDir();
    try {
      const nativeConfig = {
        mcpServers: {
          context: {
            url: "https://mcp.example.test/context",
            headers: { Authorization: "Bearer ${CONTEXT_TOKEN}" },
          },
        },
      };
      fs.writeFileSync(
        path.join(temp.path, ".mcp.json"),
        `${JSON.stringify(nativeConfig, null, 2)}\n`,
      );
      const setup = await runCli(
        ["setup", "--yes", "--scope", "project", "--agent", "claude-code", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(setup.exitCode, setup.stderr).toBe(0);
      configureOwner(temp.path);

      const imported = await runCli(
        ["mcps", "import", "--as", "@test/mcps/context", "--non-interactive", "--json"],
        { cwd: temp.path },
      );
      expect(imported.exitCode, `${imported.stderr}\n${imported.stdout}`).toBe(0);
      expect(readJson(path.join(temp.path, ".mcp.json"))).toEqual({ mcpServers: {} });
      expect(readJson(path.join(temp.path, "mcps", "context", "mcp.json"))).toMatchObject({
        owner: "@test",
        type: "mcp-server",
        name: "context",
        version: "0.1.0",
        server: {
          remotes: [
            {
              type: "streamable-http",
              url: "https://mcp.example.test/context",
            },
          ],
        },
      });

      const forked = await runCli(
        ["fork", "workspace:@test/mcps/context", "@test/mcps/context-fork", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(forked.exitCode, `${forked.stderr}\n${forked.stdout}`).toBe(0);
      expect(readJson(path.join(temp.path, "mcps", "context-fork", "mcp.json"))).toMatchObject({
        owner: "@test",
        type: "mcp-server",
        name: "context-fork",
        version: "0.1.0",
      });
    } finally {
      temp.cleanup();
    }
  });
});
