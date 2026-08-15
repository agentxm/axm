/**
 * Unit tests for the uninstall command handler.
 *
 * Tests the plan build → display → confirm → apply flow.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import type { WorkspaceMutationsOptions } from "@agentxm/client-core/unstable/workspace";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";
import { SkillManagerLive } from "@agentxm/client-core/unstable/skills";
import { computePackManifestContentIdentity } from "@agentxm/client-core/unstable/packs";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";
import {
  UninstallSkillCommandWorkflowActionsLive,
  type UninstallHandlerArgs,
} from "./command-actions.js";
import { handleUninstall } from "./handler.js";
import {
  expectNoOpPlanResult,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../../test-helpers.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (
  axmDir: string,
  lockfileSkills: Record<string, unknown> = {},
  agents: string[] = ["claude-code"],
  lockfilePacks: Record<string, unknown> = {},
  configuredSkills: Record<string, string> = {},
  configuredPacks: Record<string, string> = {},
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  // Build settings skills map so removeSkill can find them
  const settingsSkills: Record<string, string> = { ...configuredSkills };
  for (const name of Object.keys(lockfileSkills)) {
    if (name in settingsSkills) continue;
    const entry = lockfileSkills[name];
    const entryType =
      typeof entry === "object" &&
      entry !== null &&
      "type" in entry &&
      typeof entry.type === "string"
        ? entry.type
        : undefined;
    settingsSkills[name] = entryType ?? "local";
  }
  const settings: Record<string, unknown> = { agents };
  if (Object.keys(settingsSkills).length > 0) {
    settings["skills"] = settingsSkills;
  }
  if (Object.keys(configuredPacks).length > 0) {
    settings["packs"] = configuredPacks;
  }
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  const lockfile: Record<string, unknown> = { lockfileVersion: 4, skills: lockfileSkills };
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

const makeLockEntry = (_agents: string[] = ["claude-code"]) => ({
  type: "local",
  path: "installed",
  contentIdentity: "test-content",
});

const makeRegistryLockEntry = (
  owner: string,
  name: string,
  _agents: string[] = ["claude-code"],
) => ({
  type: "registry",
  owner,
  name,
  resolvedVersion: "1.0.0",
  integrity: "sha256-abc",
  sourceName: "default",
  publisherBindingId: "hbnd_test",
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const makePackLockEntry = (
  owner: string,
  name: string,
  resolvedSkills: Record<string, string> = {},
) => ({
  type: "registry",
  owner,
  name,
  resolvedVersion: "1.0.0",
  integrity: "sha256-abc",
  sourceName: "default",
  publisherBindingId: "hbnd_test",
  manifestContentIdentity: computePackManifestContentIdentity({
    owner,
    type: "pack",
    name,
    version: "1.0.0",
    dependencies: resolvedSkills,
  }),
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

  const makeLayers = (options?: {
    readonly wsOverrides?: Partial<WorkspaceMutationsOptions>;
    readonly machine?: boolean;
  }) => {
    const handlerTestContext = makeWorkspaceHandlerTestContext({
      machine: options?.machine,
      wsOptions: options?.wsOverrides,
    });
    const BaseLayer = handlerTestContext.baseLayer;
    const WsLayer = handlerTestContext.wsLayer;
    const SPLayer = Layer.provide(SourceHostProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const SMLayer = Layer.provide(
      SkillManagerLive,
      Layer.mergeAll(BaseLayer, WsLayer, SPLayer, CodingAgentRepositoryLive),
    );
    const ActionsLayer = Layer.provide(
      UninstallSkillCommandWorkflowActionsLive,
      Layer.mergeAll(BaseLayer, WsLayer, SMLayer, CodingAgentRepositoryLive),
    );
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, ActionsLayer);
    const provide = makeEffectProvide(FullLayer);

    return {
      provide,
      logs: handlerTestContext.logs,
      rendererState: handlerTestContext.rendererState,
    };
  };

  // ---------------------------------------------------------------------------
  // Full uninstall flow
  // ---------------------------------------------------------------------------

  describe("full uninstall flow", () => {
    it.effect("uninstalls a skill from lockfile and disk", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        "my-skill": makeLockEntry(),
      });
      createCanonicalSkill(tempDir, "my-skill");
      createAgentSymlink(tempDir, ".claude", "my-skill");

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("my-skill"), {
            yes: true,
            preview: false,
          });

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
        }),
      );
    });

    it.effect("removes settings-only configured skills that are absent from the lockfile", () => {
      const { provide } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        {},
        ["claude-code"],
        {},
        { "settings-only": "local:/configured-only" },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("settings-only"), {
            yes: true,
            preview: false,
          });

          const settings = JSON.parse(
            fs.readFileSync(path.join(tempDir, ".axm", "settings.json"), "utf-8"),
          );
          const skills =
            typeof settings === "object" &&
            settings !== null &&
            "skills" in settings &&
            typeof settings.skills === "object" &&
            settings.skills !== null
              ? settings.skills
              : undefined;

          expect(skills?.["settings-only"]).toBeUndefined();
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
          yield* handleUninstall(defaultArgs("effect-*"), {
            yes: true,
            preview: false,
          });

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

    it.effect("reports no-op when glob matches no skills", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        "my-skill": makeLockEntry(),
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("nonexistent-*"), {
            yes: true,
            preview: false,
          });

          expect(logs.warn).toEqual([]);
          expect(logs.success.some((m) => m.includes("No skills uninstalled"))).toBe(true);
        }),
      );
    });

    it.effect("emits JSON no-op when glob matches no skills in machine mode", () => {
      const { provide, logs, rendererState } = makeLayers({ machine: true });
      initWorkspace(path.join(tempDir, ".axm"), {
        "my-skill": makeLockEntry(),
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("nonexistent-*"), {
            yes: true,
            preview: false,
          });

          expect(logs.success).toEqual([]);
          expect(logs.warn).toEqual([]);
          expectNoOpPlanResult(rendererState.results[0]?.data, {
            planName: "Uninstall skills",
            message: "No skills uninstalled.",
          });
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Literal name not in lockfile
  // ---------------------------------------------------------------------------

  describe("literal name not in lockfile", () => {
    it.effect("reports a no-op for literal names absent from the lockfile", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("nonexistent"), {
            yes: true,
            preview: false,
          });

          const lockContent = fs.readFileSync(path.join(tempDir, ".axm", "axm-lock.yaml"), "utf-8");
          const lockfile = YAML.parse(lockContent);
          expect(lockfile.skills?.["nonexistent"]).toBeUndefined();
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
          yield* handleUninstall(defaultArgs("my-skill"), {
            yes: true,
            preview: false,
          });

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
    it.effect("retains canonical content while an active pack still requires it", () => {
      const { provide } = makeLayers();
      const skillName = "my-skill";
      const fqn = "@my-ns/skills/my-skill";
      const packDir = path.join(tempDir, ".axm", "extensions", "@my-ns", "packs", "my-pack");
      fs.mkdirSync(packDir, { recursive: true });
      fs.writeFileSync(
        path.join(packDir, "pack.json"),
        JSON.stringify({
          owner: "@my-ns",
          type: "pack",
          name: "my-pack",
          version: "1.0.0",
          dependencies: { [fqn]: "1.0.0" },
        }),
      );
      initWorkspace(
        path.join(tempDir, ".axm"),
        { [skillName]: makeRegistryLockEntry("@my-ns", "my-skill") },
        ["claude-code"],
        {
          "my-pack": makePackLockEntry("@my-ns", "my-pack", { [fqn]: "1.0.0" }),
        },
        { [skillName]: fqn },
        { "my-pack": "@my-ns/packs/my-pack" },
      );
      createCanonicalSkill(tempDir, skillName);
      createAgentSymlink(tempDir, ".claude", skillName);

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs(skillName), {
            yes: true,
            preview: false,
          });

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
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Preview flag
  // ---------------------------------------------------------------------------

  describe("preview flag", () => {
    it.effect("shows workspace-authored canonical source deletion before confirmation", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        {},
        ["claude-code"],
        {},
        { "my-skill": "workspace:@acme/skills/my-skill" },
      );
      fs.mkdirSync(path.join(tempDir, ".axm", "extensions", "@acme", "skills", "my-skill"), {
        recursive: true,
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("my-skill"), {
            yes: false,
            preview: true,
          });

          expect(logs.message).toContain("    removed: .axm/extensions/@acme/skills/my-skill");
          expect(
            fs.existsSync(path.join(tempDir, ".axm", "extensions", "@acme", "skills", "my-skill")),
          ).toBe(true);
        }),
      );
    });

    it.effect(
      "previews single skill uninstall without deleting files or modifying lockfile",
      () => {
        const { provide, logs } = makeLayers();
        initWorkspace(path.join(tempDir, ".axm"), {
          "my-skill": makeLockEntry(),
        });
        createCanonicalSkill(tempDir, "my-skill");
        createAgentSymlink(tempDir, ".claude", "my-skill");

        return provide(
          Effect.gen(function* () {
            yield* handleUninstall(defaultArgs("my-skill"), {
              yes: false,
              preview: true,
            });

            // Canonical directory should still exist (preview = no side effects)
            expect(
              fs.existsSync(
                path.join(tempDir, ".axm", "extensions", "external", "skills", "my-skill"),
              ),
            ).toBe(true);

            // Agent symlink should still exist
            expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "my-skill"))).toBe(true);

            // Lockfile should still have the skill
            const lockContent = fs.readFileSync(
              path.join(tempDir, ".axm", "axm-lock.yaml"),
              "utf-8",
            );
            const lockfile = YAML.parse(lockContent);
            expect(lockfile.skills["my-skill"]).toBeDefined();

            // Settings should still have the skill
            const settingsContent = fs.readFileSync(
              path.join(tempDir, ".axm", "settings.json"),
              "utf-8",
            );
            const settings = JSON.parse(settingsContent);
            expect(settings.skills?.["my-skill"]).toBeDefined();

            // Preview outcome should be displayed
            expect(logs.info.some((m) => m.includes("Would remove 1 skill"))).toBe(true);
            expect(logs.message).toEqual(
              expect.arrayContaining([
                "    updated: .axm/axm-lock.yaml",
                "    updated: .axm/settings.json",
                "    removed: .axm/extensions/external/skills/my-skill",
                "    removed: .claude/skills/my-skill",
              ]),
            );
          }),
        );
      },
    );

    it.effect(
      "previews multi-agent skill uninstall without deleting files or modifying lockfile",
      () => {
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
            yield* handleUninstall(defaultArgs("my-skill"), {
              yes: false,
              preview: true,
            });

            // Canonical directory should still exist
            expect(
              fs.existsSync(
                path.join(tempDir, ".axm", "extensions", "external", "skills", "my-skill"),
              ),
            ).toBe(true);

            // Both agent symlinks should still exist
            expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "my-skill"))).toBe(true);
            expect(fs.existsSync(path.join(tempDir, ".cursor", "skills", "my-skill"))).toBe(true);

            // Lockfile should still have the skill
            const lockContent = fs.readFileSync(
              path.join(tempDir, ".axm", "axm-lock.yaml"),
              "utf-8",
            );
            const lockfile = YAML.parse(lockContent);
            expect(lockfile.skills["my-skill"]).toBeDefined();
          }),
        );
      },
    );
  });
});
