/**
 * Unit tests for the disable command handler.
 *
 * Tests validation logic and plan building.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { computeSourceHash } from "@agentxm/workspace-state";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectNoOpPlanResult,
  getAppError,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { handleDisable, type DisableHandlerArgs } from "./disable.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  skills: Record<string, unknown> = {},
  lockfileSkills: Record<string, unknown> = {},
  agents: string[] = ["claude-code"],
  opts?: { packs?: Record<string, unknown>; lockfilePacks?: Record<string, unknown> },
) => {
  const configuredSkills = Object.keys(skills).length > 0 ? skills : undefined;
  const configuredPacks =
    opts?.packs && Object.keys(opts.packs).length > 0 ? opts.packs : undefined;
  writeWorkspaceFiles(axmDir, {
    agents,
    skills: configuredSkills,
    packs: configuredPacks,
    lockfileSkills,
    lockfilePacks: opts?.lockfilePacks,
  });
};

const makeLockEntry = (agents: string[] = ["claude-code"]) => ({
  type: "local",
  path: "installed",
  agents,
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const defaultArgs = (
  name: string,
  overrides: Partial<DisableHandlerArgs> = {},
): DisableHandlerArgs => ({
  name,
  yes: true,
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("disable.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "disable-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: Parameters<typeof makeWorkspaceHandlerTestContext>[0]) =>
    makeWorkspaceHandlerTestContext(opts);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  describe("validation", () => {
    it.effect("fails when skill does not exist", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleDisable(defaultArgs("nonexistent")).pipe(Effect.flip);
          expect(getAppError(error).detail).toContain("is not installed");
        }),
      );
    });

    it.effect("fails when skill is not found", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {});

      return provide(
        Effect.gen(function* () {
          const error = yield* handleDisable(defaultArgs("nonexistent")).pipe(Effect.flip);
          expect(getAppError(error).detail).toContain("is not installed");
        }),
      );
    });

    it.effect("no-op when skill is already disabled", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": { source: "local", enabled: false } },
        { "my-skill": makeLockEntry() },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleDisable(defaultArgs("my-skill"));

          expect(logs.info.some((m) => m.includes("already disabled"))).toBe(false);
          expect(logs.success.some((m) => m.includes("already disabled"))).toBe(true);
          expect(logs.success.some((m) => m.includes("Nothing to do"))).toBe(false);
        }),
      );
    });

    it.effect("emits JSON no-op when skill is already disabled", () => {
      const { provide, logs, rendererState } = makeLayers({ machine: true });
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": { source: "local", enabled: false } },
        { "my-skill": makeLockEntry() },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleDisable(defaultArgs("my-skill"));

          expect(logs.success).toEqual([]);
          const result = expectNoOpPlanResult(rendererState.results[0]?.data, {
            planName: "Disable skill",
            message: "Skill 'my-skill' is already disabled",
          });
          expect(result).toMatchObject({ planDescription: "Disable my-skill" });
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Preview flag
  // ---------------------------------------------------------------------------

  describe("preview flag", () => {
    it.effect("previews disable without modifying settings or lockfile", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": "local" },
        { "my-skill": makeLockEntry() },
      );
      // Create canonical skill directory (preserved after disable)
      const canonicalDir = path.join(tempDir, "agent_extensions", "external", "skills", "my-skill");
      fs.mkdirSync(canonicalDir, { recursive: true });
      fs.writeFileSync(path.join(canonicalDir, "SKILL.md"), "# my-skill");

      // Create agent symlink directory (would be removed on actual disable)
      const agentSkillDir = path.join(tempDir, ".claude", "skills", "my-skill");
      fs.mkdirSync(agentSkillDir, { recursive: true });
      fs.writeFileSync(path.join(agentSkillDir, "SKILL.md"), "# my-skill");

      return provide(
        Effect.gen(function* () {
          yield* handleDisable(defaultArgs("my-skill", { preview: true }));

          // Settings should still show enabled (preview = no side effects)
          const settingsContent = fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8");
          const settings = JSON.parse(settingsContent);
          expect(settings.skills?.["my-skill"]).toBe("local");

          // Canonical directory should still exist
          expect(fs.existsSync(canonicalDir)).toBe(true);

          // Agent symlink should still exist (not removed in preview)
          expect(fs.existsSync(agentSkillDir)).toBe(true);

          // Lockfile should be unchanged
          const lockContent = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.skills["my-skill"]).toBeDefined();

          // Preview outcome should be displayed
          expect(logs.info.some((m) => m.includes("Would disable 1 skill"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Transitive skill disable (direct entry promotion)
  // ---------------------------------------------------------------------------

  describe("implicit skill disable (pack-derived entry promotion)", () => {
    it.effect("creates direct entry when disabling implicit skill", () => {
      const { provide, logs } = makeLayers();
      const axmDir = path.join(tempDir, ".axm");
      const skillDir = path.join(
        tempDir,
        "agent_extensions",
        "agentxm",
        "@acme",
        "skills",
        "code-review",
      );
      fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(skillDir, "src", "SKILL.md"), "# code-review");

      const packDir = path.join(tempDir, "packs", "starter-pack");
      fs.mkdirSync(packDir, { recursive: true });
      fs.writeFileSync(
        path.join(packDir, "pack.json"),
        JSON.stringify({
          owner: "@acme",
          type: "pack",
          name: "starter-pack",
          version: "1.0.0",
          dependencies: {
            "@acme/skills/code-review": "^1.0.0",
          },
        }),
      );

      initWorkspace(
        axmDir,
        {},
        {
          "code-review": {
            type: "registry",
            owner: "@acme",
            name: "code-review",
            resolvedVersion: "1.2.0",
            integrity: "sha512-AAAA==",
            sourceName: "agentxm",
            publisherBindingId: "hbnd_test",
            sourceHash: computeSourceHash("SKILL.md\n# code-review"),
            agents: ["claude-code"],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        ["claude-code"],
        {
          packs: { "starter-pack": "workspace" },
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleDisable(defaultArgs("code-review"));

          expect(logs.success.length).toBeGreaterThan(0);
          expect(logs.success.some((m) => m.includes("Done"))).toBe(false);

          // Settings should have a new direct entry with enabled: false
          const settingsContent = fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8");
          const settings = JSON.parse(settingsContent);
          expect(settings.skills?.["code-review"]).toEqual({
            source: "@acme/skills/code-review@^1.0.0",
            enabled: false,
          });
        }),
      );
    });

    it.effect("fails when skill not in configured or installed", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {}, {}, ["claude-code"]);

      return provide(
        Effect.gen(function* () {
          const error = yield* handleDisable(defaultArgs("nonexistent")).pipe(Effect.flip);
          expect(getAppError(error).detail).toContain("is not installed");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Settings-only disable (no lock entry)
  // ---------------------------------------------------------------------------

  describe("settings-only disable (no lock entry)", () => {
    it.effect("disables a configured skill with no lockfile entry", () => {
      const { provide, logs } = makeLayers();
      // Skill in settings as enabled (string form) but not in lockfile
      initWorkspace(path.join(tempDir, ".axm"), { "my-skill": "@acme/skills/my-skill" }, {}, [
        "claude-code",
      ]);

      return provide(
        Effect.gen(function* () {
          yield* handleDisable(defaultArgs("my-skill"));

          expect(logs.success.length).toBeGreaterThan(0);
          expect(logs.success.some((m) => m.includes("Done"))).toBe(false);

          // Settings should show disabled
          const settingsContent = fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8");
          const settings = JSON.parse(settingsContent);
          expect(settings.skills?.["my-skill"]).toEqual({
            source: "@acme/skills/my-skill",
            enabled: false,
          });
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Plan execution
  // ---------------------------------------------------------------------------

  describe("plan execution", () => {
    it.effect("builds and resolves disable plan for enabled skill", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": "local" },
        { "my-skill": makeLockEntry() },
      );
      // Create canonical skill directory (preserved after disable)
      const canonicalDir = path.join(tempDir, "agent_extensions", "external", "skills", "my-skill");
      fs.mkdirSync(canonicalDir, { recursive: true });
      fs.writeFileSync(path.join(canonicalDir, "SKILL.md"), "# my-skill");

      // Create agent symlink directory (removed on disable)
      const agentSkillDir = path.join(tempDir, ".claude", "skills", "my-skill");
      fs.mkdirSync(agentSkillDir, { recursive: true });
      fs.writeFileSync(path.join(agentSkillDir, "SKILL.md"), "# my-skill");

      return provide(
        Effect.gen(function* () {
          yield* handleDisable(defaultArgs("my-skill"));

          expect(logs.success.length).toBeGreaterThan(0);
          expect(logs.success.some((m) => m.includes("Done"))).toBe(false);

          // Settings should show disabled
          const settingsContent = fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8");
          const settings = JSON.parse(settingsContent);
          expect(settings.skills?.["my-skill"]).toEqual({ source: "local", enabled: false });

          // Canonical directory should be preserved
          expect(fs.existsSync(canonicalDir)).toBe(true);

          // Agent symlink directory should be removed
          expect(fs.existsSync(agentSkillDir)).toBe(false);
        }),
      );
    });
  });
});
