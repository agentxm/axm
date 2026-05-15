/**
 * Unit tests for the skills new handler.
 *
 * Tests profile resolution, name validation, manifest creation, SKILL.md,
 * settings registration, agent symlinks, and error paths.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import type { ExtensionName } from "@agentxm/client-core/unstable/extensions";
import { extensionName, writeWorkspaceFiles } from "../../test-stubs.js";
import { getAppError, makeWorkspaceHandlerTestContext } from "../../test-helpers.js";
import { handleSkillsNew, type SkillsNewHandlerArgs } from "./new.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  opts: {
    profile?: string;
    skills?: Record<string, unknown>;
    agents?: string[];
  } = {},
) => {
  writeWorkspaceFiles(axmDir, {
    agents: opts.agents,
    owner: opts.profile,
    skills: opts.skills,
  });
};

const defaultArgs = (
  name: string,
  overrides: Partial<SkillsNewHandlerArgs> = {},
): SkillsNewHandlerArgs => ({
  name: extensionName(name),
  profile: Option.none(),
  agents: Option.none(),
  yes: false,
  force: false,
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("skills-new.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-new-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (flagsOverrides?: {
    verbose?: boolean;
    debug?: boolean;
    nonInteractive?: boolean;
  }) => makeWorkspaceHandlerTestContext({ flags: flagsOverrides });

  describe("success", () => {
    it.effect("creates skill with manifest, SKILL.md, settings, and symlinks", () => {
      const { provide, logs, rendererState } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme", agents: ["claude-code"] });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("my-skill"));

          // Verify manifest
          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "skills",
            "my-skill",
            "skill.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(true);
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.owner).toBe("@acme");
          expect(manifest.type).toBe("skill");
          expect(manifest.name).toBe("my-skill");
          expect(manifest.version).toBe("0.0.1");

          // Verify SKILL.md
          const skillMdPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "skills",
            "my-skill",
            "src",
            "SKILL.md",
          );
          expect(fs.existsSync(skillMdPath)).toBe(true);
          const skillMd = fs.readFileSync(skillMdPath, "utf-8");
          expect(skillMd).toContain("name: my-skill");
          expect(skillMd).toContain("description: A new skill");

          // Verify settings registration
          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.skills).toBeDefined();
          expect(settings.skills["my-skill"]).toEqual({
            source: "@acme/skills/my-skill",
            authored: true,
          });

          // Verify lockfile registration
          const lockfilePath = path.join(tempDir, ".axm", "axm-lock.yaml");
          const lockfile = YAML.parse(fs.readFileSync(lockfilePath, "utf-8"));
          expect(lockfile.skills["my-skill"]).toMatchObject({
            type: "registry",
            owner: "@acme",
            name: "my-skill",
            resolvedVersion: "0.0.1",
            sourceName: "local",
            agents: ["claude-code"],
          });

          // Verify symlink
          const symlinkPath = path.join(tempDir, ".claude", "skills", "my-skill");
          expect(fs.existsSync(symlinkPath)).toBe(true);
          expect(fs.lstatSync(symlinkPath).isSymbolicLink()).toBe(true);

          expect(logs.success.some((m) => m.includes("@acme/skills/my-skill"))).toBe(true);
          expect(rendererState.suggestions).toEqual([
            {
              description:
                "Edit `.axm/extensions/@acme/skills/my-skill/src/SKILL.md` to fill in instructions",
            },
            {
              description: "Apply changes to your workspace",
              cmd: "axm sync",
            },
          ]);
        }),
      );
    });
  });

  describe("profile override", () => {
    it.effect("uses --profile override instead of workspace profile", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("my-skill", { profile: Option.some("@corp") }));

          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@corp",
            "skills",
            "my-skill",
            "skill.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(true);

          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.owner).toBe("@corp");
          expect(manifest.type).toBe("skill");
          expect(manifest.name).toBe("my-skill");
        }),
      );
    });

    it.effect("normalizes profile without @ prefix", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("my-skill", { profile: Option.some("corp") }));

          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@corp",
            "skills",
            "my-skill",
            "skill.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(true);

          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.owner).toBe("@corp");
          expect(manifest.type).toBe("skill");
          expect(manifest.name).toBe("my-skill");
        }),
      );
    });
  });

  describe("no profile configured", () => {
    it.effect("fails when no profile is configured and no --profile override", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSkillsNew(defaultArgs("my-skill")).pipe(Effect.flip);
          expect(getAppError(error).detail).toContain("No owner configured");
        }),
      );
    });
  });

  describe("name validation", () => {
    it.effect("rejects name starting with hyphen", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSkillsNew({
            ...defaultArgs("valid-name"),
            name: "-bad-name" as ExtensionName,
          }).pipe(Effect.flip);
          expect(getAppError(error).code).toBe("validation");
        }),
      );
    });

    it.effect("rejects uppercase name", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSkillsNew({
            ...defaultArgs("valid-name"),
            name: "MySkill" as ExtensionName,
          }).pipe(Effect.flip);
          expect(getAppError(error).code).toBe("validation");
        }),
      );
    });

    it.effect("rejects name exceeding 64 characters", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });
      const longName = "a".repeat(65);

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSkillsNew({
            ...defaultArgs("valid-name"),
            name: longName as ExtensionName,
          }).pipe(Effect.flip);
          expect(getAppError(error).code).toBe("validation");
        }),
      );
    });
  });

  describe("skill already exists", () => {
    it.effect("fails when skill already exists in settings", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        profile: "@acme",
        skills: { "my-skill": "@acme/skills/my-skill" },
      });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSkillsNew(defaultArgs("my-skill")).pipe(Effect.flip);
          expect(getAppError(error).detail).toContain("already exists");
        }),
      );
    });
  });

  describe("SKILL.md content", () => {
    it.effect("writes SKILL.md with frontmatter and placeholder body", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("my-tool"));

          const skillMdPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "skills",
            "my-tool",
            "src",
            "SKILL.md",
          );
          const content = fs.readFileSync(skillMdPath, "utf-8");

          // Check frontmatter
          expect(content).toMatch(/^---\n/);
          expect(content).toContain("name: my-tool");
          expect(content).toContain("description: A new skill");
          // Check body
          expect(content).toContain("Describe what this skill does");
        }),
      );
    });
  });

  describe("preview mode", () => {
    it.effect("performs no writes when preview mode is active", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { profile: "@acme", agents: ["claude-code"] });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("my-skill", { preview: true }));

          // Manifest should NOT be created
          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "skills",
            "my-skill",
            "skill.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(false);

          // Settings should NOT have the skill registered
          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.skills?.["my-skill"]).toBeUndefined();

          // Agent symlink should NOT exist
          const symlinkPath = path.join(tempDir, ".claude", "skills", "my-skill");
          expect(fs.existsSync(symlinkPath)).toBe(false);

          // Preview log message should appear
          expect(logs.info.some((m) => m.includes("Previewing"))).toBe(true);
        }),
      );
    });
  });

  describe("agent symlinks", () => {
    it.effect("creates symlinks for all configured agents", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        profile: "@acme",
        agents: ["claude-code", "cursor"],
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("my-skill"));

          const claudeLink = path.join(tempDir, ".claude", "skills", "my-skill");
          const cursorLink = path.join(tempDir, ".cursor", "skills", "my-skill");

          expect(fs.existsSync(claudeLink)).toBe(true);
          expect(fs.lstatSync(claudeLink).isSymbolicLink()).toBe(true);
          expect(fs.existsSync(cursorLink)).toBe(true);
          expect(fs.lstatSync(cursorLink).isSymbolicLink()).toBe(true);
        }),
      );
    });

    it.effect("narrows symlinks to --agent flag agents only", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        profile: "@acme",
        agents: ["claude-code", "cursor"],
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("my-skill", { agents: Option.some(["claude-code"]) }));

          const claudeLink = path.join(tempDir, ".claude", "skills", "my-skill");
          const cursorLink = path.join(tempDir, ".cursor", "skills", "my-skill");

          expect(fs.existsSync(claudeLink)).toBe(true);
          expect(fs.lstatSync(claudeLink).isSymbolicLink()).toBe(true);
          // cursor should NOT have a symlink
          expect(fs.existsSync(cursorLink)).toBe(false);
        }),
      );
    });
  });
});
