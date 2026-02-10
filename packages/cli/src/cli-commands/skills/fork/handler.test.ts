/**
 * Unit tests for the fork command handler.
 *
 * Tests the registry guard → resolve → scope → plan build → apply flow.
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
import { LockfileServiceLive } from "../../../lockfile/index.js";
import { SettingsServiceLive } from "../../../settings/index.js";
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
      sources: [{ name: "local", source: "registry", location: registryRoot }],
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
    const SSLayer = Layer.provide(SettingsServiceLive, Layer.merge(BaseLayer, WsLayer));
    const LSLayer = Layer.provide(LockfileServiceLive, Layer.merge(BaseLayer, WsLayer));
    const SPLayer = Layer.provide(SourceProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SSLayer, LSLayer, SPLayer);

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
      const skillsDir = path.join(tempDir, ".agents", "skills", "commit");
      createSkillMd(skillsDir, "commit", "Auto-commit");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot, {
        commit: {
          source: "local",
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

  describe("scope resolution", () => {
    it.effect("uses scope from project settings", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      const skillsDir = path.join(tempDir, ".agents", "skills", "my-skill");
      createSkillMd(skillsDir, "my-skill");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot, {
        "my-skill": {
          source: "local",
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

  describe("glob-based batch fork", () => {
    it.effect("forks multiple skills matching a glob pattern", () => {
      const { provide, mockLog } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      // Set up multiple installed skills
      for (const name of ["effect-basics", "effect-testing", "effect-errors"]) {
        const dir = path.join(tempDir, ".agents", "skills", name);
        createSkillMd(dir, name);
      }

      initWorkspace(path.join(tempDir, ".axm"), registryRoot, {
        "effect-basics": {
          source: "local",
          path: path.join(tempDir, ".agents", "skills", "effect-basics"),
          agents: ["claude-code"],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        "effect-testing": {
          source: "local",
          path: path.join(tempDir, ".agents", "skills", "effect-testing"),
          agents: ["claude-code"],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        "effect-errors": {
          source: "local",
          path: path.join(tempDir, ".agents", "skills", "effect-errors"),
          agents: ["claude-code"],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleFork(defaultArgs("effect-*"));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);

          // All three should be forked
          for (const name of ["effect-basics", "effect-testing", "effect-errors"]) {
            const managedDir = path.join(tempDir, ".axm", "extensions", "@test", "skills", name);
            expect(fs.existsSync(managedDir)).toBe(true);
          }
        }),
      );
    });

    it.effect("fails when glob matches no installed skills", () => {
      const { provide } = makeLayers();
      const registryRoot = path.join(tempDir, "registry");

      initWorkspace(path.join(tempDir, ".axm"), registryRoot);

      return provide(
        Effect.gen(function* () {
          const result = yield* handleFork(defaultArgs("nonexistent-*")).pipe(
            Effect.catchTag("ForkError", (e) =>
              Effect.succeed({ error: true, message: e.message }),
            ),
          );
          expect(result).toHaveProperty("error", true);
          expect((result as { message: string }).message).toContain("No installed skills match");
        }),
      );
    });
  });
});
