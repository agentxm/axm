/**
 * Unit tests for the disable command handler.
 *
 * Tests validation logic and plan building.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import type { FileSystem, Path } from "@effect/platform";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import {
  type Confirm,
  type Log,
  type Multiselect,
  type Select,
  makeClackPromptTestLayer,
  makeClackLogTestLayer,
} from "../../../clack-effect/index.js";
import {
  Workspace,
  layer as workspaceLayer,
  type WorkspaceContextOptions,
} from "../../../workspace/index.js";
import { type CliError } from "../../../cli-error/index.js";
import { handleDisable, type DisableHandlerArgs } from "./handler.js";

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
  fs.mkdirSync(axmDir, { recursive: true });
  const settings: Record<string, unknown> = { agents };
  if (Object.keys(skills).length > 0) {
    settings["skills"] = skills;
  }
  if (opts?.packs && Object.keys(opts.packs).length > 0) {
    settings["packs"] = opts.packs;
  }
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  const lockfile: Record<string, unknown> = { lockfileVersion: 1, skills: lockfileSkills };
  if (opts?.lockfilePacks) {
    lockfile["packs"] = opts.lockfilePacks;
  }
  fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));
};

const makeLockEntry = (agents: string[] = ["claude-code"]) => ({
  type: "local",
  path: "/installed",
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

  const makeLayers = (wsOverrides?: Partial<WorkspaceContextOptions>) => {
    const [logLayer, mockLog] = makeClackLogTestLayer();
    const [confirmLayer] = makeClackPromptTestLayer();
    const [selectLayer] = makeClackPromptTestLayer();
    const [multiselectLayer] = makeClackPromptTestLayer();
    const BaseLayer = Layer.mergeAll(
      NodeContext.layer,
      logLayer,
      confirmLayer,
      selectLayer,
      multiselectLayer,
    );
    const wsOptions: WorkspaceContextOptions = {
      scope: "project",
      yes: true,
      nonInteractive: Option.some(true),
      preview: false,
      agents: Option.none(),
      ...wsOverrides,
    };
    const WsLayer = Layer.provide(workspaceLayer(wsOptions), BaseLayer);
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer);

    const provide = <A, E>(
      effect: Effect.Effect<
        A,
        E,
        FileSystem.FileSystem | Path.Path | Log | Confirm | Select | Multiselect | Workspace
      >,
    ) => effect.pipe(Effect.provide(FullLayer));

    return { provide, mockLog };
  };

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
          expect(error._tag).toBe("CliError");
          expect((error as CliError).what).toContain("is not installed");
        }),
      );
    });

    it.effect("fails when skill is not found", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {});

      return provide(
        Effect.gen(function* () {
          const error = yield* handleDisable(defaultArgs("nonexistent")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).what).toContain("is not installed");
        }),
      );
    });

    it.effect("no-op when skill is already disabled", () => {
      const { provide, mockLog } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": { source: "local", enabled: false } },
        { "my-skill": makeLockEntry() },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleDisable(defaultArgs("my-skill"));

          expect(mockLog.logs.info.some((m) => m.includes("already disabled"))).toBe(true);
          expect(mockLog.logs.success.some((m) => m.includes("Nothing to do"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Taxonomy: ignored skill excluded from installed
  // ---------------------------------------------------------------------------

  describe("taxonomy: ignored skill excluded", () => {
    it.effect("fails for ignored implicit skill (treated as not installed)", () => {
      const { provide } = makeLayers();
      // Implicit skill: in lockfile only (registry type = native), with ignored pattern
      initWorkspace(
        path.join(tempDir, ".axm"),
        {},
        {
          "code-review": {
            type: "registry",
            namespace: "@acme",
            name: "code-review",
            resolvedVersion: "1.0.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            agents: ["claude-code"],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      );
      // Add ignored pattern that matches the skill
      const settingsPath = path.join(tempDir, ".axm", "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      settings.ignored = { skills: ["code-review"] };
      fs.writeFileSync(settingsPath, JSON.stringify(settings));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleDisable(defaultArgs("code-review")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).what).toContain("is not installed");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Transitive skill disable (direct entry promotion)
  // ---------------------------------------------------------------------------

  describe("implicit skill disable (lockfile-only entry promotion)", () => {
    it.effect("creates direct entry when disabling implicit skill", () => {
      const { provide, mockLog } = makeLayers();
      // Implicit skill: in lockfile but not in settings, with native (registry) type
      initWorkspace(
        path.join(tempDir, ".axm"),
        {},
        {
          "code-review": {
            type: "registry",
            namespace: "@acme",
            name: "code-review",
            resolvedVersion: "1.2.0",
            integrity: "sha512-AAAA==",
            sourceName: "default",
            agents: ["claude-code"],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        ["claude-code"],
      );

      return provide(
        Effect.gen(function* () {
          yield* handleDisable(defaultArgs("code-review"));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Settings should have a new direct entry with enabled: false
          const settingsContent = fs.readFileSync(
            path.join(tempDir, ".axm", "settings.json"),
            "utf-8",
          );
          const settings = JSON.parse(settingsContent);
          expect(settings.skills?.["code-review"]).toEqual({
            source: "code-review",
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
          expect(error._tag).toBe("CliError");
          expect((error as CliError).what).toContain("is not installed");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Settings-only disable (no lock entry)
  // ---------------------------------------------------------------------------

  describe("settings-only disable (no lock entry)", () => {
    it.effect("disables a configured skill with no lockfile entry", () => {
      const { provide, mockLog } = makeLayers();
      // Skill in settings as enabled (string form) but not in lockfile
      initWorkspace(path.join(tempDir, ".axm"), { "my-skill": "@acme/skills/my-skill" }, {}, [
        "claude-code",
      ]);

      return provide(
        Effect.gen(function* () {
          yield* handleDisable(defaultArgs("my-skill"));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Settings should show disabled
          const settingsContent = fs.readFileSync(
            path.join(tempDir, ".axm", "settings.json"),
            "utf-8",
          );
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
      const { provide, mockLog } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": "local" },
        { "my-skill": makeLockEntry() },
      );
      // Create canonical skill directory (preserved after disable)
      const canonicalDir = path.join(
        tempDir,
        ".axm",
        "extensions",
        "external",
        "skills",
        "my-skill",
      );
      fs.mkdirSync(canonicalDir, { recursive: true });
      fs.writeFileSync(path.join(canonicalDir, "SKILL.md"), "# my-skill");

      // Create agent symlink directory (removed on disable)
      const agentSkillDir = path.join(tempDir, ".claude", "skills", "my-skill");
      fs.mkdirSync(agentSkillDir, { recursive: true });
      fs.writeFileSync(path.join(agentSkillDir, "SKILL.md"), "# my-skill");

      return provide(
        Effect.gen(function* () {
          yield* handleDisable(defaultArgs("my-skill"));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Settings should show disabled
          const settingsContent = fs.readFileSync(
            path.join(tempDir, ".axm", "settings.json"),
            "utf-8",
          );
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
