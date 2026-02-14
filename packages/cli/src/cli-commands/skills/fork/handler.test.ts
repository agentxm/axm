/**
 * Unit tests for the fork command handler.
 *
 * Tests the registry guard → parse source → discover → filter → plan build → apply flow.
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
import {
  makeConfirmTestLayer,
  makeLogTestLayer,
  makeMultiselectTestLayer,
  makeSelectTestLayer,
  makeSpinnerTestLayer,
} from "../../../tui/index.js";
import { layer as workspaceLayer, type WorkspaceContextOptions } from "../../../workspace/index.js";
import { SourceProvidersLive } from "../../../sources/index.js";
import { handleFork, type ForkHandlerArgs } from "./handler.js";

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
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  fs.mkdirSync(registryRoot, { recursive: true });
  fs.writeFileSync(
    path.join(axmDir, "settings.json"),
    JSON.stringify({
      scope: "@test",
      agents: ["claude-code"],
      sources: [{ name: "local", type: "registry", url: new URL(`file://${registryRoot}`) }],
    }),
  );
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
  yes: true,
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

  const makeLayers = (wsOverrides?: Partial<WorkspaceContextOptions>) => {
    const [logLayer, mockLog] = makeLogTestLayer();
    const [spinnerLayer, mockSpinner] = makeSpinnerTestLayer();
    const [confirmLayer] = makeConfirmTestLayer({ type: "return", value: true });
    const [selectLayer] = makeSelectTestLayer({ type: "return", index: 0 });
    const [multiselectLayer] = makeMultiselectTestLayer({ type: "return", indices: [] });
    const BaseLayer = Layer.mergeAll(
      NodeContext.layer,
      logLayer,
      spinnerLayer,
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
    const SPLayer = Layer.provide(SourceProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    return { provide, mockLog, mockSpinner };
  };

  describe("single skill fork flow", () => {
    it.effect("forks an installed skill from source, publishes, and installs from registry", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      // Set up workspace with an installed local skill
      const skillsDir = path.join(tempDir, ".axm", "extensions", "external", "skills", "commit");
      createSkillMd(skillsDir, "commit", "Auto-commit");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot, {
        commit: {
          type: "local",
          path: skillsDir,
          agents: ["claude-code"],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleFork(defaultArgs("commit"));

          // Should have logged success
          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Managed extension should exist in .axm/extensions/
          const managedDir = path.join(tempDir, ".axm", "extensions", "@test", "skills", "commit");
          expect(fs.existsSync(managedDir)).toBe(true);
          expect(fs.existsSync(path.join(managedDir, "axm-skill.json"))).toBe(true);

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
          expect(settings.skills).toBeDefined();
          expect(settings.skills.commit).toBe("@test/commit");
        }),
      );
    });
  });

  describe("fork from local source string", () => {
    it.effect("discovers skills from a local directory and forks them", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      // Set up source skill directory
      const sourceDir = path.join(tempDir, "source-skills");
      createSkillMd(path.join(sourceDir, "code-review"), "code-review", "Code review skill");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          yield* handleFork(defaultArgs(sourceDir));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Managed extension should exist
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
      const { provide, mockLog } = makeLayers();
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

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

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
          ).pipe(Effect.catchTag("CliError", (e) => Effect.succeed({ error: true, what: e.what })));
          expect(result).toHaveProperty("error", true);
          expect((result as { what: string }).what).toContain("No skills matched");
        }),
      );
    });
  });

  describe("installed skill name resolution", () => {
    it.effect("resolves installed skill name via resolveSource", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      const skillsDir = path.join(tempDir, ".axm", "extensions", "external", "skills", "my-skill");
      createSkillMd(skillsDir, "my-skill", "My skill");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot, {
        "my-skill": {
          type: "local",
          path: skillsDir,
          agents: ["claude-code"],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleFork(defaultArgs("my-skill"));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

          // Manifest should use the configured scope
          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@test",
            "skills",
            "my-skill",
            "axm-skill.json",
          );
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.name).toBe("@test/my-skill");
        }),
      );
    });
  });

  describe("glob positional source", () => {
    it.effect("expands glob against lockfile skills and forks all matches", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      for (const name of ["effect-basics", "effect-stream", "effect-testing", "commit"]) {
        const skillsDir = path.join(tempDir, ".axm", "extensions", "external", "skills", name);
        createSkillMd(skillsDir, name, name);
      }

      initWorkspace(path.join(tempDir, ".axm"), registryRoot, {
        "effect-basics": {
          type: "local",
          path: path.join(tempDir, ".axm", "extensions", "external", "skills", "effect-basics"),
          agents: ["claude-code"],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        "effect-stream": {
          type: "local",
          path: path.join(tempDir, ".axm", "extensions", "external", "skills", "effect-stream"),
          agents: ["claude-code"],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        "effect-testing": {
          type: "local",
          path: path.join(tempDir, ".axm", "extensions", "external", "skills", "effect-testing"),
          agents: ["claude-code"],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        commit: {
          type: "local",
          path: path.join(tempDir, ".axm", "extensions", "external", "skills", "commit"),
          agents: ["claude-code"],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleFork(defaultArgs("effect-*"));
          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

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
            Effect.catchTag("CliError", (e) => Effect.succeed({ error: true, code: e.code })),
          );
          expect(result).toHaveProperty("error", true);
          expect((result as { code: string }).code).toBe("NO_SKILLS_MATCHED");
        }),
      );
    });

    it.effect("matches unmanaged configured skills from configured agent directories", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      const unmanagedDir = path.join(tempDir, ".claude", "skills", "unmanaged-configured");
      createSkillMd(unmanagedDir, "unmanaged-configured", "Unmanaged configured");
      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      const settingsPath = path.join(tempDir, ".axm", "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      settings.skills = { "unmanaged-configured": { managed: false } };
      fs.writeFileSync(settingsPath, JSON.stringify(settings));

      return provide(
        Effect.gen(function* () {
          yield* handleFork(defaultArgs("unmanaged-*"));
          expect(
            fs.existsSync(
              path.join(tempDir, ".axm", "extensions", "@test", "skills", "unmanaged-configured"),
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("matches unmanaged on-disk skills from configured agent directories", () => {
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
      const { provide, mockSpinner } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      const sharedName = "shared-skill";
      const managedDir = path.join(tempDir, ".axm", "extensions", "external", "skills", sharedName);
      createSkillMd(managedDir, sharedName, "Managed");
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
      settings.skills = { [sharedName]: { managed: false } };
      fs.writeFileSync(settingsPath, JSON.stringify(settings));

      return provide(
        Effect.gen(function* () {
          yield* handleFork(defaultArgs("shared-*"));
          expect(mockSpinner.stops).toContain("Found 1 skill(s)");
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

      initWorkspace(path.join(tempDir, ".axm"), registryRoot, {
        [lockName]: {
          type: "local",
          path: lockDir,
          agents: ["claude-code"],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      const settingsPath = path.join(tempDir, ".axm", "settings.json");
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      settings.skills = {
        "gamma-configured": { managed: false },
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings));

      return provide(
        Effect.gen(function* () {
          const result = yield* handleFork(defaultArgs("zzz-*")).pipe(
            Effect.catchTag("CliError", (e) =>
              Effect.succeed({ code: e.code, details: e.details ?? [] }),
            ),
          );
          if (result === undefined) {
            throw new Error("Expected CliError for unmatched glob");
          }
          expect((result as { code: string }).code).toBe("NO_SKILLS_MATCHED");
          expect((result as { details: ReadonlyArray<string> }).details).toContain(
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

      initWorkspace(path.join(tempDir, ".axm"), registryRoot, {
        "effect-basics": {
          type: "local",
          path: path.join(tempDir, ".axm", "extensions", "external", "skills", "effect-basics"),
          agents: ["claude-code"],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        "effect-stream": {
          type: "local",
          path: path.join(tempDir, ".axm", "extensions", "external", "skills", "effect-stream"),
          agents: ["claude-code"],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        "effect-testing": {
          type: "local",
          path: path.join(tempDir, ".axm", "extensions", "external", "skills", "effect-testing"),
          agents: ["claude-code"],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

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
      initWorkspace(path.join(tempDir, ".axm"), registryRoot, {
        "my-skill": {
          type: "local",
          path: skillsDir,
          agents: ["claude-code"],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

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
    it.effect("fails with descriptive error for unknown skill name", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handleFork(defaultArgs("nonexistent-skill")).pipe(
            Effect.catchTag("CliError", (e) => Effect.succeed({ error: true, what: e.what })),
          );
          expect(result).toHaveProperty("error", true);
          expect((result as { what: string }).what).toContain("Invalid source");
        }),
      );
    });
  });

  describe("scope resolution", () => {
    it.effect("uses scope from project settings", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      const skillsDir = path.join(tempDir, ".axm", "extensions", "external", "skills", "my-skill");
      createSkillMd(skillsDir, "my-skill", "My skill");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot, {
        "my-skill": {
          type: "local",
          path: skillsDir,
          agents: ["claude-code"],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleFork(defaultArgs("my-skill"));

          // Manifest should use the configured scope
          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@test",
            "skills",
            "my-skill",
            "axm-skill.json",
          );
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.name).toBe("@test/my-skill");
        }),
      );
    });
  });
});
