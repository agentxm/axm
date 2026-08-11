import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { createTempDir, runCli } from "./e2e/utils.js";

const writeSkill = (root: string, name: string, managed: boolean): string => {
  const directory = path.join(root, ".claude", "skills", name);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, "SKILL.md"),
    `${managed ? "<!-- AXM managed file — do not edit directly -->\n" : ""}# ${name}\n`,
  );
  return directory;
};

describe("axm prune", () => {
  it("previews ownership evidence and never removes an unowned artifact", async () => {
    const temp = createTempDir();
    try {
      const env = { HOME: temp.path, AXM_USER_HOME: temp.path };
      const setup = await runCli(["setup", "--agent", "claude-code", "--yes"], {
        cwd: temp.path,
        env,
      });
      expect(setup.exitCode).toBe(0);

      const managed = writeSkill(temp.path, "stale-managed", true);
      const unknown = writeSkill(temp.path, "unknown", false);

      const preview = await runCli(["prune", "--preview", "--json"], { cwd: temp.path, env });
      expect(preview.exitCode, `${preview.stderr}\n${preview.stdout}`).toBe(0);
      expect(JSON.parse(preview.stdout)).toEqual(
        expect.objectContaining({
          ok: true,
          result: expect.objectContaining({
            outcome: "previewed",
            steps: expect.arrayContaining([
              expect.objectContaining({
                label: expect.stringContaining("managed-marker:.claude/skills/stale-managed"),
                status: "ready",
              }),
              expect.objectContaining({
                label: expect.stringContaining("no-axm-ownership-marker"),
                status: "warning",
              }),
            ]),
          }),
        }),
      );
      expect(fs.existsSync(managed)).toBe(true);
      expect(fs.existsSync(unknown)).toBe(true);

      const applied = await runCli(["prune", "--json"], { cwd: temp.path, env });
      expect(applied.exitCode, `${applied.stderr}\n${applied.stdout}`).toBe(0);
      expect(fs.existsSync(managed)).toBe(false);
      expect(fs.existsSync(unknown)).toBe(true);
    } finally {
      temp.cleanup();
    }
  });
});
