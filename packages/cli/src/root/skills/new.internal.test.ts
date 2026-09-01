/**
 * Unit tests for the skills new handler.
 *
 * Tests owner resolution, name validation, manifest creation, SKILL.md,
 * settings registration, agent symlinks, and error paths.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { CodingAgentRepositoryLive } from "@agentxm/extension-management/unstable/extension-workspace";
import type { ExtensionName } from "@agentxm/extension-model/unstable/extensions";
import { SkillManagerLive } from "@agentxm/extension-management/unstable/skills";
import { SourceHostProvidersLive } from "@agentxm/extension-management/unstable/source-resolution";
import { extensionName, writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectAppliedPlanResult,
  expectDefined,
  expectRecord,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultUnits,
  property,
} from "../../test-helpers.js";
import { handleSkillsNew, type SkillsNewHandlerArgs } from "./new.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  opts: {
    owner?: string;
    skills?: Record<string, unknown>;
    agents?: string[];
  } = {},
) => {
  writeWorkspaceFiles(axmDir, {
    agents: opts.agents,
    owner: opts.owner,
    skills: opts.skills,
  });
};

const defaultArgs = (
  name: string,
  overrides: Partial<SkillsNewHandlerArgs> = {},
): SkillsNewHandlerArgs => ({
  name: extensionName(name),
  owner: Option.none(),
  agents: Option.none(),
  yes: false,
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
  }) => {
    const ctx = makeWorkspaceHandlerTestContext({ flags: flagsOverrides });
    const sourceLayer = Layer.provide(SourceHostProvidersLive, ctx.fullLayer);
    const workspaceServiceLayer = Layer.mergeAll(
      ctx.fullLayer,
      sourceLayer,
      CodingAgentRepositoryLive,
    );
    const fullLayer = Layer.provideMerge(SkillManagerLive, workspaceServiceLayer);
    return {
      ...ctx,
      fullLayer,
      provide: makeEffectProvide(fullLayer),
    };
  };

  describe("success", () => {
    it.effect("creates skill with manifest, SKILL.md, settings, and symlinks", () => {
      const { provide, logs, rendererState } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme", agents: ["claude-code"] });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("my-skill"));

          // Verify manifest
          const manifestPath = path.join(tempDir, "skills", "my-skill", "skill.json");
          expect(fs.existsSync(manifestPath)).toBe(true);
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.owner).toBe("@acme");
          expect(manifest.type).toBe("skill");
          expect(manifest.name).toBe("my-skill");
          expect(manifest.version).toBe("0.0.1");

          // Verify SKILL.md
          const skillMdPath = path.join(tempDir, "skills", "my-skill", "src", "SKILL.md");
          expect(fs.existsSync(skillMdPath)).toBe(true);
          const skillMd = fs.readFileSync(skillMdPath, "utf-8");
          expect(skillMd).toContain("name: my-skill");
          expect(skillMd).toContain(
            "description: Describe when this skill should be triggered by the agent",
          );

          // Verify settings registration
          const settingsPath = path.join(tempDir, "axm.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.skills).toBeDefined();
          expect(settings.skills["my-skill"]).toBe("workspace");

          // Authored workspace content is desired authority and has no lock row.
          const lockfilePath = path.join(tempDir, "axm-lock.yaml");
          const lockfile = YAML.parse(fs.readFileSync(lockfilePath, "utf-8"));
          expect(lockfile.skills?.["my-skill"]).toBeUndefined();

          // Verify symlink
          const symlinkPath = path.join(tempDir, ".claude", "skills", "my-skill");
          expect(fs.existsSync(symlinkPath)).toBe(true);
          expect(fs.lstatSync(symlinkPath).isSymbolicLink()).toBe(true);

          expect(logs.success).toEqual(["Created 1 skill"]);
          expect(rendererState.summaries.some((m) => m.includes("@acme/skills/my-skill"))).toBe(
            true,
          );
          // Skills are symlinked into every agent dir on creation, so edits to
          // the canonical SKILL.md propagate automatically — no `axm sync` hint.
          expect(rendererState.suggestions).toEqual([
            {
              description: "Edit `skills/my-skill/src/SKILL.md` to fill in instructions",
            },
          ]);
        }),
      );
    });

    it.effect("emits one success line and JSON artifact targets for created surfaces", () => {
      const { provide, logs, rendererState } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        owner: "@acme",
        agents: ["antigravity", "amp", "claude-code"],
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("audit-skill"));

          expect(logs.success).toEqual(["Created 1 skill"]);
          const renderedResult = expectDefined(rendererState.results[0], "Expected JSON result");
          const result = expectAppliedPlanResult(renderedResult.data, {
            planName: "New skill",
          });
          const units = planResultUnits(result);
          const firstUnit = expectRecord(expectDefined(units[0], "Expected first unit"));
          const artifact = expectRecord(property(firstUnit, "artifact"));
          const agents = property(artifact, "agents");
          expect(agents).toEqual(["antigravity", "amp", "claude-code"]);
          const targets = property(artifact, "targets");
          if (!Array.isArray(targets)) {
            throw new Error("Expected artifact.targets array");
          }
          const targetPaths = targets.map((target) => property(expectRecord(target), "path"));
          expect(targetPaths).toEqual([
            "axm.json",
            ".agents/skills/audit-skill",
            ".claude/skills/audit-skill",
          ]);
          expect(new Set(targetPaths).size).toBe(targetPaths.length);
          const universalTarget = expectRecord(
            expectDefined(
              targets.find(
                (target) => property(expectRecord(target), "path") === ".agents/skills/audit-skill",
              ),
              "Expected universal target",
            ),
          );
          expect(property(universalTarget, "agentIds")).toEqual(["antigravity", "amp"]);
        }),
      );
    });
  });

  describe("owner override", () => {
    it.effect("rejects an owner override that conflicts with the workspace owner", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSkillsNew(
            defaultArgs("my-skill", { owner: Option.some("@corp") }),
          ).pipe(Effect.flip);
          expect(getAppError(error).code).toBe("conflict");
        }),
      );
    });

    it.effect("normalizes an owner override before checking for a conflict", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSkillsNew(
            defaultArgs("my-skill", { owner: Option.some("corp") }),
          ).pipe(Effect.flip);
          expect(getAppError(error).detail).toContain("Package owner @corp");
        }),
      );
    });
  });

  describe("no owner configured", () => {
    it.effect("fails when no owner is configured and no --owner override", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSkillsNew(defaultArgs("my-skill")).pipe(Effect.flip);
          expect(getAppError(error)).toMatchObject({
            code: "validation",
            detail: expect.stringContaining("No owner configured"),
          });
        }),
      );
    });
  });

  describe("name validation", () => {
    it.effect("rejects name starting with hyphen", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

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
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

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
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });
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
        owner: "@acme",
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
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("my-tool"));

          const skillMdPath = path.join(tempDir, "skills", "my-tool", "src", "SKILL.md");
          const content = fs.readFileSync(skillMdPath, "utf-8");

          // Check frontmatter
          expect(content).toMatch(/^---\n/);
          expect(content).toContain("name: my-tool");
          expect(content).toContain(
            "description: Describe when this skill should be triggered by the agent",
          );
          // Check body
          expect(content).toContain("Describe what this skill does");
        }),
      );
    });
  });

  describe("preview mode", () => {
    it.effect("performs no writes when preview mode is active", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { owner: "@acme", agents: ["claude-code"] });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("my-skill", { preview: true }));

          // Manifest should NOT be created
          const manifestPath = path.join(tempDir, "skills", "my-skill", "skill.json");
          expect(fs.existsSync(manifestPath)).toBe(false);

          // Settings should NOT have the skill registered
          const settingsPath = path.join(tempDir, "axm.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.skills?.["my-skill"]).toBeUndefined();

          // Agent symlink should NOT exist
          const symlinkPath = path.join(tempDir, ".claude", "skills", "my-skill");
          expect(fs.existsSync(symlinkPath)).toBe(false);

          // Preview outcome should appear
          expect(logs.info.some((m) => m.includes("Would create 1 skill"))).toBe(true);
        }),
      );
    });
  });

  describe("agent symlinks", () => {
    it.effect("creates symlinks for all configured agents", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        owner: "@acme",
        agents: ["amp", "claude-code", "cursor"],
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("my-skill"));

          const claudeLink = path.join(tempDir, ".claude", "skills", "my-skill");
          const universalLink = path.join(tempDir, ".agents", "skills", "my-skill");
          const cursorLink = path.join(tempDir, ".cursor", "skills", "my-skill");

          expect(fs.existsSync(claudeLink)).toBe(true);
          expect(fs.lstatSync(claudeLink).isSymbolicLink()).toBe(true);
          expect(fs.existsSync(universalLink)).toBe(true);
          expect(fs.lstatSync(universalLink).isSymbolicLink()).toBe(true);
          expect(fs.existsSync(cursorLink)).toBe(true);
          expect(fs.lstatSync(cursorLink).isSymbolicLink()).toBe(true);
        }),
      );
    });

    it.effect("narrows manager materialization when --agent is provided", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        owner: "@acme",
        agents: ["amp", "claude-code", "cursor"],
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("my-skill", { agents: Option.some(["claude-code"]) }));

          const claudeLink = path.join(tempDir, ".claude", "skills", "my-skill");
          const universalLink = path.join(tempDir, ".agents", "skills", "my-skill");
          const cursorLink = path.join(tempDir, ".cursor", "skills", "my-skill");

          expect(fs.existsSync(claudeLink)).toBe(true);
          expect(fs.lstatSync(claudeLink).isSymbolicLink()).toBe(true);
          expect(fs.existsSync(universalLink)).toBe(false);
          expect(fs.existsSync(cursorLink)).toBe(false);

          const lockfile = YAML.parse(
            fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8"),
          );
          expect(lockfile.skills?.["my-skill"]).toBeUndefined();
        }),
      );
    });

    it.effect("preserves a shared universal skill target requested by Codex", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        owner: "@acme",
        agents: ["codex", "claude-code"],
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(
            defaultArgs("my-skill", {
              agents: Option.some(["codex", "claude-code"]),
            }),
          );

          const codexLink = path.join(tempDir, ".agents", "skills", "my-skill");
          const claudeLink = path.join(tempDir, ".claude", "skills", "my-skill");

          expect(fs.existsSync(codexLink)).toBe(true);
          expect(fs.lstatSync(codexLink).isSymbolicLink()).toBe(true);
          expect(fs.existsSync(claudeLink)).toBe(true);
          expect(fs.lstatSync(claudeLink).isSymbolicLink()).toBe(true);
        }),
      );
    });
  });
});
