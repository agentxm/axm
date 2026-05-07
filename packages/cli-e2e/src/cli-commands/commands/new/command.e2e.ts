/**
 * E2E tests for `axm commands new` and command sync rendering.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "../../../e2e/utils.js";

const readJson = (filePath: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(filePath, "utf-8"));

const writeJson = (filePath: string, value: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const configureWorkspace = (
  workspacePath: string,
  update: (settings: Record<string, unknown>) => Record<string, unknown>,
) => {
  const settingsPath = path.join(workspacePath, ".axm", "settings.json");
  writeJson(settingsPath, update(readJson(settingsPath)));
};

const createManagedCommand = (workspacePath: string, owner: string, name: string) => {
  const commandDir = path.join(workspacePath, ".axm", "extensions", owner, "commands", name);
  writeJson(path.join(commandDir, "command.json"), {
    owner,
    type: "command",
    name,
    version: "1.0.0",
  });
  fs.mkdirSync(path.join(commandDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(commandDir, "src", `${name}.md`),
    `---\nname: ${name}\ndescription: Test command\n---\n\n# ${name}\n`,
  );
};

describe("axm commands new", () => {
  it("scaffolds and renders a command to configured agents", async () => {
    const temp = createTempDir();

    try {
      await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });
      configureWorkspace(temp.path, (settings) => ({
        ...settings,
        owner: "@test",
        agents: ["claude-code"],
      }));

      const result = await runCli(["commands", "new", "fresh-command", "--yes"], {
        cwd: temp.path,
      });
      expect(result.exitCode).toBe(0);

      expect(
        fs.existsSync(
          path.join(
            temp.path,
            ".axm",
            "extensions",
            "@test",
            "commands",
            "fresh-command",
            "src",
            "fresh-command.md",
          ),
        ),
      ).toBe(true);

      const renderedPath = path.join(temp.path, ".claude", "commands", "fresh-command.md");
      expect(fs.existsSync(renderedPath)).toBe(true);
      expect(fs.readFileSync(renderedPath, "utf-8")).toContain("Describe what this command does");

      const settings = readJson(path.join(temp.path, ".axm", "settings.json"));
      expect(settings["commands"]).toEqual({
        "fresh-command": {
          source: "@test/commands/fresh-command",
          authored: true,
        },
      });

      const lockfile = fs.readFileSync(path.join(temp.path, ".axm", "axm-lock.yaml"), "utf-8");
      expect(lockfile).toContain("fresh-command:");
      expect(lockfile).toContain(".claude/commands/fresh-command.md");
    } finally {
      temp.cleanup();
    }
  });
});

describe("axm sync command rendering", () => {
  it("renders configured command sources that are present on disk", async () => {
    const temp = createTempDir();

    try {
      await runCli(["setup", "--yes", "--non-interactive"], { cwd: temp.path });
      configureWorkspace(temp.path, (settings) => ({
        ...settings,
        owner: "@test",
        agents: ["claude-code"],
        commands: {
          review: "@test/commands/review",
        },
      }));
      createManagedCommand(temp.path, "@test", "review");

      const result = await runCli(["sync"], { cwd: temp.path });
      expect(result.exitCode).toBe(0);

      const renderedPath = path.join(temp.path, ".claude", "commands", "review.md");
      expect(fs.existsSync(renderedPath)).toBe(true);
      expect(fs.readFileSync(renderedPath, "utf-8")).toContain("# review");
    } finally {
      temp.cleanup();
    }
  });
});
