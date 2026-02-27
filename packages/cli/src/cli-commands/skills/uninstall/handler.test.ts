/**
 * Unit tests for the uninstall command handler.
 *
 * Tests the plan build → display → confirm → apply flow.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import { makeClackPromptTestLayer, makeClackLogTestLayer } from "../../../clack-effect/index.js";
import { CliFlagsTest } from "../../../cli-flags/index.js";
import { layer as workspaceLayer, type WorkspaceContextOptions } from "../../../workspace/index.js";
import { SourceHostProvidersLive } from "../../../sources/index.js";
import { SkillManagerLive } from "../../../extensions/skills/manager.js";
import { UninstallSkillCommandWorkflowActionsLive } from "./command-actions.js";
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
      CliFlagsTest(),
    );
    const wsOptions: WorkspaceContextOptions = {
      scope: "project",
      agents: Option.none(),
      ...wsOverrides,
    };
    const WsLayer = Layer.provide(workspaceLayer(wsOptions), BaseLayer);
    const SPLayer = Layer.provide(SourceHostProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const SMLayer = Layer.provide(SkillManagerLive, Layer.mergeAll(BaseLayer, WsLayer, SPLayer));
    const ActionsLayer = Layer.provide(
      UninstallSkillCommandWorkflowActionsLive,
      Layer.mergeAll(BaseLayer, WsLayer, SMLayer),
    );
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, ActionsLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

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

          // Should show completed step
          expect(mockLog.logs.success.some((m) => m.includes("my-skill"))).toBe(true);
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
          const allLogs = [...mockLog.logs.success, ...mockLog.logs.info, ...mockLog.logs.message];
          expect(allLogs.some((m) => m.includes("not installed"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Partial uninstall via --agent
  // ---------------------------------------------------------------------------

  describe("uninstall from all agents", () => {
    it.effect("uninstalls from all configured agents", () => {
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
          yield* handleUninstall(defaultArgs("my-skill"));

          // claude-code symlink should be removed
          expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "my-skill"))).toBe(false);

          // cursor symlink should also be removed (--agent not supported in new workflow)
          expect(fs.existsSync(path.join(tempDir, ".cursor", "skills", "my-skill"))).toBe(false);

          // Canonical should be removed
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", "my-skill"),
            ),
          ).toBe(false);

          // Lockfile should not have the skill
          const lockContent = fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.skills["my-skill"]).toBeUndefined();
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Pack dependency guard
  // ---------------------------------------------------------------------------

  describe("pack dependency retention", () => {
    it.effect("retains pack-referenced skill on disk but removes settings", () => {
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
          yield* handleUninstall(defaultArgs(skillName));

          // Canonical directory should still exist (retained because pack requires it)
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "external", "skills", skillName),
            ),
          ).toBe(true);

          // Settings should not have the skill
          const settingsContent = fs.readFileSync(
            path.join(tempDir, ".axm", "settings.json"),
            "utf-8",
          );
          const settings = JSON.parse(settingsContent);
          expect(settings.skills?.[skillName]).toBeUndefined();

          // Success log should mention retained
          expect(
            mockLog.logs.success.some((m) => m.includes("retained") || m.includes("required")),
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
