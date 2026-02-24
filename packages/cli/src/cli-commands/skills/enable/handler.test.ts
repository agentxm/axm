/**
 * Unit tests for the enable command handler.
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
  makeConfirmTestLayer,
  makeLogTestLayer,
  makeMultiselectTestLayer,
  makeSelectTestLayer,
} from "../../../tui/index.js";
import {
  Workspace,
  layer as workspaceLayer,
  type WorkspaceContextOptions,
} from "../../../workspace/index.js";
import { type CliError } from "../../../cli-error/index.js";
import { handleEnable, type EnableHandlerArgs } from "./handler.js";

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
  overrides: Partial<EnableHandlerArgs> = {},
): EnableHandlerArgs => ({
  name,
  yes: true,
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

  const makeLayers = (wsOverrides?: Partial<WorkspaceContextOptions>) => {
    const [logLayer, mockLog] = makeLogTestLayer();
    const [confirmLayer] = makeConfirmTestLayer();
    const [selectLayer] = makeSelectTestLayer();
    const [multiselectLayer] = makeMultiselectTestLayer();
    const BaseLayer = Layer.mergeAll(
      NodeContext.layer,
      logLayer,
      confirmLayer,
      selectLayer,
      multiselectLayer,
    );
    const wsOptions: WorkspaceContextOptions = {
      global: false,
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
  // Validation: skill not found
  // ---------------------------------------------------------------------------

  describe("validation", () => {
    it.effect("fails when skill does not exist", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleEnable(defaultArgs("nonexistent")).pipe(Effect.flip);
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
          const error = yield* handleEnable(defaultArgs("nonexistent")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).what).toContain("is not installed");
        }),
      );
    });

    it.effect("no-op when skill is already enabled", () => {
      const { provide, mockLog } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": "local" },
        { "my-skill": makeLockEntry() },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleEnable(defaultArgs("my-skill"));

          expect(mockLog.logs.info.some((m) => m.includes("already enabled"))).toBe(true);
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
          const error = yield* handleEnable(defaultArgs("code-review")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).what).toContain("is not installed");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Promoted transitive skill re-enable
  // ---------------------------------------------------------------------------

  describe("promoted skill re-enable", () => {
    it.effect("re-enables promoted transitive skill by updating settings", () => {
      const { provide, mockLog } = makeLayers();
      // Skill was promoted to direct via disable: bare name key, no lock entry
      initWorkspace(
        path.join(tempDir, ".axm"),
        {
          "code-review": {
            source: "@acme/skills/code-review",
            enabled: false,
          },
        },
        {},
        ["claude-code"],
        {
          packs: { "starter-pack": "@acme/packs/starter-pack" },
          lockfilePacks: {
            "starter-pack": {
              type: "registry",
              namespace: "@acme",
              name: "starter-pack",
              resolvedVersion: "1.0.0",
              integrity: "sha512-AAAA==",
              sourceName: "default",
              installedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              resolvedSkills: { "@acme/skills/code-review": "1.2.0" },
              resolvedCommands: {},
              resolvedMcpServers: {},
            },
          },
        },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleEnable(defaultArgs("code-review"));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Settings should show re-enabled (collapsed to string form)
          const settingsContent = fs.readFileSync(
            path.join(tempDir, ".axm", "settings.json"),
            "utf-8",
          );
          const settings = JSON.parse(settingsContent);
          expect(settings.skills?.["code-review"]).toBe("@acme/skills/code-review");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Plan building and execution
  // ---------------------------------------------------------------------------

  describe("plan execution", () => {
    it.effect("builds and resolves enable plan for disabled skill", () => {
      const { provide, mockLog } = makeLayers();
      // Create a disabled skill: { source: "local", enabled: false }
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": { source: "local", enabled: false } },
        { "my-skill": makeLockEntry() },
      );
      // Create canonical skill directory at the new external extensions path
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

      return provide(
        Effect.gen(function* () {
          yield* handleEnable(defaultArgs("my-skill"));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

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
