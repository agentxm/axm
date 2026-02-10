/**
 * Unit tests for the uninstall command handler.
 *
 * Tests the plan build → display → confirm → apply flow.
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
  WorkspaceContextTag,
  layer as workspaceLayer,
  type WorkspaceContextOptions,
} from "../../../workspace/index.js";
import { handleUninstall, type UninstallHandlerArgs } from "./handler.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (
  axmDir: string,
  lockfileSkills: Record<string, unknown> = {},
  agents: string[] = ["claude-code"],
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  // Build settings skills map so removeSkill can find them
  const settingsSkills: Record<string, string> = {};
  for (const name of Object.keys(lockfileSkills)) {
    const entry = lockfileSkills[name] as { source?: string };
    settingsSkills[name] = entry?.source ?? "local";
  }
  const settings: Record<string, unknown> = { agents };
  if (Object.keys(settingsSkills).length > 0) {
    settings["skills"] = settingsSkills;
  }
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: lockfileSkills }),
  );
};

/** Create a canonical skill directory with SKILL.md. */
const createCanonicalSkill = (base: string, name: string) => {
  const dir = path.join(base, ".agents", "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `# ${name}`);
  return dir;
};

/** Create an agent symlink pointing to canonical. */
const createAgentSymlink = (base: string, agentDir: string, name: string) => {
  const canonical = path.join(base, ".agents", "skills", name);
  const agentSkillDir = path.join(base, agentDir, "skills");
  fs.mkdirSync(agentSkillDir, { recursive: true });
  fs.symlinkSync(canonical, path.join(agentSkillDir, name));
};

const makeLockEntry = (agents: string[] = ["claude-code"]) => ({
  source: "local",
  path: "/installed",
  agents,
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const defaultArgs = (
  skill: string,
  overrides: Partial<UninstallHandlerArgs> = {},
): UninstallHandlerArgs => ({
  skill,
  agent: [],
  yes: true,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("uninstall.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "uninstall-handler-test-"));
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
        | FileSystem.FileSystem
        | Path.Path
        | Log
        | Confirm
        | Select
        | Multiselect
        | WorkspaceContextTag
      >,
    ) => effect.pipe(Effect.provide(FullLayer));

    return { provide, mockLog };
  };

  // ---------------------------------------------------------------------------
  // Full uninstall flow
  // ---------------------------------------------------------------------------

  describe("full uninstall flow", () => {
    it.effect("uninstalls a skill from lockfile and disk", () => {
      const { provide, mockLog } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        "my-skill": makeLockEntry(),
      });
      createCanonicalSkill(tempDir, "my-skill");
      createAgentSymlink(tempDir, ".claude", "my-skill");

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("my-skill"));

          // Canonical directory should be removed
          expect(fs.existsSync(path.join(tempDir, ".agents", "skills", "my-skill"))).toBe(false);

          // Agent symlink should be removed
          expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "my-skill"))).toBe(false);

          // Lockfile should not have the skill
          const lockContent = fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.skills["my-skill"]).toBeUndefined();

          // Should show Done
          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Glob expansion
  // ---------------------------------------------------------------------------

  describe("glob expansion", () => {
    it.effect("expands glob pattern to match multiple skills", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        "effect-basics": makeLockEntry(),
        "effect-stream": makeLockEntry(),
        "testing-unit": makeLockEntry(),
      });
      createCanonicalSkill(tempDir, "effect-basics");
      createCanonicalSkill(tempDir, "effect-stream");
      createCanonicalSkill(tempDir, "testing-unit");

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("effect-*"));

          // effect-* skills should be removed
          expect(fs.existsSync(path.join(tempDir, ".agents", "skills", "effect-basics"))).toBe(
            false,
          );
          expect(fs.existsSync(path.join(tempDir, ".agents", "skills", "effect-stream"))).toBe(
            false,
          );

          // testing-unit should remain
          expect(fs.existsSync(path.join(tempDir, ".agents", "skills", "testing-unit"))).toBe(true);
        }),
      );
    });

    it.effect("shows warning when glob matches no skills", () => {
      const { provide, mockLog } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        "my-skill": makeLockEntry(),
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("nonexistent-*"));

          expect(mockLog.logs.warn.some((m) => m.includes("No skills matched"))).toBe(true);
          expect(mockLog.logs.success.some((m) => m.includes("Nothing to uninstall"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Literal name not in lockfile
  // ---------------------------------------------------------------------------

  describe("literal name not in lockfile", () => {
    it.effect("builds no-op plan for literal name not in lockfile", () => {
      const { provide, mockLog } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("nonexistent"));

          // Should show the no-op result
          const allLogs = [...mockLog.logs.warn, ...mockLog.logs.info, ...mockLog.logs.message];
          expect(allLogs.some((m) => m.includes("not installed"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Partial uninstall via --agent
  // ---------------------------------------------------------------------------

  describe("partial uninstall via --agent", () => {
    it.effect("uninstalls from specific agents only", () => {
      const { provide } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        { "my-skill": makeLockEntry(["claude-code", "cursor"]) },
        ["claude-code", "cursor"],
      );
      createCanonicalSkill(tempDir, "my-skill");
      createAgentSymlink(tempDir, ".claude", "my-skill");
      createAgentSymlink(tempDir, ".cursor", "my-skill");

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("my-skill", { agent: ["claude-code"] }));

          // claude-code symlink should be removed
          expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "my-skill"))).toBe(false);

          // cursor symlink should remain
          expect(fs.existsSync(path.join(tempDir, ".cursor", "skills", "my-skill"))).toBe(true);

          // Canonical should still exist
          expect(fs.existsSync(path.join(tempDir, ".agents", "skills", "my-skill"))).toBe(true);

          // Lockfile should have updated agents
          const lockContent = fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.skills["my-skill"]).toBeDefined();
          expect(lockfile.skills["my-skill"].agents).not.toContain("claude-code");
          expect(lockfile.skills["my-skill"].agents).toContain("cursor");
        }),
      );
    });
  });
});
