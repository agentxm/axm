import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createTempDir, runCli, SKILLS_REPO_FIXTURE } from "../../../e2e/utils.js";

describe("axm sync configured skills", () => {
  it("repairs a missing Codex projection from accepted canonical content without fetching", async () => {
    const temp = createTempDir();
    try {
      const setup = await runCli(["setup", "--yes", "--scope", "project", "--agent", "codex"], {
        cwd: temp.path,
      });
      expect(setup.exitCode).toBe(0);
      const installed = await runCli(
        ["skills", "install", SKILLS_REPO_FIXTURE, "--skill", "my-skill", "--yes"],
        { cwd: temp.path },
      );
      expect(installed.exitCode, installed.stdout + installed.stderr).toBe(0);

      const settingsPath = path.join(temp.path, "axm.json");
      const projection = path.join(temp.path, ".agents", "skills", "my-skill");
      const canonicalDir = path.dirname(fs.realpathSync(projection));
      fs.rmSync(projection, { recursive: true, force: true });
      expect(fs.existsSync(projection)).toBe(false);

      const assertion = await runCli(["sync", "--preview", "--fail-on-change", "--json"], {
        cwd: temp.path,
      });
      expect(assertion.exitCode, `${assertion.stderr}\n${assertion.stdout}`).toBe(1);
      expect(JSON.parse(assertion.stdout)).toMatchObject({
        ok: false,
        result: {
          contract: "plan-result-v3",
          outcome: "previewed",
          mode: "preview",
          divergence: true,
          counts: { total: 1, ready: 1, committed: 0 },
          units: [{ id: "skill:my-skill", state: "ready" }],
        },
      });
      expect(fs.existsSync(projection)).toBe(false);

      const preview = await runCli(["sync", "--preview", "--json"], {
        cwd: temp.path,
      });
      expect(preview.exitCode, `${preview.stderr}\n${preview.stdout}`).toBe(0);
      expect(preview.stdout).toContain("my-skill");
      expect(fs.existsSync(projection)).toBe(false);

      const apply = await runCli(["sync", "--json"], { cwd: temp.path });
      expect(apply.exitCode, `${apply.stderr}\n${apply.stdout}`).toBe(0);
      expect(fs.existsSync(projection)).toBe(true);
      expect(fs.lstatSync(projection).isSymbolicLink()).toBe(true);
      expect(fs.existsSync(path.join(temp.path, ".axm", "trust.json"))).toBe(false);
      expect(JSON.parse(fs.readFileSync(settingsPath, "utf8")).skills["my-skill"]).toBeDefined();
      expect(fs.existsSync(path.join(canonicalDir, "src", "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(canonicalDir, "skill.json"))).toBe(true);

      const firstLink = fs.readlinkSync(projection);
      const second = await runCli(["sync", "--json"], { cwd: temp.path });
      expect(second.exitCode, `${second.stderr}\n${second.stdout}`).toBe(0);
      expect(fs.readlinkSync(projection)).toBe(firstLink);

      const converged = await runCli(["sync", "--preview", "--fail-on-change", "--json"], {
        cwd: temp.path,
      });
      expect(converged.exitCode, `${converged.stderr}\n${converged.stdout}`).toBe(0);
      const convergedDocument = JSON.parse(converged.stdout);
      expect(convergedDocument).toMatchObject({
        ok: true,
        result: {
          contract: "plan-result-v3",
          outcome: "no-op",
          counts: { total: 0, committed: 0 },
        },
      });
      expect(convergedDocument.result).not.toHaveProperty("divergence");
    } finally {
      temp.cleanup();
    }
  });
});
