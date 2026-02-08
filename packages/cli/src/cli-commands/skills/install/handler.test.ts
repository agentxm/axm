/**
 * Unit tests for the install command handler.
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
import { Clack, makeClackTestLayer, type MockClackConfig } from "../../../clack-effect/index.js";
import {
  WorkspaceContextTag,
  layer as workspaceLayer,
  type WorkspaceContextOptions,
} from "../../../workspace/index.js";
import { handleInstall, type InstallHandlerArgs } from "./handler.js";

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

/** Create an initialized workspace with settings + lockfile. */
const initWorkspace = (axmDir: string, lockfileSkills: Record<string, unknown> = {}) => {
  fs.mkdirSync(axmDir, { recursive: true });
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify({ agents: ["claude-code"] }));
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: lockfileSkills }),
  );
};

const defaultArgs = (
  source: string,
  overrides: Partial<InstallHandlerArgs> = {},
): InstallHandlerArgs => ({
  source,
  global: false,
  agents: [],
  skills: [],
  yes: true,
  list: false,
  all: true,
  force: false,
  nonInteractive: Option.some(true),
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("install.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "install-handler-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (
    clackConfig?: MockClackConfig,
    wsOverrides?: Partial<WorkspaceContextOptions>,
  ) => {
    const [ClackLayer, mockClack] = makeClackTestLayer(clackConfig);
    const BaseLayer = Layer.mergeAll(NodeContext.layer, ClackLayer);
    const wsOptions: WorkspaceContextOptions = {
      global: false,
      yes: true,
      nonInteractive: Option.some(true),
      preview: false,
      ...wsOverrides,
    };
    const WsLayer = Layer.provide(workspaceLayer(wsOptions), BaseLayer);
    const FullLayer = Layer.merge(BaseLayer, WsLayer);

    const provide = <A, E>(
      effect: Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Clack | WorkspaceContextTag>,
    ) => effect.pipe(Effect.provide(FullLayer));

    return { provide, mockClack };
  };

  // ---------------------------------------------------------------------------
  // Plan build + display
  // ---------------------------------------------------------------------------

  describe("plan build and display (preview mode)", () => {
    it.effect("builds plan from operations and lockfile, displays it", () => {
      const { provide, mockClack } = makeLayers(
        {
          confirmBehavior: Option.some({ type: "return", value: true }),
          selectBehavior: Option.none(),
          multiselectBehavior: Option.none(),
        },
        { preview: true, yes: false },
      );
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleInstall(defaultArgs(skillsDir, { yes: false }));

          // Plan was displayed — should show the skill to install
          const allLogs = [
            ...mockClack.logs.info,
            ...mockClack.logs.success,
            ...mockClack.logs.message,
          ];
          expect(allLogs.some((m) => m.includes("commit"))).toBe(true);
        }),
      );
    });

    it.effect("marks already-installed skills as no-op in display", () => {
      const { provide, mockClack } = makeLayers(
        {
          confirmBehavior: Option.some({ type: "return", value: true }),
          selectBehavior: Option.none(),
          multiselectBehavior: Option.none(),
        },
        { preview: true, yes: false },
      );
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");

      // Pre-install "commit" in lockfile
      initWorkspace(path.join(tempDir, ".axm"), {
        commit: {
          source: "local",
          path: "/old",
          agents: [],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleInstall(defaultArgs(skillsDir, { yes: false }));

          const allLogs = [
            ...mockClack.logs.warn,
            ...mockClack.logs.info,
            ...mockClack.logs.message,
          ];
          expect(allLogs.some((m) => m.includes("already installed"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // --yes skips confirmation
  // ---------------------------------------------------------------------------

  describe("--yes", () => {
    it.effect("applies plan without confirmation prompt", () => {
      const { provide, mockClack } = makeLayers();
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleInstall(defaultArgs(skillsDir, { yes: true }));

          // Apply was called — should log success for skill
          expect(mockClack.logs.success.some((m) => m.includes("commit"))).toBe(true);
          // Should end with Done
          expect(mockClack.logs.outro.some((m) => m.includes("Done"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Confirm prompt
  // ---------------------------------------------------------------------------

  describe("confirm prompt (preview mode)", () => {
    it.effect("applies plan when user confirms", () => {
      const { provide, mockClack } = makeLayers(
        {
          confirmBehavior: Option.some({ type: "return", value: true }),
          selectBehavior: Option.none(),
          multiselectBehavior: Option.none(),
        },
        { preview: true, yes: false, nonInteractive: Option.some(false) },
      );
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleInstall(defaultArgs(skillsDir, { yes: false }));

          // Apply was called
          expect(mockClack.logs.success.some((m) => m.includes("commit"))).toBe(true);
          expect(mockClack.logs.outro.some((m) => m.includes("Done"))).toBe(true);
        }),
      );
    });

    it.effect("exits without applying when user declines", () => {
      const { provide, mockClack } = makeLayers(
        {
          confirmBehavior: Option.some({ type: "return", value: false }),
          selectBehavior: Option.none(),
          multiselectBehavior: Option.none(),
        },
        { preview: true, yes: false, nonInteractive: Option.some(false) },
      );
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleInstall(defaultArgs(skillsDir, { yes: false }));

          // Should show cancelled
          expect(mockClack.logs.outro.some((m) => m.includes("Cancel"))).toBe(true);
          // Should NOT have applied (no checkmark in success logs)
          expect(mockClack.logs.success.filter((m) => m.includes("\u2713"))).toHaveLength(0);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Executor integration
  // ---------------------------------------------------------------------------

  describe("executor integration", () => {
    it.effect("passes installSkill executor to resolvePlan and installs files", () => {
      const { provide } = makeLayers();
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleInstall(defaultArgs(skillsDir));

          // Canonical directory should be created
          const canonicalPath = path.join(tempDir, ".agents", "skills", "commit");
          expect(fs.existsSync(canonicalPath)).toBe(true);
          expect(fs.existsSync(path.join(canonicalPath, "SKILL.md"))).toBe(true);

          // Agent symlink should be created (.claude/skills/commit → canonical)
          const agentSkillPath = path.join(tempDir, ".claude", "skills", "commit");
          expect(fs.existsSync(agentSkillPath)).toBe(true);
        }),
      );
    });

    it.effect("reports success results via clack", () => {
      const { provide, mockClack } = makeLayers();
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleInstall(defaultArgs(skillsDir));

          expect(mockClack.logs.success.some((m) => m.includes("commit"))).toBe(true);
        }),
      );
    });

    it.effect("updates lockfile after installation", () => {
      const { provide } = makeLayers();
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleInstall(defaultArgs(skillsDir));

          const lockfileContent = fs.readFileSync(
            path.join(tempDir, ".axm", "axm-lock.yaml"),
            "utf-8",
          );
          const lockfile = YAML.parse(lockfileContent);
          expect(lockfile.skills.commit).toBeDefined();
          expect(lockfile.skills.commit.source).toBe("local");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  describe("summary", () => {
    it.effect("shows Done outro after apply", () => {
      const { provide, mockClack } = makeLayers();
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleInstall(defaultArgs(skillsDir));

          expect(mockClack.logs.outro.some((m) => m.includes("Done"))).toBe(true);
        }),
      );
    });
  });
});
