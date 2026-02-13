/**
 * Unit tests for the update command handler.
 *
 * Tests the re-resolve → compare → update flow.
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
import { handleInstall, type InstallHandlerArgs } from "../install/handler.js";
import { handleUpdate, type UpdateHandlerArgs } from "./handler.js";

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
const initWorkspace = (
  axmDir: string,
  opts?: {
    skills?: Record<string, string>;
    lockfileSkills?: Record<string, unknown>;
  },
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  fs.writeFileSync(
    path.join(axmDir, "settings.json"),
    JSON.stringify({
      agents: ["claude-code"],
      ...(opts?.skills && { skills: opts.skills }),
    }),
  );
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: opts?.lockfileSkills ?? {} }),
  );
};

const defaultInstallArgs = (
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

const defaultUpdateArgs = (overrides: Partial<UpdateHandlerArgs> = {}): UpdateHandlerArgs => ({
  source: Option.none(),
  global: false,
  agents: [],
  skills: [],
  yes: true,
  force: false,
  nonInteractive: Option.some(true),
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("update.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "update-handler-test-"));
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
    const SPLayer = Layer.provide(SourceProvidersLive, Layer.merge(BaseLayer, WsLayer));
    const FullLayer = Layer.mergeAll(BaseLayer, WsLayer, SPLayer);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper: layer provides all required services
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    return { provide, mockLog, mockSpinner };
  };

  // ---------------------------------------------------------------------------
  // Update all skills
  // ---------------------------------------------------------------------------

  describe("update all skills", () => {
    it.effect("updates all installed local skills", () => {
      const { provide, mockLog } = makeLayers();
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");
      createSkillMd(path.join(skillsDir, "review-pr"), "review-pr", "PR review");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          // First install the skills
          yield* handleInstall(defaultInstallArgs(skillsDir));

          // Reset logs so we can cleanly check update output
          mockLog.logs.info.length = 0;
          mockLog.logs.success.length = 0;
          mockLog.logs.warn.length = 0;
          mockLog.logs.message.length = 0;

          // Now update all
          yield* handleUpdate(defaultUpdateArgs());

          // Both skills should be updated (local sources always update)
          const allLogs = [...mockLog.logs.success, ...mockLog.logs.message];
          expect(allLogs.some((m) => m.includes("commit"))).toBe(true);
          expect(allLogs.some((m) => m.includes("review-pr"))).toBe(true);
          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // --skill glob filtering
  // ---------------------------------------------------------------------------

  describe("--skill glob filtering", () => {
    it.effect("updates only skills matching the --skill glob pattern", () => {
      const { provide, mockLog } = makeLayers();
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "effect-basics"), "effect-basics", "Effect basics");
      createSkillMd(path.join(skillsDir, "effect-stream"), "effect-stream", "Effect streams");
      createSkillMd(path.join(skillsDir, "testing-unit"), "testing-unit", "Unit testing");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          // Install all skills first
          yield* handleInstall(defaultInstallArgs(skillsDir));

          mockLog.logs.info.length = 0;
          mockLog.logs.success.length = 0;
          mockLog.logs.warn.length = 0;
          mockLog.logs.message.length = 0;

          // Update only effect-* skills
          yield* handleUpdate(defaultUpdateArgs({ skills: ["effect-*"] }));

          const allLogs = [...mockLog.logs.success, ...mockLog.logs.message];
          expect(allLogs.some((m) => m.includes("effect-basics"))).toBe(true);
          expect(allLogs.some((m) => m.includes("effect-stream"))).toBe(true);
          expect(allLogs.some((m) => m.includes("testing-unit"))).toBe(false);
          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);
        }),
      );
    });

    it.effect("logs warning and returns when --skill matches no installed skills", () => {
      const { provide, mockLog } = makeLayers();
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleInstall(defaultInstallArgs(skillsDir));

          mockLog.logs.info.length = 0;
          mockLog.logs.success.length = 0;
          mockLog.logs.warn.length = 0;
          mockLog.logs.message.length = 0;

          yield* handleUpdate(defaultUpdateArgs({ skills: ["nonexistent-*"] }));

          expect(mockLog.logs.warn.some((m) => m.includes("No installed skills match"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // --force flag
  // ---------------------------------------------------------------------------

  describe("--force flag", () => {
    it.effect("forces update of all skills regardless of version", () => {
      const { provide, mockLog } = makeLayers();
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleInstall(defaultInstallArgs(skillsDir));

          mockLog.logs.info.length = 0;
          mockLog.logs.success.length = 0;
          mockLog.logs.warn.length = 0;
          mockLog.logs.message.length = 0;

          yield* handleUpdate(defaultUpdateArgs({ force: true }));

          const allLogs = [...mockLog.logs.success, ...mockLog.logs.message];
          expect(allLogs.some((m) => m.includes("commit"))).toBe(true);
          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Empty lockfile (no skills installed)
  // ---------------------------------------------------------------------------

  describe("no skills installed", () => {
    it.effect("logs info and returns early when no skills are installed", () => {
      const { provide, mockLog } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          yield* handleUpdate(defaultUpdateArgs());

          expect(mockLog.logs.info.some((m) => m.includes("No skills installed"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Source re-resolution failure for one skill (continues with others)
  // ---------------------------------------------------------------------------

  describe("partial re-resolution failure", () => {
    it.effect("warns for individual failures but continues with successful ones", () => {
      const { provide, mockLog } = makeLayers();
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");
      createSkillMd(path.join(skillsDir, "review-pr"), "review-pr", "PR review");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          // Install both skills
          yield* handleInstall(defaultInstallArgs(skillsDir));

          // Remove the source for one skill so re-resolution fails
          fs.rmSync(path.join(skillsDir, "review-pr"), { recursive: true, force: true });

          mockLog.logs.info.length = 0;
          mockLog.logs.success.length = 0;
          mockLog.logs.warn.length = 0;
          mockLog.logs.message.length = 0;

          yield* handleUpdate(defaultUpdateArgs());

          // Should warn about the failed one
          expect(mockLog.logs.warn.some((m) => m.includes("review-pr"))).toBe(true);
          // Should still succeed for the other
          const allLogs = [...mockLog.logs.success, ...mockLog.logs.message];
          expect(allLogs.some((m) => m.includes("commit"))).toBe(true);
          expect(mockLog.logs.success.some((m) => m.includes("Done"))).toBe(true);
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // All re-resolutions fail → error
  // ---------------------------------------------------------------------------

  describe("all re-resolutions fail", () => {
    it.effect("fails with UpdateError when all source re-resolutions fail", () => {
      const { provide } = makeLayers();
      const skillsDir = path.join(tempDir, "skills-source");
      createSkillMd(path.join(skillsDir, "commit"), "commit", "Auto-commit");
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          // Install the skill
          yield* handleInstall(defaultInstallArgs(skillsDir));

          // Remove the entire source directory
          fs.rmSync(skillsDir, { recursive: true, force: true });

          const error = yield* handleUpdate(defaultUpdateArgs()).pipe(Effect.flip);

          expect(error._tag).toBe("CliError");
        }),
      );
    });
  });
});
