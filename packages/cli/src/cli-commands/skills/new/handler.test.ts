/**
 * Unit tests for the skills new handler.
 *
 * Tests namespace resolution, name validation, manifest creation, SKILL.md,
 * settings registration, agent symlinks, and error paths.
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
} from "../../../tui/index.js";
import { layer as workspaceLayer, type WorkspaceContextOptions } from "../../../workspace/index.js";
import { type CliError } from "../../../cli-error/index.js";
import { handleSkillsNew, type SkillsNewHandlerArgs } from "./handler.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const initWorkspace = (
  axmDir: string,
  opts: {
    namespace?: string;
    skills?: Record<string, unknown>;
    agents?: string[];
  } = {},
) => {
  fs.mkdirSync(axmDir, { recursive: true });
  const settings: Record<string, unknown> = {
    agents: opts.agents ?? ["claude-code"],
    ...(opts.namespace && { namespace: opts.namespace }),
    ...(opts.skills && { skills: opts.skills }),
  };
  fs.writeFileSync(path.join(axmDir, "settings.json"), JSON.stringify(settings));
  fs.writeFileSync(
    path.join(axmDir, "axm-lock.yaml"),
    YAML.stringify({ lockfileVersion: 1, skills: {} }),
  );
};

const defaultArgs = (
  name: string,
  overrides: Partial<SkillsNewHandlerArgs> = {},
): SkillsNewHandlerArgs => ({
  name,
  namespace: Option.none(),
  agents: Option.none(),
  yes: true,
  ...overrides,
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("skills-new.handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-new-handler-test-"));
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper
    const provide = <A, E>(effect: Effect.Effect<A, E, any>) =>
      effect.pipe(Effect.provide(FullLayer));

    return { provide, mockLog };
  };

  describe("success", () => {
    it.effect("creates skill with manifest, SKILL.md, settings, and symlinks", () => {
      const { provide, mockLog } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { namespace: "@acme", agents: ["claude-code"] });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("my-skill"));

          // Verify manifest
          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "skills",
            "my-skill",
            "axm-skill.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(true);
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.name).toBe("@acme/skills/my-skill");
          expect(manifest.version).toBe("0.0.1");

          // Verify SKILL.md
          const skillMdPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "skills",
            "my-skill",
            "src",
            "SKILL.md",
          );
          expect(fs.existsSync(skillMdPath)).toBe(true);
          const skillMd = fs.readFileSync(skillMdPath, "utf-8");
          expect(skillMd).toContain("name: my-skill");
          expect(skillMd).toContain("description: A new skill");

          // Verify settings registration
          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.skills).toBeDefined();
          expect(settings.skills["my-skill"]).toBe("@acme/skills/my-skill");

          // Verify symlink
          const symlinkPath = path.join(tempDir, ".claude", "skills", "my-skill");
          expect(fs.existsSync(symlinkPath)).toBe(true);
          expect(fs.lstatSync(symlinkPath).isSymbolicLink()).toBe(true);

          expect(mockLog.logs.success.some((m) => m.includes("@acme/skills/my-skill"))).toBe(true);
        }),
      );
    });
  });

  describe("namespace override", () => {
    it.effect("uses --namespace override instead of workspace namespace", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { namespace: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("my-skill", { namespace: Option.some("@corp") }));

          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@corp",
            "skills",
            "my-skill",
            "axm-skill.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(true);

          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.name).toBe("@corp/skills/my-skill");
        }),
      );
    });

    it.effect("normalizes namespace without @ prefix", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { namespace: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("my-skill", { namespace: Option.some("corp") }));

          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@corp",
            "skills",
            "my-skill",
            "axm-skill.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(true);

          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
          expect(manifest.name).toBe("@corp/skills/my-skill");
        }),
      );
    });
  });

  describe("no namespace configured", () => {
    it.effect("fails when no namespace is configured and no --namespace override", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"));

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSkillsNew(defaultArgs("my-skill")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).what).toContain("No namespace configured");
        }),
      );
    });
  });

  describe("name validation", () => {
    it.effect("rejects name starting with hyphen", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { namespace: "@acme" });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSkillsNew(defaultArgs("-bad-name")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).code).toBe("SKILL_NAME_INVALID");
        }),
      );
    });

    it.effect("rejects uppercase name", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { namespace: "@acme" });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSkillsNew(defaultArgs("MySkill")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).code).toBe("SKILL_NAME_INVALID");
        }),
      );
    });

    it.effect("rejects name exceeding 64 characters", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { namespace: "@acme" });
      const longName = "a".repeat(65);

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSkillsNew(defaultArgs(longName)).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).code).toBe("SKILL_NAME_INVALID");
        }),
      );
    });
  });

  describe("skill already exists", () => {
    it.effect("fails when skill already exists in settings", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        namespace: "@acme",
        skills: { "my-skill": "@acme/skills/my-skill" },
      });

      return provide(
        Effect.gen(function* () {
          const error = yield* handleSkillsNew(defaultArgs("my-skill")).pipe(Effect.flip);
          expect(error._tag).toBe("CliError");
          expect((error as CliError).what).toContain("already exists");
        }),
      );
    });
  });

  describe("SKILL.md content", () => {
    it.effect("writes SKILL.md with frontmatter and placeholder body", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), { namespace: "@acme" });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("my-tool"));

          const skillMdPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "skills",
            "my-tool",
            "src",
            "SKILL.md",
          );
          const content = fs.readFileSync(skillMdPath, "utf-8");

          // Check frontmatter
          expect(content).toMatch(/^---\n/);
          expect(content).toContain("name: my-tool");
          expect(content).toContain("description: A new skill");
          // Check body
          expect(content).toContain("Describe what this skill does");
        }),
      );
    });
  });

  describe("preview mode", () => {
    it.effect("performs no writes when preview mode is active", () => {
      const { provide, mockLog } = makeLayers({ preview: true, yes: false });
      initWorkspace(path.join(tempDir, ".axm"), { namespace: "@acme", agents: ["claude-code"] });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("my-skill", { yes: false }));

          // Manifest should NOT be created
          const manifestPath = path.join(
            tempDir,
            ".axm",
            "extensions",
            "@acme",
            "skills",
            "my-skill",
            "axm-skill.json",
          );
          expect(fs.existsSync(manifestPath)).toBe(false);

          // Settings should NOT have the skill registered
          const settingsPath = path.join(tempDir, ".axm", "settings.json");
          const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
          expect(settings.skills?.["my-skill"]).toBeUndefined();

          // Agent symlink should NOT exist
          const symlinkPath = path.join(tempDir, ".claude", "skills", "my-skill");
          expect(fs.existsSync(symlinkPath)).toBe(false);

          // Preview log message should appear
          expect(mockLog.logs.info.some((m) => m.includes("Previewing"))).toBe(true);
        }),
      );
    });
  });

  describe("agent symlinks", () => {
    it.effect("creates symlinks for all configured agents", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        namespace: "@acme",
        agents: ["claude-code", "cursor"],
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("my-skill"));

          const claudeLink = path.join(tempDir, ".claude", "skills", "my-skill");
          const cursorLink = path.join(tempDir, ".cursor", "skills", "my-skill");

          expect(fs.existsSync(claudeLink)).toBe(true);
          expect(fs.lstatSync(claudeLink).isSymbolicLink()).toBe(true);
          expect(fs.existsSync(cursorLink)).toBe(true);
          expect(fs.lstatSync(cursorLink).isSymbolicLink()).toBe(true);
        }),
      );
    });

    it.effect("narrows symlinks to --agent flag agents only", () => {
      const { provide } = makeLayers();
      initWorkspace(path.join(tempDir, ".axm"), {
        namespace: "@acme",
        agents: ["claude-code", "cursor"],
      });

      return provide(
        Effect.gen(function* () {
          yield* handleSkillsNew(defaultArgs("my-skill", { agents: Option.some(["claude-code"]) }));

          const claudeLink = path.join(tempDir, ".claude", "skills", "my-skill");
          const cursorLink = path.join(tempDir, ".cursor", "skills", "my-skill");

          expect(fs.existsSync(claudeLink)).toBe(true);
          expect(fs.lstatSync(claudeLink).isSymbolicLink()).toBe(true);
          // cursor should NOT have a symlink
          expect(fs.existsSync(cursorLink)).toBe(false);
        }),
      );
    });
  });
});
