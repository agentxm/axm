import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeContext from "@effect/platform-node/NodeContext";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach, vi } from "vitest";
import { makeLogTestLayer } from "../../../tui/index.js";
import { SettingsWriteError } from "../../../settings/index.js";
import { LockfileWriteError } from "../../../lockfile/index.js";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import type { InstallSkillOperation } from "../operations.js";
import { installSkill } from "./install-skill.js";

/** Creates a workspace mock that writes lockfile + settings to disk. */
const makeWorkspaceMock = (
  axmDir: string,
  overrides?: {
    setSkillFn?: ReturnType<typeof vi.fn>;
  },
): WorkspaceContextService => {
  const readLf = () => {
    const lfPath = path.join(axmDir, "axm-lock.yaml");
    if (!fs.existsSync(lfPath)) return { lockfileVersion: 1, skills: {} };
    return YAML.parse(fs.readFileSync(lfPath, "utf-8"));
  };
  const writeLf = (data: unknown) => {
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(data));
  };

  const setSkillFn = overrides?.setSkillFn;

  return {
    global: false,
    path: axmDir,
    nonInteractive: true,
    preview: false,
    resolvePlan: () => Effect.succeed({ name: "mock", description: Option.none(), jobs: [] }),
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getConfiguredRegistrySources: () => Effect.succeed([]),
    getConfiguredScope: () => Effect.succeed("@community"),
    addConfiguredSource: () => Effect.void,
    getInstalledSkills: () => Effect.succeed({}),
    getConfiguredAgents: () => Effect.succeed([]),
    getLockedSkills: () => Effect.succeed(readLf().skills ?? {}),
    getLockedSkill: (name: string) => Effect.succeed(Option.fromNullable(readLf().skills?.[name])),
    setSkill: setSkillFn
      ? (name: string, source: string, entry: unknown) => setSkillFn(name, source, entry)
      : (name: string, _source: string, entry: unknown) =>
          Effect.try({
            try: () => {
              const lf = readLf();
              lf.skills[name] = {
                ...(entry as Record<string, unknown>),
                updatedAt: new Date().toISOString(),
              };
              writeLf(lf);
            },
            catch: (error) =>
              new LockfileWriteError({
                message: "Mock write failed",
                cause: error,
                retryable: false,
              }),
          }),
    removeSkill: () => Effect.void,
    addConfiguredAgent: () => Effect.void,
  };
};

/** Creates a layer providing FileSystem + a minimal Workspace service. */
const withServices = (
  axmDir: string,
  wsOverrides?: {
    setSkillFn?: ReturnType<typeof vi.fn>;
  },
) => {
  const mockWs = makeWorkspaceMock(axmDir, wsOverrides);
  const [logLayer] = makeLogTestLayer();
  return Layer.mergeAll(NodeContext.layer, Workspace.layer(mockWs), logLayer);
};

/** Creates a minimal AddSkillOperation for testing. */
const makeOp = (
  overrides: Partial<InstallSkillOperation["args"]> & {
    skillName?: string;
    sourcePath?: string;
  } = {},
): InstallSkillOperation => ({
  name: "install-skill",
  args: {
    source: overrides.source ?? { type: "local", path: "/tmp/source" },
    agents: overrides.agents ?? ["claude-code"],
    force: overrides.force ?? false,
    skill: overrides.skill ?? {
      name: overrides.skillName ?? "my-skill",
      description: "A test skill",
      metadata: Option.none(),
    },
    location: overrides.location ?? `file://${overrides.sourcePath ?? ""}`,
    version: overrides.version ?? Option.none(),
    gitTreeSha: overrides.gitTreeSha ?? Option.none(),
  },
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

        expect(result.result).toBe("success");
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

        expect(result.result).toBe("success");

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

        expect(result.result).toBe("success");

        // Should be sanitized to lowercase with hyphens
        const canonical = path.join(base, ".agents", "skills", "my-awesome-skill");
        expect(fs.existsSync(canonical)).toBe(true);
      }),
    );

    it.effect("calls Workspace.setSkill after successful installation", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir } = setupBase();
        const setSkillFn = vi.fn((_name: string, _source: string, _entry: unknown) => Effect.void);

        const result = yield* installSkill(
          makeOp({ agents: ["claude-code"], sourcePath: src }),
        ).pipe(Effect.provide(withServices(axmDir, { setSkillFn })));

        expect(result.result).toBe("success");
        expect(setSkillFn).toHaveBeenCalledOnce();
        expect(setSkillFn).toHaveBeenCalledWith("my-skill", expect.any(String), expect.any(Object));
      }),
    );

    it.effect("swallows Workspace.setSkill failure without failing installation", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir } = setupBase();
        const setSkillFn = vi.fn(() =>
          Effect.fail(
            new SettingsWriteError({
              path: "",
              message: "write failed",
              cause: new Error("write failed"),
            }),
          ),
        );

        const result = yield* installSkill(
          makeOp({ agents: ["claude-code"], sourcePath: src }),
        ).pipe(Effect.provide(withServices(axmDir, { setSkillFn })));

        expect(result.result).toBe("success");
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

        expect(result.result).toBe("success");

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

        expect(result.result).toBe("success");

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
    it.effect("yields OperationError on copy failure when location is invalid", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();

        const result = yield* installSkill(makeOp({ location: "file:///nonexistent/path" })).pipe(
          Effect.provide(withServices(axmDir)),
          // OperationError is in the E channel — catch it as applyPlan would
          Effect.catchTag("OperationError", (e) =>
            Effect.succeed({ result: "error" as const, message: e.message }),
          ),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("Failed to copy");
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
            Effect.succeed({ result: "error" as const, message: e.message }),
          ),
        );

        expect(result.result).toBe("error");
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

        expect(result.result).toBe("success");

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

        expect(result.result).toBe("success");

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
        expect(result.result).toBe("success");

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
        expect(result.result).toBe("error");
        expect(result.message).toContain("nonexistent-agent");

        // But claude-code symlink should still have been created
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(true);
      }),
    );
  });

  describe("registry source canonical path", () => {
    /** Sets up a source whose path contains an @scope segment for registry location extraction. */
    const setupRegistrySource = (scope: string, name = "my-skill") => {
      const src = path.join(tmpDir, "registry", "extensions", scope, "skills", name);
      fs.mkdirSync(src, { recursive: true });
      fs.writeFileSync(path.join(src, "SKILL.md"), `# ${name}`);
      fs.writeFileSync(path.join(src, "prompt.md"), "prompt content");
      return src;
    };

    it.effect("uses .axm/extensions/@scope/skills/<name>/src/ for registry sources", () =>
      Effect.gen(function* () {
        const src = setupRegistrySource("@community");
        const { axmDir, base } = setupBase();

        const result = yield* installSkill(
          makeOp({
            agents: ["claude-code"],
            source: { type: "registry", scope: "@community", name: "my-skill" },
            location: `file://${src}`,
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        // Content should be in the registry canonical src/ subdirectory
        const registryCanonical = path.join(
          base,
          ".axm",
          "extensions",
          "@community",
          "skills",
          "my-skill",
        );
        expect(fs.existsSync(registryCanonical)).toBe(true);
        expect(fs.existsSync(path.join(registryCanonical, "src", "SKILL.md"))).toBe(true);

        // Should NOT be in the old canonical location
        const oldCanonical = path.join(base, ".agents", "skills", "my-skill");
        expect(fs.existsSync(oldCanonical)).toBe(false);
      }),
    );

    it.effect("extracts scope from registry location path", () =>
      Effect.gen(function* () {
        const src = setupRegistrySource("@myorg");
        const { axmDir, base } = setupBase();

        const result = yield* installSkill(
          makeOp({
            agents: ["claude-code"],
            source: { type: "registry", scope: "@community", name: "my-skill" },
            location: `file://${src}`,
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        // Should use the extracted scope with content in src/
        const registryCanonical = path.join(
          base,
          ".axm",
          "extensions",
          "@myorg",
          "skills",
          "my-skill",
        );
        expect(fs.existsSync(registryCanonical)).toBe(true);
        expect(fs.existsSync(path.join(registryCanonical, "src", "SKILL.md"))).toBe(true);
      }),
    );

    it.effect("writes registry lockfile fields (resolvedVersion, checksum, sourceName)", () =>
      Effect.gen(function* () {
        const src = setupRegistrySource("@community");
        const { axmDir } = setupBase();

        // Create an empty lockfile
        fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");

        const result = yield* installSkill(
          makeOp({
            agents: ["claude-code"],
            source: { type: "registry", scope: "@community", name: "my-skill" },
            location: `file://${src}`,
            version: Option.some("1.2.3"),
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        // Lockfile should contain registry-specific fields
        const lockContent = fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8");
        const lockfile = YAML.parse(lockContent);
        const entry = lockfile.skills["my-skill"];
        expect(entry).toBeDefined();
        expect(entry.type).toBe("registry");
        expect(entry.scope).toBe("@community");
        expect(entry.name).toBe("my-skill");
        expect(entry.resolvedVersion).toBe("1.2.3");
        expect(entry.sourceName).toBe("default");
      }),
    );
  });

  describe("pre-clean from all locations", () => {
    it.effect("removes from .agents/skills/ when installing as registry source", () =>
      Effect.gen(function* () {
        // Set up source in a path with @scope segment
        const src = path.join(tmpDir, "registry", "extensions", "@community", "skills", "my-skill");
        fs.mkdirSync(src, { recursive: true });
        fs.writeFileSync(path.join(src, "SKILL.md"), "# my-skill");
        fs.writeFileSync(path.join(src, "prompt.md"), "prompt content");
        const { axmDir, base } = setupBase();

        // Pre-create in old canonical location
        const oldCanonical = path.join(base, ".agents", "skills", "my-skill");
        fs.mkdirSync(oldCanonical, { recursive: true });
        fs.writeFileSync(path.join(oldCanonical, "old.txt"), "old content");

        const result = yield* installSkill(
          makeOp({
            agents: ["claude-code"],
            source: { type: "registry", scope: "@community", name: "my-skill" },
            location: `file://${src}`,
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        // Old location should be cleaned
        expect(fs.existsSync(path.join(oldCanonical, "old.txt"))).toBe(false);
      }),
    );

    it.effect("removes from .axm/extensions/ when installing as local source", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        // Pre-create in registry canonical location
        const registryCanonical = path.join(
          base,
          ".axm",
          "extensions",
          "@community",
          "skills",
          "my-skill",
        );
        fs.mkdirSync(registryCanonical, { recursive: true });
        fs.writeFileSync(path.join(registryCanonical, "old.txt"), "old content");

        const result = yield* installSkill(
          makeOp({
            agents: ["claude-code"],
            sourcePath: src,
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        // Registry location should be cleaned
        expect(fs.existsSync(path.join(registryCanonical, "old.txt"))).toBe(false);

        // New location should have files
        const newCanonical = path.join(base, ".agents", "skills", "my-skill");
        expect(fs.existsSync(path.join(newCanonical, "SKILL.md"))).toBe(true);
      }),
    );
  });
});
