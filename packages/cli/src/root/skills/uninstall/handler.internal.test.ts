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
import {
  type WorkspaceMutationsOptions,
  computePackManifestContentIdentity,
} from "@agentxm/workspace-state";
import { SourceHostProvidersLive } from "@agentxm/extension-management/unstable/source-resolution";
import { SkillManagerLive } from "@agentxm/extension-management/unstable/skills";
import { CodingAgentRepositoryLive } from "@agentxm/extension-workspace/live";
import { type UninstallHandlerArgs } from "./command-actions.js";
import { handleUninstall } from "./handler.js";
import {
  expectNoOpPlanResult,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../../test-helpers.js";
import { writeWorkspaceFiles } from "../../../test-stubs.js";

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
    const entryOwner =
      typeof entry === "object" &&
      entry !== null &&
      "owner" in entry &&
      typeof entry.owner === "string"
        ? entry.owner
        : "@acme";
    settingsSkills[name] =
      entryType === "registry" ? `${entryOwner}/skills/${name}` : "./installed";
  }
  writeWorkspaceFiles(axmDir, {
    agents,
    skills: settingsSkills,
    packs: configuredPacks,
    lockfileSkills,
    lockfilePacks,
  });
};

/** Create a canonical skill directory with SKILL.md. */
const createCanonicalSkill = (base: string, name: string, owner = "@acme") => {
  const dir = path.join(base, "agent_extensions", "agentxm", owner, "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `# ${name}`);
  return dir;
};

/** Create an agent symlink pointing to canonical. */
const createAgentSymlink = (base: string, agentDir: string, name: string, owner = "@acme") => {
  const canonical = path.join(base, "agent_extensions", "agentxm", owner, "skills", name);
  const agentSkillDir = path.join(base, agentDir, "skills");
  fs.mkdirSync(agentSkillDir, { recursive: true });
  fs.symlinkSync(canonical, path.join(agentSkillDir, name));
};

const makeLockEntry = (name: string, _agents: string[] = ["claude-code"]) =>
  makeRegistryLockEntry("@acme", name, _agents);

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
  sourceName: "agentxm",
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
  sourceName: "agentxm",
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
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SMLayer, CodingAgentRepositoryLive);
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
        "my-skill": makeLockEntry("my-skill"),
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
              path.join(tempDir, "agent_extensions", "agentxm", "@acme", "skills", "my-skill"),
            ),
          ).toBe(false);

          // Agent symlink should be removed
          expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "my-skill"))).toBe(false);

          // Lockfile should not have the skill
          const lockContent = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8");
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

          const settings = JSON.parse(fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8"));
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
        "effect-basics": makeLockEntry("effect-basics"),
        "effect-stream": makeLockEntry("effect-stream"),
        "testing-unit": makeLockEntry("testing-unit"),
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
              path.join(tempDir, "agent_extensions", "agentxm", "@acme", "skills", "effect-basics"),
            ),
          ).toBe(false);
          expect(
            fs.existsSync(
              path.join(tempDir, "agent_extensions", "agentxm", "@acme", "skills", "effect-stream"),
            ),
          ).toBe(false);

          // testing-unit should remain
          expect(
            fs.existsSync(
              path.join(tempDir, "agent_extensions", "agentxm", "@acme", "skills", "testing-unit"),
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("reports no-op when glob matches no skills", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        "my-skill": makeLockEntry("my-skill"),
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
        "my-skill": makeLockEntry("my-skill"),
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

          const lockContent = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8");
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
        { "my-skill": makeLockEntry("my-skill", ["claude-code", "cursor"]) },
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
              path.join(tempDir, "agent_extensions", "agentxm", "@acme", "skills", "my-skill"),
            ),
          ).toBe(false);

          // Lockfile should not have the skill
          const lockContent = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8");
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
      const packDir = path.join(
        tempDir,
        "agent_extensions",
        "agentxm",
        "@my-ns",
        "packs",
        "my-pack",
      );
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
      createCanonicalSkill(tempDir, skillName, "@my-ns");
      createAgentSymlink(tempDir, ".claude", skillName, "@my-ns");

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs(skillName), {
            yes: true,
            preview: false,
          });

          // Canonical directory should still exist (retained because pack requires it)
          expect(
            fs.existsSync(
              path.join(tempDir, "agent_extensions", "agentxm", "@my-ns", "skills", skillName),
            ),
          ).toBe(true);

          // Settings should not have the skill
          const settingsContent = fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8");
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
    it.effect("preserves workspace-authored source while removing its settings entry", () => {
      const { provide, logs } = makeLayers();
      initWorkspace(
        path.join(tempDir, ".axm"),
        {},
        ["claude-code"],
        {},
        { "my-skill": "workspace" },
      );
      fs.mkdirSync(path.join(tempDir, "skills", "my-skill"), {
        recursive: true,
      });

      return provide(
        Effect.gen(function* () {
          yield* handleUninstall(defaultArgs("my-skill"), {
            yes: false,
            preview: true,
          });

          expect(logs.message).toContain("    unchanged: skills/my-skill");
          expect(fs.existsSync(path.join(tempDir, "skills", "my-skill"))).toBe(true);
        }),
      );
    });

    it.effect(
      "previews single skill uninstall without deleting files or modifying lockfile",
      () => {
        const { provide, logs } = makeLayers();
        initWorkspace(path.join(tempDir, ".axm"), {
          "my-skill": makeLockEntry("my-skill"),
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
                path.join(tempDir, "agent_extensions", "agentxm", "@acme", "skills", "my-skill"),
              ),
            ).toBe(true);

            // Agent symlink should still exist
            expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "my-skill"))).toBe(true);

            // Lockfile should still have the skill
            const lockContent = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8");
            const lockfile = YAML.parse(lockContent);
            expect(lockfile.skills["my-skill"]).toBeDefined();

            // Settings should still have the skill
            const settingsContent = fs.readFileSync(path.join(tempDir, "axm.json"), "utf-8");
            const settings = JSON.parse(settingsContent);
            expect(settings.skills?.["my-skill"]).toBeDefined();

            // Preview outcome should be displayed
            expect(logs.info.some((m) => m.includes("Would uninstall 1 skill"))).toBe(true);
            expect(logs.message).toEqual(
              expect.arrayContaining([
                "    updated: axm-lock.yaml",
                "    updated: axm.json",
                "    removed: agent_extensions/agentxm/@acme/skills/my-skill",
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
          { "my-skill": makeLockEntry("my-skill", ["claude-code", "cursor"]) },
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
                path.join(tempDir, "agent_extensions", "agentxm", "@acme", "skills", "my-skill"),
              ),
            ).toBe(true);

            // Both agent symlinks should still exist
            expect(fs.existsSync(path.join(tempDir, ".claude", "skills", "my-skill"))).toBe(true);
            expect(fs.existsSync(path.join(tempDir, ".cursor", "skills", "my-skill"))).toBe(true);

            // Lockfile should still have the skill
            const lockContent = fs.readFileSync(path.join(tempDir, "axm-lock.yaml"), "utf-8");
            const lockfile = YAML.parse(lockContent);
            expect(lockfile.skills["my-skill"]).toBeDefined();
          }),
        );
      },
    );
  });
});
