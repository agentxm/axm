import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli } from "./e2e/utils.js";

const readAgents = (workspace: string): ReadonlyArray<string> => {
  const settings: unknown = JSON.parse(
    fs.readFileSync(path.join(workspace, ".axm", "settings.json"), "utf8"),
  );
  if (typeof settings !== "object" || settings === null || !("agents" in settings)) return [];
  return Array.isArray(settings.agents)
    ? settings.agents.filter((agent): agent is string => typeof agent === "string")
    : [];
};

const expectCleanWorkspace = async (workspace: string) => {
  const lint = await runCli(["lint", "--json"], { cwd: workspace });
  expect(lint.exitCode, `${lint.stderr}\n${lint.stdout}`).toBe(0);
};

describe("atomic agent membership lifecycle", () => {
  it("previews and applies add/remove with installed extension artifacts", async () => {
    const temp = createTempDir("axm-agent-membership-");
    try {
      const setup = await runCli(
        ["setup", "--scope", "project", "--agent", "claude-code", "--yes", "--non-interactive"],
        { cwd: temp.path },
      );
      expect(setup.exitCode, `${setup.stderr}\n${setup.stdout}`).toBe(0);
      const opencodeSkill = path.join(temp.path, ".opencode", "skills", "axm");

      const addPreview = await runCli(["agents", "add", "opencode", "--preview", "--json"], {
        cwd: temp.path,
      });
      expect(addPreview.exitCode, `${addPreview.stderr}\n${addPreview.stdout}`).toBe(0);
      expect(JSON.parse(addPreview.stdout)).toMatchObject({
        ok: true,
        result: {
          contract: "plan-result-v2",
          outcome: "previewed",
          mode: "preview",
          counts: { failed: 0, blocked: 0 },
          units: expect.arrayContaining([
            expect.objectContaining({ label: "Add opencode", state: "ready" }),
            expect.objectContaining({
              state: "ready",
              artifact: expect.objectContaining({
                path: ".opencode/skills/axm",
                agents: ["opencode"],
              }),
            }),
          ]),
        },
      });
      expect(readAgents(temp.path)).toEqual(["claude-code"]);
      expect(fs.existsSync(opencodeSkill)).toBe(false);

      const add = await runCli(["agents", "add", "opencode", "--yes", "--json"], {
        cwd: temp.path,
      });
      expect(add.exitCode, `${add.stderr}\n${add.stdout}`).toBe(0);
      expect(readAgents(temp.path)).toEqual(["claude-code", "opencode"]);
      expect(fs.existsSync(opencodeSkill)).toBe(true);
      await expectCleanWorkspace(temp.path);

      const removePreview = await runCli(["agents", "remove", "opencode", "--preview", "--json"], {
        cwd: temp.path,
      });
      expect(removePreview.exitCode, `${removePreview.stderr}\n${removePreview.stdout}`).toBe(0);
      expect(removePreview.stdout).toContain(".opencode/skills/axm");
      expect(JSON.parse(removePreview.stdout)).toMatchObject({
        ok: true,
        result: { contract: "plan-result-v2", outcome: "previewed", mode: "preview" },
      });
      expect(readAgents(temp.path)).toEqual(["claude-code", "opencode"]);
      expect(fs.existsSync(opencodeSkill)).toBe(true);

      const remove = await runCli(["agents", "remove", "opencode", "--yes", "--json"], {
        cwd: temp.path,
      });
      expect(remove.exitCode, `${remove.stderr}\n${remove.stdout}`).toBe(0);
      expect(readAgents(temp.path)).toEqual(["claude-code"]);
      expect(fs.existsSync(opencodeSkill)).toBe(false);
      await expectCleanWorkspace(temp.path);
    } finally {
      temp.cleanup();
    }
  });

  it("preserves unowned files while removing AXM-managed artifacts", async () => {
    const temp = createTempDir("axm-agent-membership-unowned-");
    try {
      const setup = await runCli(
        ["setup", "--scope", "project", "--agent", "opencode", "--yes", "--non-interactive"],
        {
          cwd: temp.path,
        },
      );
      expect(setup.exitCode, `${setup.stderr}\n${setup.stdout}`).toBe(0);
      const manualSkill = path.join(temp.path, ".opencode", "skills", "manual", "SKILL.md");
      fs.mkdirSync(path.dirname(manualSkill), { recursive: true });
      fs.writeFileSync(manualSkill, "# User-authored skill\n");

      const remove = await runCli(["agents", "remove", "opencode", "--yes", "--json"], {
        cwd: temp.path,
      });

      expect(remove.exitCode, `${remove.stderr}\n${remove.stdout}`).toBe(0);
      expect(readAgents(temp.path)).toEqual([]);
      expect(fs.readFileSync(manualSkill, "utf8")).toBe("# User-authored skill\n");
      expect(JSON.parse(remove.stdout)).toMatchObject({
        ok: true,
        result: {
          contract: "plan-result-v2",
          outcome: "applied",
          mode: "apply",
          counts: { total: 2, committed: 2, failed: 0, blocked: 0 },
          units: expect.arrayContaining([
            expect.objectContaining({
              label: "Remove managed agent artifacts",
              state: "committed",
              message: "Removed 1 managed artifact; preserved 1 unowned artifact",
              artifact: expect.objectContaining({
                targets: expect.arrayContaining([
                  expect.objectContaining({ path: ".opencode/skills/manual", change: "unchanged" }),
                ]),
              }),
            }),
          ]),
        },
      });
    } finally {
      temp.cleanup();
    }
  });
});
