import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach } from "vitest";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import type { AddSkillOperation } from "../operations.js";
import { installSkill } from "./install-skill.js";

/** Creates a layer providing FileSystem + a minimal Workspace service. */
const withServices = (axmDir: string) => {
  const mockWs: WorkspaceContextService = {
    global: false,
    path: axmDir,
    nonInteractive: true,
    preview: false,
    getSettings: () => Effect.succeed({ agents: [] }),
    getLockfile: () => Effect.succeed({ lockfileVersion: 1, skills: {} }),
    resolvePlan: () => Effect.succeed([]),
  };
  return Layer.merge(NodeFileSystem.layer, Workspace.layer(mockWs));
};

/** Creates a minimal AddSkillOperation for testing. */
const makeOp = (
  overrides: Partial<AddSkillOperation> & { skillName?: string; sourcePath?: string } = {},
): AddSkillOperation => ({
  _tag: "install-skill",
  source: { source: "local", path: "/tmp/source" },
  agents: overrides.agents ?? ["claude-code"],
  force: overrides.force ?? false,
  skill: {
    name: overrides.skillName ?? "my-skill",
    description: "A test skill",
    metadata: Option.none(),
  },
  path: Option.fromNullable(overrides.sourcePath ?? undefined),
  gitTreeSha: Option.none(),
  registry: Option.none(),
  ...overrides,
});

describe("installSkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "install-skill-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Sets up a source skill directory with a SKILL.md file. */
  const setupSource = (name = "my-skill") => {
    const src = path.join(tmpDir, "source", name);
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "SKILL.md"), `# ${name}`);
    fs.writeFileSync(path.join(src, "prompt.md"), "prompt content");
    return src;
  };

  /** Sets up a workspace base directory with .axm dir. */
  const setupBase = () => {
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });
    return { base, axmDir };
  };

  describe("happy path — sanitize→copy→symlink→lockfile pipeline", () => {
    it.effect("copies skill files to canonical location and creates symlink for agent", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        const result = yield* installSkill(
          makeOp({ agents: ["claude-code"], sourcePath: src }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.action).toBe("success");
        expect(result.message).toContain("my-skill");

        // Canonical location should have files
        const canonical = path.join(base, ".agents", "skills", "my-skill");
        expect(fs.existsSync(path.join(canonical, "SKILL.md"))).toBe(true);
        expect(fs.readFileSync(path.join(canonical, "prompt.md"), "utf-8")).toBe("prompt content");

        // Agent symlink should exist
        const agentSkillDir = path.join(base, ".claude", "skills", "my-skill");
        expect(fs.existsSync(agentSkillDir)).toBe(true);
        expect(fs.lstatSync(agentSkillDir).isSymbolicLink()).toBe(true);

        // Symlink should point to the canonical location
        const linkTarget = fs.readlinkSync(agentSkillDir);
        const resolved = path.resolve(path.dirname(agentSkillDir), linkTarget);
        expect(resolved).toBe(canonical);
      }),
    );

    it.effect("handles multiple agents concurrently", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        const result = yield* installSkill(
          makeOp({ agents: ["claude-code", "cursor"], sourcePath: src }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.action).toBe("success");

        // Both agent symlinks should exist
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(true);
        expect(fs.existsSync(path.join(base, ".cursor", "skills", "my-skill"))).toBe(true);
      }),
    );

    it.effect("sanitizes skill name for canonical directory", () =>
      Effect.gen(function* () {
        const src = setupSource("My Awesome Skill!!");
        const { axmDir, base } = setupBase();

        const result = yield* installSkill(
          makeOp({
            skillName: "My Awesome Skill!!",
            sourcePath: src,
            agents: ["claude-code"],
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.action).toBe("success");

        // Should be sanitized to lowercase with hyphens
        const canonical = path.join(base, ".agents", "skills", "my-awesome-skill");
        expect(fs.existsSync(canonical)).toBe(true);
      }),
    );
  });

  describe("self-reference detection for universal agents", () => {
    it.effect("skips symlink for agents whose skills.dir is .agents/skills", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        // amp uses .agents/skills — same as canonical location
        const result = yield* installSkill(makeOp({ agents: ["amp"], sourcePath: src })).pipe(
          Effect.provide(withServices(axmDir)),
        );

        expect(result.action).toBe("success");

        // Canonical location should exist (from copy)
        const canonical = path.join(base, ".agents", "skills", "my-skill");
        expect(fs.existsSync(canonical)).toBe(true);

        // Should be a real directory, not a symlink
        expect(fs.lstatSync(canonical).isDirectory()).toBe(true);
        expect(fs.lstatSync(canonical).isSymbolicLink()).toBe(false);
      }),
    );

    it.effect("skips symlink for universal agents but creates for non-universal", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        // amp (universal: .agents/skills) + claude-code (non-universal: .claude/skills)
        const result = yield* installSkill(
          makeOp({ agents: ["amp", "claude-code"], sourcePath: src }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.action).toBe("success");

        // Canonical should be a directory (not a symlink)
        const canonical = path.join(base, ".agents", "skills", "my-skill");
        expect(fs.lstatSync(canonical).isDirectory()).toBe(true);

        // claude-code should have a symlink
        const claudeSkill = path.join(base, ".claude", "skills", "my-skill");
        expect(fs.lstatSync(claudeSkill).isSymbolicLink()).toBe(true);
      }),
    );
  });

  describe("error cases", () => {
    it.effect("yields OperationError when source path is not available", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();

        const result = yield* installSkill(makeOp({ path: Option.none() })).pipe(
          Effect.provide(withServices(axmDir)),
          // OperationError is in the E channel — catch it as applyPlan would
          Effect.catchTag("OperationError", (e) =>
            Effect.succeed({ action: "error" as const, message: e.message }),
          ),
        );

        expect(result.action).toBe("error");
        expect(result.message).toContain("No source path");
      }),
    );

    it.effect("yields OperationError on copy failure (non-existent source)", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();

        const result = yield* installSkill(
          makeOp({
            sourcePath: path.join(tmpDir, "nonexistent"),
            agents: ["claude-code"],
          }),
        ).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catchTag("OperationError", (e) =>
            Effect.succeed({ action: "error" as const, message: e.message }),
          ),
        );

        expect(result.action).toBe("error");
        expect(result.message).toContain("Failed to copy");
      }),
    );
  });

  describe("clean-slate copy", () => {
    it.effect("removes existing canonical directory before copying", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        // Pre-create canonical with stale content
        const canonical = path.join(base, ".agents", "skills", "my-skill");
        fs.mkdirSync(canonical, { recursive: true });
        fs.writeFileSync(path.join(canonical, "stale.txt"), "old content");

        const result = yield* installSkill(
          makeOp({ agents: ["claude-code"], sourcePath: src }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.action).toBe("success");

        // Stale file should be gone
        expect(fs.existsSync(path.join(canonical, "stale.txt"))).toBe(false);
        // New files should exist
        expect(fs.existsSync(path.join(canonical, "SKILL.md"))).toBe(true);
      }),
    );
  });

  describe("lockfile update", () => {
    it.effect("creates lockfile entry after successful install", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir } = setupBase();

        // Create an empty lockfile
        fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");

        const result = yield* installSkill(
          makeOp({ agents: ["claude-code"], sourcePath: src }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.action).toBe("success");

        // Lockfile should contain the skill entry
        const lockContent = fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8");
        expect(lockContent).toContain("my-skill");
      }),
    );

    it.effect("swallows lockfile write failures without failing installation", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        // Make the axm dir read-only so lockfile write fails
        fs.chmodSync(axmDir, 0o444);

        const result = yield* installSkill(
          makeOp({ agents: ["claude-code"], sourcePath: src }),
        ).pipe(Effect.provide(withServices(axmDir)));

        // Restore permissions for cleanup
        fs.chmodSync(axmDir, 0o755);

        // Installation should still succeed even if lockfile failed
        expect(result.action).toBe("success");

        // Canonical files should exist
        const canonical = path.join(base, ".agents", "skills", "my-skill");
        expect(fs.existsSync(path.join(canonical, "SKILL.md"))).toBe(true);
      }),
    );
  });

  describe("per-agent results", () => {
    it.effect("reports error for unknown agents without failing the whole install", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        // Mix valid and invalid agent IDs
        const result = yield* installSkill(
          makeOp({
            agents: ["claude-code", "nonexistent-agent" as never],
            sourcePath: src,
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        // Overall result should be error (one agent failed)
        expect(result.action).toBe("error");
        expect(result.message).toContain("nonexistent-agent");

        // But claude-code symlink should still have been created
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(true);
      }),
    );
  });
});
