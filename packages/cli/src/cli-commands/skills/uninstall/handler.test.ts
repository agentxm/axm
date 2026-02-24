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
  Workspace,
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
  lockfilePacks: Record<string, unknown> = {},
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  // Build settings skills map so removeSkill can find them
  const settingsSkills: Record<string, string> = {};
  for (const name of Object.keys(lockfileSkills)) {
    const entry = lockfileSkills[name] as { type?: string };
    settingsSkills[name] = entry?.type ?? "local";
  }
  const settings: Record<string, unknown> = { agents };
  if (Object.keys(settingsSkills).length > 0) {
    settings["skills"] = settingsSkills;
  }
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  const lockfile: Record<string, unknown> = { lockfileVersion: 1, skills: lockfileSkills };
  if (Object.keys(lockfilePacks).length > 0) {
    lockfile["packs"] = lockfilePacks;
  }
  fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));
};

/** Create a canonical skill directory with SKILL.md. */
const createCanonicalSkill = (base: string, name: string) => {
  const dir = path.join(base, ".axm", "extensions", "external", "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `# ${name}`);
  return dir;
};

/** Create an agent symlink pointing to canonical. */
const createAgentSymlink = (base: string, agentDir: string, name: string) => {
  const canonical = path.join(base, ".axm", "extensions", "external", "skills", name);
  const agentSkillDir = path.join(base, agentDir, "skills");
  fs.mkdirSync(agentSkillDir, { recursive: true });
  fs.symlinkSync(canonical, path.join(agentSkillDir, name));
};

const makeLockEntry = (agents: string[] = ["claude-code"]) => ({
  type: "local",
  path: "/installed",
  agents,
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const makeRegistryLockEntry = (
  namespace: string,
  name: string,
  agents: string[] = ["claude-code"],
) => ({
  type: "registry",
  namespace,
  name,
  resolvedVersion: "1.0.0",
  integrity: "sha256-abc",
  sourceName: "default",
  agents,
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const makePackLockEntry = (
  namespace: string,
  name: string,
  resolvedSkills: Record<string, string> = {},
) => ({
  type: "registry",
  namespace,
  name,
  resolvedVersion: "1.0.0",
  integrity: "sha256-abc",
  sourceName: "default",
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  resolvedSkills,
  resolvedCommands: {},
  resolvedMcpServers: {},
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
        FileSystem.FileSystem | Path.Path | Log | Confirm | Select | Multiselect | Workspace
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
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "my-skill"),
            ),
          ).toBe(false);

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
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "effect-basics"),
            ),
          ).toBe(false);
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "effect-stream"),
            ),
          ).toBe(false);

          // testing-unit should remain
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "testing-unit"),
            ),
          ).toBe(true);
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
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "my-skill"),
            ),
          ).toBe(true);

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

  // ---------------------------------------------------------------------------
  // Pack dependency guard
  // ---------------------------------------------------------------------------

  describe("pack dependency guard", () => {
    it.effect("blocks uninstall of pack-referenced skill with error", () => {
      const { provide, mockLog } = makeLayers();
      const skillName = "my-skill";
      const fqn = "@my-ns/skills/my-skill";
      initWorkspace(
        path.join(tempDir, ".axm"),
        { [skillName]: makeRegistryLockEntry("@my-ns", "my-skill") },
        ["claude-code"],
        { "my-pack": makePackLockEntry("@my-ns", "my-pack", { [fqn]: "1.0.0" }) },
      );
      createCanonicalSkill(tempDir, skillName);
      createAgentSymlink(tempDir, ".claude", skillName);

      return provide(
        Effect.gen(function* () {
          // Plan has errors → resolvePlan will fail with PLAN_HAS_ERRORS
          const result = yield* handleUninstall(defaultArgs(skillName)).pipe(Effect.either);

          // The plan should have failed due to error readiness
          expect(result._tag).toBe("Left");

          // Error readiness renders via log.error — check error logs for pack reference
          expect(
            mockLog.logs.error.some(
              (m) => m.includes("my-pack") && m.includes("axm skills disable"),
            ),
          ).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Taxonomy: ignored skill excluded from candidates
  // ---------------------------------------------------------------------------

  describe("taxonomy: ignored skill excluded from candidates", () => {
    it.effect("glob expansion excludes ignored implicit skill names", () => {
      const { provide } = makeLayers();
      // effect-basics: configured (in settings + lockfile)
      // effect-stream: implicit (lockfile-only, registry type = native), matches ignored pattern
      const axmDir = path.join(tempDir, ".axm");
      fs.mkdirSync(axmDir, { recursive: true });
      const settings = {
        agents: ["claude-code"],
        skills: { "effect-basics": "local" },
        ignored: { skills: ["effect-stream"] },
      };
      fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
      const lockfile = {
        lockfileVersion: 1,
        skills: {
          "effect-basics": makeLockEntry(),
          "effect-stream": makeRegistryLockEntry("@acme", "effect-stream"),
        },
      };
      fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));

      createCanonicalSkill(tempDir, "effect-basics");
      createCanonicalSkill(tempDir, "effect-stream");

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("effect-*"));

          // effect-basics should be removed (matched glob, not ignored)
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "effect-basics"),
            ),
          ).toBe(false);

          // effect-stream should remain (ignored, excluded from installed candidates)
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "effect-stream"),
            ),
          ).toBe(true);
        }),
      );
    });
  });
});
