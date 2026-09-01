/**
 * Unit tests for the enable command handler.
 *
 * Tests validation logic and plan building.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";
import {
  computeMaterializedTreeIntegritySync,
  computePackageContentHashSync,
  extensionName,
  writeWorkspaceFiles,
} from "../../test-stubs.js";
import { computeSourceHash } from "@agentxm/extension-management/unstable/workspace";
import {
  expectNoOpPlanResult,
  getAppError,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { handleEnable, type EnableHandlerArgs } from "./enable.js";

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

const makeLockEntry = (_agents: string[] = ["claude-code"], sourceHash?: string) => ({
  type: "local",
  path: "installed",
  ...(sourceHash === undefined ? {} : { sourceHash }),
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const defaultArgs = (
  name: string,
  overrides: Partial<EnableHandlerArgs> = {},
): EnableHandlerArgs => ({
  name: extensionName(name),
  yes: true,
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("enable.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "enable-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: Parameters<typeof makeWorkspaceHandlerTestContext>[0]) =>
    makeWorkspaceHandlerTestContext(opts);

  // ---------------------------------------------------------------------------
  // Validation: skill not found
  // ---------------------------------------------------------------------------

  describe("validation", () => {
    it.effect("fails when skill does not exist", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleEnable(defaultArgs("nonexistent")).pipe(Effect.flip);
          expect(getAppError(error).detail).toContain("is not installed");
        }),
      );
    });

    it.effect("fails when skill is not found", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {});

      return provide(
        Effect.gen(function* () {
          const error = yield* handleEnable(defaultArgs("nonexistent")).pipe(Effect.flip);
          expect(getAppError(error).detail).toContain("is not installed");
        }),
      );
    });

    it.effect("no-op when skill is already enabled", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": "local" },
        {
          "my-skill": makeLockEntry(["claude-code"], computeSourceHash("SKILL.md\n# my-skill")),
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleEnable(defaultArgs("my-skill"));

          expect(logs.info.some((m) => m.includes("already enabled"))).toBe(false);
          expect(logs.success.some((m) => m.includes("already enabled"))).toBe(true);
          expect(logs.success.some((m) => m.includes("Nothing to do"))).toBe(false);
        }),
      );
    });

    it.effect("emits JSON no-op when skill is already enabled", () => {
      const { provide, logs, rendererState } = makeLayers({ machine: true });
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": "local" },
        { "my-skill": makeLockEntry() },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleEnable(defaultArgs("my-skill"));

          expect(logs.success).toEqual([]);
          const result = expectNoOpPlanResult(rendererState.results[0]?.data, {
            planName: "Enable skill",
            message: "Skill 'my-skill' is already enabled",
          });
          expect(result).toMatchObject({ planDescription: "Enable my-skill" });
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Promoted transitive skill re-enable
  // ---------------------------------------------------------------------------

  describe("promoted skill re-enable", () => {
    it.effect("re-enables promoted transitive skill by updating settings", () => {
      const { provide } = makeLayers();
      const skillDir = path.join(
        tempDir,
        "agent_extensions",
        "agentxm",
        "@acme",
        "skills",
        "code-review",
        "src",
      );
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(path.dirname(skillDir), "skill.json"),
        JSON.stringify({
          owner: "@acme",
          type: "skill",
          name: "code-review",
          version: "1.2.0",
        }),
      );
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# code-review");
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

      // Skill was promoted to direct via disable and remains desired through the pack.
      initWorkspace(
        path.join(tempDir, ".axm"),
        {
          "code-review": {
            source: "@acme/skills/code-review",
            enabled: false,
          },
        },
        {
          "code-review": {
            type: "registry",
            owner: "@acme",
            name: "code-review",
            resolvedVersion: "1.2.0",
            integrity: "sha512-AAAA==",
            sourceName: "agentxm",
            publisherBindingId: "hbnd_test",
            sourceHash: computePackageContentHashSync(path.dirname(skillDir)),
            treeIntegrity: computeMaterializedTreeIntegritySync(path.dirname(skillDir)),
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
          yield* handleEnable(defaultArgs("code-review"));

          // Settings should show re-enabled (collapsed to string form)
          const settingsContent = fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8");
          const settings = JSON.parse(settingsContent);
          expect(settings.skills?.["code-review"]).toBe("@acme/skills/code-review");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Settings-only enable (no lock entry)
  // ---------------------------------------------------------------------------

  describe("settings-only enable (no lock entry)", () => {
    it.effect("refuses to enable a configured-disabled skill without trusted content", () => {
      const { provide, logs } = makeLayers();
      // Skill in settings as disabled but not in lockfile
      initWorkspace(
        path.join(tempDir, ".axm"),
        {
          "my-skill": {
            source: "@acme/skills/my-skill",
            enabled: false,
          },
        },
        {},
        ["claude-code"],
      );

      return provide(
        Effect.gen(function* () {
          yield* handleEnable(defaultArgs("my-skill"));

          // Apply mode renders no planned block; the refusal is the terminal
          // failed-outcome block.
          expect(logs.success).toEqual([]);
          expect(logs.error).toEqual([
            "Failed to enable 1 skill",
            '  Accepted skill content for "my-skill" is not usable (not_found)',
            '  my-skill: Accepted skill content for "my-skill" is not usable (not_found)',
          ]);

          // Settings should show re-enabled (collapsed to string form)
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
  // Preview flag
  // ---------------------------------------------------------------------------

  describe("preview flag", () => {
    it.effect("previews enable without modifying settings or lockfile", () => {
      const { provide, logs } = makeLayers();
      // Create a disabled skill
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": { source: "./installed", enabled: false } },
        {
          "my-skill": makeLockEntry(["claude-code"], computeSourceHash("SKILL.md\n# my-skill")),
        },
      );
      // Create canonical skill directory
      const canonicalDir = path.join(tempDir, "agent_extensions", "external", "skills", "my-skill");
      fs.mkdirSync(canonicalDir, { recursive: true });
      fs.writeFileSync(path.join(canonicalDir, "SKILL.md"), "# my-skill");

      return provide(
        Effect.gen(function* () {
          yield* handleEnable(defaultArgs("my-skill", { preview: true }));

          // Settings should still show disabled (preview = no side effects)
          const settingsContent = fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8");
          const settings = JSON.parse(settingsContent);
          expect(settings.skills?.["my-skill"]).toEqual({
            source: "./installed",
            enabled: false,
          });

          // Agent symlink should NOT have been created
          const agentSkillPath = path.join(tempDir, ".claude", "skills", "my-skill");
          expect(fs.existsSync(agentSkillPath)).toBe(false);

          // Preview outcome should be displayed
          expect(logs.info.some((m) => m.includes("Would enable 1 skill"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Plan building and execution
  // ---------------------------------------------------------------------------

  describe("plan execution", () => {
    it.effect("builds and resolves enable plan for disabled skill", () => {
      const { provide } = makeLayers();
      const canonicalDir = path.join(tempDir, "agent_extensions", "local", "installed");
      fs.mkdirSync(path.join(canonicalDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(canonicalDir, "skill.json"),
        JSON.stringify({ owner: "@acme", type: "skill", name: "my-skill", version: "1.0.0" }),
      );
      fs.writeFileSync(path.join(canonicalDir, "src", "SKILL.md"), "# my-skill");
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": { source: "./installed", enabled: false } },
        {
          "my-skill": {
            type: "local",
            packageOwner: "@acme",
            packageName: "my-skill",
            path: "installed",
            contentIdentity: computePackageContentHashSync(canonicalDir),
            treeIntegrity: computeMaterializedTreeIntegritySync(canonicalDir),
          },
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleEnable(defaultArgs("my-skill"));

          // Verify agent symlink was created
          const agentSkillPath = path.join(tempDir, ".claude", "skills", "my-skill");
          expect(fs.existsSync(agentSkillPath)).toBe(true);
        }),
      );
    });

    it.effect("reports error when canonical directory is missing", () => {
      const { provide } = makeLayers();
      // Create a disabled skill with no canonical directory on disk
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": { source: "local", enabled: false } },
        { "my-skill": makeLockEntry() },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleEnable(defaultArgs("my-skill"));

          // The error is caught by applyPlan and reported as a plan error result.
          // Verify the agent symlink was NOT created (enable did not succeed).
          const agentSkillPath = path.join(tempDir, ".claude", "skills", "my-skill");
          expect(fs.existsSync(agentSkillPath)).toBe(false);
        }),
      );
    });
  });
});
