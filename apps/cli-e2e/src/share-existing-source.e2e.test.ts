import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { makeEnvironmentProcessFixture } from "./test-support/environment-process-fixture.js";

describe("Sharing an existing source", () => {
  it("shares an uninitialized repository and installs its exact source selection", async () => {
    const fixture = makeEnvironmentProcessFixture();
    try {
      const source = fixture.selected;
      const skill = path.join(source, ".agents/skills/review");
      const payload = "---\r\nname: Review Display\r\ncustom: unchanged\r\n---\r\n# Review\r\n";
      fs.mkdirSync(skill, { recursive: true });
      fs.writeFileSync(path.join(skill, "SKILL.md"), payload);
      for (const args of [
        ["init", "--quiet", "--initial-branch=main"],
        ["config", "user.name", "Fixture"],
        ["config", "user.email", "fixture@example.test"],
        ["add", "."],
        ["commit", "--quiet", "-m", "fixture"],
        ["remote", "add", "origin", pathToFileURL(source).href],
      ])
        execFileSync("git", args, { cwd: source, stdio: "ignore" });
      const result = await fixture.run(["-C", source, "share", "--json", "--non-interactive"]);
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      const output: unknown = JSON.parse(result.stdout);
      expect(output).toMatchObject({
        ok: true,
        result: {
          command: "share",
          availability: "available",
          extensions: [{ type: "skill", selector: ".agents/skills/review" }],
          installCommand: `axm install --skill .agents/skills/review ${pathToFileURL(source).href}`,
        },
      });
      for (const root of [
        source,
        fixture.invoking,
        path.join(fixture.applicationHome, ".axm/workspace"),
      ]) {
        expect(fs.existsSync(path.join(root, "axm.json"))).toBe(false);
        expect(fs.existsSync(path.join(root, "axm-lock.yaml"))).toBe(false);
      }
      const installed = await fixture.run([
        "install",
        "--skill",
        ".agents/skills/review",
        pathToFileURL(source).href,
        "--agent",
        "claude-code",
        "--json",
        "--non-interactive",
      ]);
      expect(installed.exitCode, installed.stdout + installed.stderr).toBe(0);
      expect(
        fs.readFileSync(
          path.join(fixture.invoking, ".claude/skills/Review Display/SKILL.md"),
          "utf8",
        ),
      ).toBe(payload);
      expect(fs.existsSync(path.join(source, "axm.json"))).toBe(false);
      expect(fs.existsSync(path.join(source, "axm-lock.yaml"))).toBe(false);
      expect(fs.readFileSync(path.join(skill, "SKILL.md"), "utf8")).toBe(payload);
    } finally {
      fixture.cleanup();
    }
  });
});
