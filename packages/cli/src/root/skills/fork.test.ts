/**
 * Unit tests for the fork command handler.
 *
 * Tests the registry guard → parse source → discover → filter → plan build → apply flow.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import YAML from "yaml";
import { afterEach, beforeEach } from "vitest";
import {
  AuthGuardInteractionTest,
  CredentialStoreTest,
  RegistryUrl,
} from "@agentxm/client-core/unstable/auth";
import { TestRenderer, logsByTag } from "@agentxm/client-core/unstable/cli-renderer";
import { TestFlagsLayer } from "@agentxm/client-core/unstable/cli-flags";
import type { WorkspaceMutationsOptions } from "@agentxm/client-core/unstable/workspace";
import { layer as coreWorkspaceLayer } from "@agentxm/client-core/unstable/workspace";
import { SourceHostProvidersLive } from "@agentxm/client-core/unstable/source-resolution";
import { handleFork, type ForkHandlerArgs } from "./fork.js";
import { expectDefined, stringArrayProperty, stringProperty } from "../../test-helpers.js";
import { CodingAgentRepositoryLive } from "@agentxm/client-core/unstable/agents";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Create a SKILL.md with valid frontmatter in a directory. */
const createSkillMd = (dir: string, name: string, description = "") => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: "${name}"\ndescription: "${description}"\n---\n\n# ${name}\n`,
  );
};

/** Create an initialized workspace with settings + lockfile + registry source. */
const initWorkspace = (
  axmDir: string,
  registryRoot: string,
  lockfileSkills: Record<string, unknown> = {},
  settingsSkills: Record<string, unknown> = {},
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  fs.mkdirSync(registryRoot, { recursive: true });
  const settings: Record<string, unknown> = {
    owner: "@test",
    agents: ["claude-code"],
    sources: [{ name: "local", type: "registry", location: new URL(`file://${registryRoot}`) }],
  };
  if (Object.keys(settingsSkills).length > 0) {
    settings["skills"] = settingsSkills;
  }
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: lockfileSkills }),
  );
};

const defaultArgs = (
  source: string,
  overrides: Partial<ForkHandlerArgs> = {},
): ForkHandlerArgs => ({
  source,
  skills: [],
  yes: false,
  force: false,
  preview: false,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("fork.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fork-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (wsOverrides?: Partial<WorkspaceMutationsOptions>) => {
    const { layer: rendererLayer, state: rendererState } = TestRenderer.make();
    const authGuardInteraction = AuthGuardInteractionTest({
      confirmLogin: () => Effect.succeed(true),
    });
    const BaseLayer = Layer.mergeAll(
      NodeServices.layer,
      rendererLayer,
      authGuardInteraction.layer,
      TestFlagsLayer(),
      Layer.succeed(RegistryUrl, "https://registry.example.com"),
      CredentialStoreTest(),
    );
    const wsOptions: WorkspaceMutationsOptions = {
      scope: "project",
      ...wsOverrides,
    };
    const WsLayer = Layer.provide(
      coreWorkspaceLayer({
        ...wsOptions,
      }),
      BaseLayer,
    );
    const SPLayer = Layer.provide(SourceHostProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer, CodingAgentRepositoryLive);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    const logs = logsByTag(rendererState);

    return { provide, logs, rendererState };
  };

  describe("single skill fork flow", () => {
    it.effect("forks an installed skill from source, publishes, and installs from registry", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      // Set up workspace with an installed local skill
      const skillsDir = path.join(tempDir, ".axm", "extensions", "external", "skills", "commit");
      createSkillMd(skillsDir, "commit", "Auto-commit");

      initWorkspace(
        path.join(tempDir, ".axm"),
        registryRoot,
        {
          commit: {
            type: "local",
            path: skillsDir,
            agents: ["claude-code"],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        { commit: `local:${skillsDir}` },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleFork(defaultArgs("commit"));

          // Should have logged success
          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Extension should exist in .axm/extensions/
          const managedDir = path.join(tempDir, ".axm", "extensions", "@test", "skills", "commit");
          expect(fs.existsSync(managedDir)).toBe(true);
          expect(fs.existsSync(path.join(managedDir, "skill.json"))).toBe(true);

          // Registry should have the published extension
          const registryIndexPath = path.join(
            registryRoot,
            "extensions",
            "@test",
            "skills",
            "commit",
            "index.json",
          );
          expect(fs.existsSync(registryIndexPath)).toBe(true);

          // install-skill step should have added the skill to settings.json
          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings).toMatchObject({
            skills: {
              commit: { source: "@test/skills/commit", authored: true },
            },
          });
        }),
      );
    });
  });

  describe("fork from local source string", () => {
    it.effect("discovers skills from a local directory and forks them", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      // Set up source skill directory
      const sourceDir = path.join(tempDir, "source-skills");
      createSkillMd(path.join(sourceDir, "code-review"), "code-review", "Code review skill");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handleFork(defaultArgs(sourceDir));

          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Extension should exist
          const managedDir = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@test",
            "skills",
            "code-review",
          );
          expect(fs.existsSync(managedDir)).toBe(true);
        }),
      );
    });
  });

  describe("fork with --skill glob filter", () => {
    it.effect("filters discovered skills by glob pattern", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      // Set up source directory with multiple skills
      const sourceDir = path.join(tempDir, "source-skills");
      createSkillMd(path.join(sourceDir, "effect-basics"), "effect-basics", "Effect basics");
      createSkillMd(path.join(sourceDir, "effect-testing"), "effect-testing", "Effect testing");
      createSkillMd(path.join(sourceDir, "other-skill"), "other-skill", "Other skill");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handleFork(defaultArgs(sourceDir, { skills: ["effect-*"] }));

          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Only effect-* skills should be forked
          for (const name of ["effect-basics", "effect-testing"]) {
            const managedDir = path.join(tempDir, ".axm", "extensions", "@test", "skills", name);
            expect(fs.existsSync(managedDir)).toBe(true);
          }

          // other-skill should NOT be forked
          const otherDir = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@test",
            "skills",
            "other-skill",
          );
          expect(fs.existsSync(otherDir)).toBe(false);
        }),
      );
    });

    it.effect("fails when --skill matches no discovered skills", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      const sourceDir = path.join(tempDir, "source-skills");
      createSkillMd(path.join(sourceDir, "my-skill"), "my-skill", "My skill");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handleFork(
            defaultArgs(sourceDir, { skills: ["nonexistent-*"] }),
          ).pipe(Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, what: e.what })));
          expect(result).toHaveProperty("error", true);
          expect(stringProperty(result, "what")).toContain("No skills matched");
        }),
      );
    });
  });

  describe("installed skill name resolution", () => {
    it.effect("resolves installed skill name via resolveSource", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      const skillsDir = path.join(tempDir, ".axm", "extensions", "external", "skills", "my-skill");
      createSkillMd(skillsDir, "my-skill", "My skill");

      initWorkspace(
        path.join(tempDir, ".axm"),
        registryRoot,
        {
          "my-skill": {
            type: "local",
            path: skillsDir,
            agents: ["claude-code"],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        { "my-skill": `local:${skillsDir}` },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleFork(defaultArgs("my-skill"));

          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Manifest should use the configured owner
          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@test",
            "skills",
            "my-skill",
            "skill.json",
          );
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.owner).toBe("@test");
          expect(manifest.type).toBe("skill");
          expect(manifest.name).toBe("my-skill");
        }),
      );
    });
  });

  describe("glob positional source", () => {
    it.effect("expands glob against lockfile skills and forks all matches", () => {
      const { provide, logs } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      for (const name of ["effect-basics", "effect-stream", "effect-testing", "commit"]) {
        const skillsDir = path.join(tempDir, ".axm", "extensions", "external", "skills", name);
        createSkillMd(skillsDir, name, name);
      }

      const lockSkills: Record<string, unknown> = {};
      const settingsSkills: Record<string, string> = {};
      for (const name of ["effect-basics", "effect-stream", "effect-testing", "commit"]) {
        const skillPath = path.join(tempDir, ".axm", "extensions", "external", "skills", name);
        lockSkills[name] = {
          type: "local",
          path: skillPath,
          agents: ["claude-code"],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        settingsSkills[name] = `local:${skillPath}`;
      }
      initWorkspace(path.join(tempDir, ".axm"), registryRoot, lockSkills, settingsSkills);

      return provide(
        Effect.gen(function* () {
          yield* handleFork(defaultArgs("effect-*"));
          expect(logs.success.some((m) => m.includes("Done"))).toBe(true);

          for (const name of ["effect-basics", "effect-stream", "effect-testing"]) {
            expect(
              fs.existsSync(path.join(tempDir, ".axm", "extensions", "@test", "skills", name)),
            ).toBe(true);
          }
          expect(
            fs.existsSync(path.join(tempDir, ".axm", "extensions", "@test", "skills", "commit")),
          ).toBe(false);
        }),
      );
    });

    it.effect("fails with NO_SKILLS_MATCHED when glob has no lockfile matches", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");
      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handleFork(defaultArgs("nonexistent-*")).pipe(
            Effect.catchTag("AppError", (e) => Effect.succeed({ error: true, code: e.code })),
          );
          expect(result).toHaveProperty("error", true);
          expect(stringProperty(result, "code")).toBe("NO_SKILLS_MATCHED");
        }),
      );
    });

    it.effect("matches on-disk configured skills from configured agent directories", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      const configuredDir = path.join(tempDir, ".claude", "skills", "configured-local");
      createSkillMd(configuredDir, "configured-local", "Configured local skill");
      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handleFork(defaultArgs("configured-*"));
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "@test", "skills", "configured-local"),
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("matches on-disk skills from configured agent directories", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      const diskOnlyDir = path.join(tempDir, ".claude", "skills", "disk-only-skill");
      createSkillMd(diskOnlyDir, "disk-only-skill", "Disk only skill");
      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handleFork(defaultArgs("disk-only-*"));
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "@test", "skills", "disk-only-skill"),
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("deduplicates glob candidates across lockfile settings and on-disk sources", () => {
      const { provide, rendererState } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      const sharedName = "shared-skill";
      const managedDir = path.join(tempDir, ".axm", "extensions", "external", "skills", sharedName);
      createSkillMd(managedDir, sharedName, "Installed");
      const agentDir = path.join(tempDir, ".claude", "skills", sharedName);
      createSkillMd(agentDir, sharedName, "Agent");
      initWorkspace(path.join(tempDir, ".axm"), registryRoot, {
        [sharedName]: {
          type: "local",
          path: managedDir,
          agents: ["claude-code"],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      const settingsPath = path.join(tempDir, ".axm", "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      settings.skills = { [sharedName]: `local:${managedDir}` };
      fs.writeFileSync(settingsPath, JSON.stringify(settings));

      return provide(
        Effect.gen(function* () {
          yield* handleFork(defaultArgs("shared-*"));
          expect(rendererState.spinnerMessages).toContain("Found 1 skill(s)");
        }),
      );
    });

    it.effect("shows expanded available candidates in NO_SKILLS_MATCHED details", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      const lockName = "alpha-locked";
      const lockDir = path.join(tempDir, ".axm", "extensions", "external", "skills", lockName);
      createSkillMd(lockDir, lockName, lockName);

      const diskName = "beta-disk";
      const diskDir = path.join(tempDir, ".claude", "skills", diskName);
      createSkillMd(diskDir, diskName, diskName);

      const gammaDir = path.join(tempDir, ".claude", "skills", "gamma-configured");
      createSkillMd(gammaDir, "gamma-configured", "gamma-configured");

      initWorkspace(
        path.join(tempDir, ".axm"),
        registryRoot,
        {
          [lockName]: {
            type: "local",
            path: lockDir,
            agents: ["claude-code"],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        {
          [lockName]: `local:${lockDir}`,
          "gamma-configured": `local:${gammaDir}`,
        },
      );

      return provide(
        Effect.gen(function* () {
          const result = yield* handleFork(defaultArgs("zzz-*")).pipe(
            Effect.catchTag("AppError", (e) =>
              Effect.succeed({ code: e.code, details: e.details ?? [] }),
            ),
          );
          const error = expectDefined(result, "Expected AppError for unmatched glob");
          expect(stringProperty(error, "code")).toBe("NO_SKILLS_MATCHED");
          expect(stringArrayProperty(error, "details")).toContain(
            "Available: alpha-locked, beta-disk, gamma-configured",
          );
        }),
      );
    });

    it.effect("applies --skill filter after positional glob expansion", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      for (const name of ["effect-basics", "effect-stream", "effect-testing"]) {
        const skillsDir = path.join(tempDir, ".axm", "extensions", "external", "skills", name);
        createSkillMd(skillsDir, name, name);
      }

      const lockSkills2: Record<string, unknown> = {};
      const settingsSkills2: Record<string, string> = {};
      for (const name of ["effect-basics", "effect-stream", "effect-testing"]) {
        const skillPath = path.join(tempDir, ".axm", "extensions", "external", "skills", name);
        lockSkills2[name] = {
          type: "local",
          path: skillPath,
          agents: ["claude-code"],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        settingsSkills2[name] = `local:${skillPath}`;
      }
      initWorkspace(path.join(tempDir, ".axm"), registryRoot, lockSkills2, settingsSkills2);

      return provide(
        Effect.gen(function* () {
          yield* handleFork(defaultArgs("effect-*", { skills: ["effect-basics"] }));
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "@test", "skills", "effect-basics"),
            ),
          ).toBe(true);
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "@test", "skills", "effect-stream"),
            ),
          ).toBe(false);
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "@test", "skills", "effect-testing"),
            ),
          ).toBe(false);
        }),
      );
    });

    it.effect("keeps non-glob source behavior unchanged", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      const skillsDir = path.join(tempDir, ".axm", "extensions", "external", "skills", "my-skill");
      createSkillMd(skillsDir, "my-skill", "My skill");
      initWorkspace(
        path.join(tempDir, ".axm"),
        registryRoot,
        {
          "my-skill": {
            type: "local",
            path: skillsDir,
            agents: ["claude-code"],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        { "my-skill": `local:${skillsDir}` },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleFork(defaultArgs("my-skill"));
          expect(
            fs.existsSync(path.join(tempDir, ".axm", "extensions", "@test", "skills", "my-skill")),
          ).toBe(true);
        }),
      );
    });
  });

  describe("unknown skill name", () => {
    it.effect("fails with INVALID_SOURCE and includes a concrete reason", () => {
      const { provide, rendererState } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handleFork(defaultArgs("nonexistent-skill")).pipe(
            Effect.catchTag("AppError", (e) =>
              Effect.succeed({ error: true, code: e.code, what: e.what, details: e.details }),
            ),
          );
          expect(result).toHaveProperty("error", true);
          expect(stringProperty(result, "what")).toContain("Invalid source");
          expect(stringProperty(result, "code")).toBe("INVALID_SOURCE");
          const reason = stringArrayProperty(result, "details").find((d) =>
            d.startsWith("Reason:"),
          );
          expect(reason).toBeDefined();
          expect(reason).not.toBe("Reason:");
          expect(rendererState.spinnerMessages).toContain("Resolving skills...");
          expect(rendererState.spinnerMessages).toContain("Failed");
        }),
      );
    });

    it.effect(
      "returns DISCOVER_FAILED with a concrete reason when local source discovery fails",
      () => {
        const { provide } = makeLayers();
        const registryRoot = path.join(tempDir, "registry");

        initWorkspace(path.join(tempDir, ".axm"), registryRoot);

        return provide(
          Effect.gen(function* () {
            const result = yield* handleFork(defaultArgs("/path/does/not/exist")).pipe(
              Effect.catchTag("AppError", (e) =>
                Effect.succeed({ code: e.code, details: e.details }),
              ),
            );
            const error = expectDefined(result, "Expected AppError for discovery failure");
            expect(stringProperty(error, "code")).toBe("DISCOVER_FAILED");
            const reason = stringArrayProperty(error, "details").find((d) =>
              d.startsWith("Reason:"),
            );
            expect(reason).toBeDefined();
            expect(reason).not.toBe("Reason:");
          }),
        );
      },
    );
  });

  describe("owner resolution", () => {
    it.effect("uses owner from project settings", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      const skillsDir = path.join(tempDir, ".axm", "extensions", "external", "skills", "my-skill");
      createSkillMd(skillsDir, "my-skill", "My skill");

      initWorkspace(
        path.join(tempDir, ".axm"),
        registryRoot,
        {
          "my-skill": {
            type: "local",
            path: skillsDir,
            agents: ["claude-code"],
            installedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        { "my-skill": `local:${skillsDir}` },
      );

      return provide(
        Effect.gen(function* () {
          yield* handleFork(defaultArgs("my-skill"));

          // Manifest should use the configured owner
          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@test",
            "skills",
            "my-skill",
            "skill.json",
          );
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.owner).toBe("@test");
          expect(manifest.type).toBe("skill");
          expect(manifest.name).toBe("my-skill");
        }),
      );
    });
  });
});
