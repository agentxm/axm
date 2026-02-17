/**
 * Unit tests for the install command handler.
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
import {
  makeConfirmTestLayer,
  makeLogTestLayer,
  makeMultiselectTestLayer,
  makeSelectTestLayer,
  makeSpinnerTestLayer,
} from "../../../tui/index.js";
import { layer as workspaceLayer, type WorkspaceContextOptions } from "../../../workspace/index.js";
import { SourceHostProvidersLive } from "../../../sources/index.js";
import { handleInstall, type InstallHandlerArgs } from "./handler.js";
import { CliError } from "../../../cli-error/index.js";

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

describe.skip("install.handler", () => {
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
    tuiConfig?: {
      confirmBehavior?: import("../../../tui/index.js").ConfirmBehavior;
      selectBehavior?: import("../../../tui/index.js").SelectBehavior;
      multiselectBehavior?: import("../../../tui/index.js").MultiselectBehavior;
    },
    wsOverrides?: Partial<WorkspaceContextOptions>,
  ) => {
    const [logLayer, mockLog] = makeLogTestLayer();
    const [spinnerLayer, mockSpinner] = makeSpinnerTestLayer();
    const [confirmLayer] = makeConfirmTestLayer(
      tuiConfig?.confirmBehavior ?? { type: "return", value: true },
    );
    const [selectLayer] = makeSelectTestLayer(
      tuiConfig?.selectBehavior ?? { type: "return", index: 0 },
    );
    const [multiselectLayer] = makeMultiselectTestLayer(
      tuiConfig?.multiselectBehavior ?? { type: "return", indices: [] },
    );
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
    const SPLayer = Layer.provide(SourceHostProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: layer provides all required services
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    return { provide, mockLog, mockSpinner };
  };

  // ---------------------------------------------------------------------------
  // Plan build + display
  // ---------------------------------------------------------------------------

  describe("plan build and display (preview mode)", () => {
    it.effect("builds plan from operations and lockfile, displays it", () => {
      const { provide, mockLog } = makeLayers(
        {
          confirmBehavior: { type: "return", value: true },
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
          const allLogs = [...mockLog.logs.info, ...mockLog.logs.success, ...mockLog.logs.message];
          expect(allLogs.some((m) => m.includes("commit"))).toBe(true);
        }),
      );
    });

    it.effect("marks already-installed skills as no-op in display", () => {
      const { provide, mockLog } = makeLayers(
        {
          confirmBehavior: { type: "return", value: true },
        },
        { preview: true, yes: false },
      );
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");

      // Pre-install "commit" in lockfile
      initWorkspace(path.join(tempDir, ".axm"), {
        commit: {
          type: "local",
          path: "/old",
          agents: [],
          installedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      return provide(
        Effect.gen(function* () {
          yield* handleInstall(defaultArgs(skillsDir, { yes: false }));

          const allLogs = [...mockLog.logs.warn, ...mockLog.logs.info, ...mockLog.logs.message];
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
      const { provide, mockLog } = makeLayers();
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleInstall(defaultArgs(skillsDir, { yes: true }));

          // Apply was called — should log success for skill
          expect(mockLog.logs.success.some((m) => m.includes("commit"))).toBe(true);
          // Should end with Done
          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Confirm prompt
  // ---------------------------------------------------------------------------

  describe("confirm prompt (preview mode)", () => {
    it.effect("applies plan when user confirms", () => {
      const { provide, mockLog } = makeLayers(
        {
          confirmBehavior: { type: "return", value: true },
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
          expect(mockLog.logs.success.some((m) => m.includes("commit"))).toBe(true);
          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);
        }),
      );
    });

    it.effect("exits without applying when user declines", () => {
      const { provide, mockLog } = makeLayers(
        {
          confirmBehavior: { type: "return", value: false },
        },
        { preview: true, yes: false, nonInteractive: Option.some(false) },
      );
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleInstall(defaultArgs(skillsDir, { yes: false }));

          // Should show cancelled (resolvePlan does log.success("Cancelled."))
          expect(mockLog.logs.success.some((m) => m.includes("Cancel"))).toBe(true);
          // Should NOT have applied (no checkmark in success logs)
          expect(mockLog.logs.success.filter((m) => m.includes("\u2713"))).toHaveLength(0);
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
          const canonicalPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "external",
            "skills",
            "commit",
          );
          expect(fs.existsSync(canonicalPath)).toBe(true);
          expect(fs.existsSync(path.join(canonicalPath, "SKILL.md"))).toBe(true);

          // Agent symlink should be created (.claude/skills/commit → canonical)
          const agentSkillPath = path.join(tempDir, ".claude", "skills", "commit");
          expect(fs.existsSync(agentSkillPath)).toBe(true);
        }),
      );
    });

    it.effect("reports success results via log", () => {
      const { provide, mockLog } = makeLayers();
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleInstall(defaultArgs(skillsDir));

          expect(mockLog.logs.success.some((m) => m.includes("commit"))).toBe(true);
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
          expect(lockfile.skills.commit.type).toBe("local");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Glob filtering
  // ---------------------------------------------------------------------------

  describe("glob filtering", () => {
    it.effect("installs only skills matching a glob pattern", () => {
      const { provide, mockLog } = makeLayers();
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "effect-basics"), "effect-basics", "Effect basics");
      createSkillMd(path.join(skillsDir, "effect-stream"), "effect-stream", "Effect streams");
      createSkillMd(path.join(skillsDir, "testing-unit"), "testing-unit", "Unit testing");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleInstall(defaultArgs(skillsDir, { skills: ["effect-*"], all: false }));

          // effect-basics and effect-stream should be installed
          expect(mockLog.logs.success.some((m) => m.includes("effect-basics"))).toBe(true);
          expect(mockLog.logs.success.some((m) => m.includes("effect-stream"))).toBe(true);
          // testing-unit should NOT be installed
          expect(mockLog.logs.success.some((m) => m.includes("testing-unit"))).toBe(false);
          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);
        }),
      );
    });

    it.effect("installs skills matching multiple patterns (glob + exact)", () => {
      const { provide, mockLog } = makeLayers();
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "effect-basics"), "effect-basics", "Effect basics");
      createSkillMd(path.join(skillsDir, "effect-stream"), "effect-stream", "Effect streams");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");
      createSkillMd(path.join(skillsDir, "review-pr"), "review-pr", "PR review");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleInstall(
            defaultArgs(skillsDir, { skills: ["effect-*", "commit"], all: false }),
          );

          expect(mockLog.logs.success.some((m) => m.includes("effect-basics"))).toBe(true);
          expect(mockLog.logs.success.some((m) => m.includes("effect-stream"))).toBe(true);
          expect(mockLog.logs.success.some((m) => m.includes("commit"))).toBe(true);
          // review-pr should NOT be installed
          expect(mockLog.logs.success.some((m) => m.includes("review-pr"))).toBe(false);
          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);
        }),
      );
    });

    it.effect("fails when glob pattern matches no skills", () => {
      const { provide } = makeLayers();
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleInstall(
            defaultArgs(skillsDir, { skills: ["nonexistent-*"], all: false }),
          ).pipe(Effect.flip);

          expect(error._tag).toBe("CliError");
          expect((error as CliError).what).toContain("No skills matched");
          expect((error as CliError).details.join(", ")).toContain("commit");
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------

  describe("summary", () => {
    it.effect("shows Done success after apply", () => {
      const { provide, mockLog } = makeLayers();
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleInstall(defaultArgs(skillsDir));

          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);
        }),
      );
    });
  });
});
