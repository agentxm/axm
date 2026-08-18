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
  it("repairs a missing Codex projection from accepted canonical content without fetching", async () => {
    const temp = createTempDir();
    try {
      const setup = await runCli(["setup", "--yes", "--scope", "project", "--agent", "codex"], {
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
      const skillContents = "---\nname: quality\ndescription: Review project quality.\n---\n";
      fs.writeFileSync(path.join(canonicalDir, "SKILL.md"), skillContents);
      const packageContentDigest = crypto
        .createHash("sha256")
        .update("SKILL.md")
        .update("\0")
        .update(skillContents)
        .update("\0")
        .digest("hex");
      const canonicalContentIdentity = crypto
        .createHash("sha256")
        .update(packageContentDigest)
        .digest("hex");

      fs.writeFileSync(
        path.join(temp.path, ".axm", "axm-lock.yaml"),
        YAML.stringify({
          lockfileVersion: 4,
          skills: {
            quality: {
              type: "github",
              owner: "qualitymd",
              repo: "quality.md",
              resolvedCommit: "0123456789abcdef",
              resolvedTree: "fedcba9876543210",
              contentIdentity: canonicalContentIdentity,
            },
          },
        }),
      );

      const projection = path.join(temp.path, ".agents", "skills", "quality");
      expect(fs.existsSync(projection)).toBe(false);

      const assertion = await runCli(["sync", "--preview", "--fail-on-change", "--json"], {
        cwd: temp.path,
      });
      expect(assertion.exitCode, `${assertion.stderr}\n${assertion.stdout}`).toBe(1);
      expect(JSON.parse(assertion.stdout)).toMatchObject({
        ok: false,
        result: {
          outcome: "reconciliation-required",
          reconciliationRequired: true,
          appliedCount: 0,
          steps: [{ status: "ready" }],
        },
      });
      expect(fs.existsSync(projection)).toBe(false);

      const preview = await runCli(["sync", "--preview", "--json"], {
        cwd: temp.path,
      });
      expect(preview.exitCode, `${preview.stderr}\n${preview.stdout}`).toBe(0);
      expect(preview.stdout).toContain("quality");
      expect(fs.existsSync(projection)).toBe(false);

      const apply = await runCli(["sync", "--json"], { cwd: temp.path });
      expect(apply.exitCode, `${apply.stderr}\n${apply.stdout}`).toBe(0);
      expect(fs.existsSync(projection)).toBe(true);
      expect(fs.lstatSync(projection).isSymbolicLink()).toBe(true);
      expect(fs.existsSync(path.join(temp.path, ".axm", "trust.json"))).toBe(false);
      expect(JSON.parse(fs.readFileSync(settingsPath, "utf8")).skills.quality).toBe(
        "github:qualitymd/quality.md",
      );
      expect(fs.existsSync(path.join(canonicalDir, "SKILL.md"))).toBe(true);
      expect(fs.existsSync(path.join(canonicalDir, "skill.json"))).toBe(false);

      const firstLink = fs.readlinkSync(projection);
      const second = await runCli(["sync", "--json"], { cwd: temp.path });
      expect(second.exitCode, `${second.stderr}\n${second.stdout}`).toBe(0);
      expect(fs.readlinkSync(projection)).toBe(firstLink);

      const converged = await runCli(["sync", "--preview", "--fail-on-change", "--json"], {
        cwd: temp.path,
      });
      expect(converged.exitCode, `${converged.stderr}\n${converged.stdout}`).toBe(0);
      expect(JSON.parse(converged.stdout)).toMatchObject({
        ok: true,
        result: {
          outcome: "no-op",
          reconciliationRequired: false,
        },
      });
    } finally {
      temp.cleanup();
    }
  });
});
