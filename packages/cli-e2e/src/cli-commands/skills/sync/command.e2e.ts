import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { createTempDir, runCli } from "../../../e2e/utils.js";

const writeJson = (filePath: string, value: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

describe("axm sync configured GitHub skills", () => {
  it("repairs a missing Codex projection from trusted canonical content without fetching", async () => {
    const temp = createTempDir();
    try {
      const setup = await runCli(["setup", "--yes", "--agent", "codex"], {
        cwd: temp.path,
      });
      expect(setup.exitCode).toBe(0);

      const settingsPath = path.join(temp.path, ".axm", "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      settings.skills = {
        quality: "github:qualitymd/quality.md",
      };
      settings.sources = [
        {
          name: "github",
          type: "github",
          url: "http://127.0.0.1:1",
        },
      ];
      writeJson(settingsPath, settings);

      const canonicalDir = path.join(
        temp.path,
        ".axm",
        "extensions",
        "external",
        "skills",
        "quality",
      );
      fs.mkdirSync(canonicalDir, { recursive: true });
      fs.writeFileSync(
        path.join(canonicalDir, "SKILL.md"),
        "---\nname: quality\ndescription: Review project quality.\n---\n",
      );
      const contentIdentity = crypto
        .createHash("sha256")
        .update("SKILL.md\n---\nname: quality\ndescription: Review project quality.\n---\n")
        .digest("hex");

      const installedAt = "2026-07-29T00:00:00.000Z";
      writeJson(path.join(temp.path, ".axm", "trust.json"), {
        trustStateVersion: 1,
        records: {
          "skill:quality": {
            extensionType: "skill",
            name: "quality",
            authority: "github",
            sourceIdentity: "github:qualitymd/quality.md",
            contentIdentity,
          },
        },
      });
      fs.writeFileSync(
        path.join(temp.path, ".axm", "axm-lock.yaml"),
        YAML.stringify({
          lockfileVersion: 3,
          skills: {},
          generatedAt: installedAt,
        }),
      );

      const projection = path.join(temp.path, ".agents", "skills", "quality");
      expect(fs.existsSync(projection)).toBe(false);

      const preview = await runCli(["sync", "--dry-run", "--json"], {
        cwd: temp.path,
      });
      expect(preview.exitCode, `${preview.stderr}\n${preview.stdout}`).toBe(0);
      expect(preview.stdout).toContain("quality");
      expect(fs.existsSync(projection)).toBe(false);

      const apply = await runCli(["sync", "--json"], { cwd: temp.path });
      expect(apply.exitCode, `${apply.stderr}\n${apply.stdout}`).toBe(0);
      expect(fs.existsSync(projection)).toBe(true);
      expect(fs.lstatSync(projection).isSymbolicLink()).toBe(true);
      const trustAfter = JSON.parse(
        fs.readFileSync(path.join(temp.path, ".axm", "trust.json"), "utf8"),
      );
      expect(trustAfter.records["skill:quality"]).toEqual({
        extensionType: "skill",
        name: "quality",
        authority: "github",
        sourceIdentity: "github:qualitymd/quality.md",
        contentIdentity,
      });
      expect(JSON.parse(fs.readFileSync(settingsPath, "utf8")).skills.quality).toBe(
        "github:qualitymd/quality.md",
      );
      expect(fs.existsSync(path.join(canonicalDir, "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(canonicalDir, "skill.json"))).toBe(false);

      const firstLink = fs.readlinkSync(projection);
      const second = await runCli(["sync", "--json"], { cwd: temp.path });
      expect(second.exitCode, `${second.stderr}\n${second.stdout}`).toBe(0);
      expect(fs.readlinkSync(projection)).toBe(firstLink);
    } finally {
      temp.cleanup();
    }
  });
});
