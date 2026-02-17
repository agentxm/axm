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
import { makeCliError } from "../../../cli-error/index.js";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import type { SkillPathSource } from "../skill-paths.js";
import type { InstallSkillOperation } from "../operations.js";
import type { SkillExtensionRef } from "../../../sources/types.js";
import { installSkill } from "./install-skill.js";
import { sanitizeName } from "./skill-utils.js";

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
    getConfiguredSkills: () => Effect.succeed({}),
    getInstalledSkills: () => Effect.succeed({}),
    getConfiguredAgents: () => Effect.succeed([]),
    getLockedSkills: () => Effect.succeed(readLf().skills ?? {}),
    getLockedSkill: (name: string) => Effect.succeed(Option.fromNullable(readLf().skills?.[name])),
    getSkillDir: (name: string, source?: SkillPathSource) => {
      const base = path.dirname(axmDir);
      const sanitized = sanitizeName(name);
      if (source?.type === "registry") {
        const canonicalPath = path.join(
          base,
          ".axm",
          "extensions",
          source.scope,
          "skills",
          sanitized,
        );
        return Effect.succeed({ canonicalPath, skillSrcPath: path.join(canonicalPath, "src") });
      }
      const canonicalPath = path.join(base, ".axm", "extensions", "external", "skills", sanitized);
      return Effect.succeed({ canonicalPath, skillSrcPath: canonicalPath });
    },
    setSkill: setSkillFn
      ? (args: { name: string; lockEntry: unknown }) => setSkillFn(args)
      : (args: { name: string; lockEntry: unknown }) =>
          Effect.try({
            try: () => {
              const lf = readLf();
              lf.skills[args.name] = {
                ...(args.lockEntry as Record<string, unknown>),
                updatedAt: new Date().toISOString(),
              };
              writeLf(lf);
            },
            catch: (error) =>
              makeCliError({
                code: "LOCKFILE_WRITE_FAILED",
                what: "Mock write failed",
                cause: error,
              }),
          }),
    setSkillLock: setSkillFn
      ? (args: { name: string; lockEntry: unknown }) => setSkillFn(args)
      : (args: { name: string; lockEntry: unknown }) =>
          Effect.try({
            try: () => {
              const lf = readLf();
              lf.skills[args.name] = {
                ...(args.lockEntry as Record<string, unknown>),
                updatedAt: new Date().toISOString(),
              };
              writeLf(lf);
            },
            catch: (error) =>
              makeCliError({
                code: "LOCKFILE_WRITE_FAILED",
                what: "Mock write failed",
                cause: error,
              }),
          }),
    removeSkill: () => Effect.void,
    removeSkillFromSettings: () => Effect.void,
    updateSkillEntry: () => Effect.void,
    setSkillEntry: () => Effect.void,
    renameSkill: () => Effect.void,
    updateLockEntryAgents: () => Effect.void,
    addConfiguredAgent: () => Effect.void,
    getConfiguredPacks: () => Effect.succeed({}),
    getInstalledPacks: () => Effect.succeed({}),
    getLockedPacks: () => Effect.succeed({}),
    getLockedPack: () => Effect.succeed(Option.none()),
    setPack: () => Effect.void,
    removePack: () => Effect.void,
    getPackDir: () => Effect.succeed({ canonicalPath: "" }),
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

/** Creates a minimal AddSkillOperation for testing using the new ref-based args. */
const makeOp = (
  overrides: {
    source?: import("../../../sources/types.js").SourceInput;
    agents?: ReadonlyArray<string>;
    force?: boolean;
    skillName?: string;
    sourcePath?: string;
    location?: string;
    version?: Option.Option<string>;
    gitTreeSha?: Option.Option<string>;
    skipSettings?: boolean;
    skill?: { name: string; description: string; metadata: Option.Option<Record<string, unknown>> };
  } = {},
): InstallSkillOperation => {
  const source =
    overrides.source ??
    ({ type: "local", path: "/tmp/source" } as import("../../../sources/types.js").SourceInput);
  const skill = overrides.skill ?? {
    name: overrides.skillName ?? "my-skill",
    description: "A test skill",
    metadata: Option.none(),
  };
  const location = overrides.location ?? `file://${overrides.sourcePath ?? ""}`;
  const version = overrides.version ?? Option.none();
  const gitTreeSha = overrides.gitTreeSha ?? Option.none();

  // Construct SkillExtensionRef directly based on source type
  const ref: SkillExtensionRef = (() => {
    const base = { type: "skill" as const, skill };
    switch (source.type) {
      case "registry":
        return {
          ...base,
          source: source as never,
          version: Option.getOrElse(version, () => ""),
          checksum: "",
        } as SkillExtensionRef;
      case "local":
        return {
          ...base,
          source: source as never,
          location,
        } as SkillExtensionRef;
      default:
        return {
          ...base,
          source: source as never,
          location,
          gitTreeSha,
        } as SkillExtensionRef;
    }
  })();

  // For registry sources, the fetchedLocation is the location
  const fetchedLocation = source.type === "registry" ? location : undefined;

  return {
    name: "install-skill",
    args: {
      ref,
      agents: overrides.agents ?? ["claude-code"],
      force: overrides.force ?? false,
      ...(overrides.skipSettings !== undefined && { skipSettings: overrides.skipSettings }),
      ...(fetchedLocation !== undefined && { fetchedLocation }),
    },
  };
};

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
        const canonical = path.join(base, ".axm", "extensions", "external", "skills", "my-skill");
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
        const canonical = path.join(
          base,
          ".axm",
          "extensions",
          "external",
          "skills",
          "my-awesome-skill",
        );
        expect(fs.existsSync(canonical)).toBe(true);
      }),
    );

    it.effect("calls Workspace.setSkill after successful installation", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir } = setupBase();
        const setSkillFn = vi.fn((_args: { name: string; lockEntry: unknown }) => Effect.void);

        const result = yield* installSkill(
          makeOp({ agents: ["claude-code"], sourcePath: src }),
        ).pipe(Effect.provide(withServices(axmDir, { setSkillFn })));

        expect(result.result).toBe("success");
        expect(setSkillFn).toHaveBeenCalledOnce();
        expect(setSkillFn).toHaveBeenCalledWith({
          name: "my-skill",
          lockEntry: expect.any(Object),
          versionConstraint: expect.anything(),
        });
      }),
    );

    it.effect("swallows Workspace.setSkill failure without failing installation", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir } = setupBase();
        const setSkillFn = vi.fn(() =>
          Effect.fail(
            makeCliError({
              code: "SETTINGS_WRITE_FAILED",
              what: "write failed",
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

  describe("all agents receive symlinks", () => {
    it.effect("creates symlink for agents whose skills.dir is .agents/skills", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        // amp uses .agents/skills — with external canonical, it now gets a symlink
        const result = yield* installSkill(makeOp({ agents: ["amp"], sourcePath: src })).pipe(
          Effect.provide(withServices(axmDir)),
        );

        expect(result.result).toBe("success");

        // Canonical location should exist (from copy)
        const canonical = path.join(base, ".axm", "extensions", "external", "skills", "my-skill");
        expect(fs.existsSync(canonical)).toBe(true);
        expect(fs.lstatSync(canonical).isDirectory()).toBe(true);

        // amp should have a symlink in .agents/skills
        const ampSkill = path.join(base, ".agents", "skills", "my-skill");
        expect(fs.existsSync(ampSkill)).toBe(true);
        expect(fs.lstatSync(ampSkill).isSymbolicLink()).toBe(true);
      }),
    );

    it.effect("creates symlinks for both universal and non-universal agents", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        // amp (.agents/skills) + claude-code (.claude/skills) — both get symlinks
        const result = yield* installSkill(
          makeOp({ agents: ["amp", "claude-code"], sourcePath: src }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        // Canonical should be a directory (not a symlink)
        const canonical = path.join(base, ".axm", "extensions", "external", "skills", "my-skill");
        expect(fs.lstatSync(canonical).isDirectory()).toBe(true);

        // amp should have a symlink
        const ampSkill = path.join(base, ".agents", "skills", "my-skill");
        expect(fs.lstatSync(ampSkill).isSymbolicLink()).toBe(true);

        // claude-code should have a symlink
        const claudeSkill = path.join(base, ".claude", "skills", "my-skill");
        expect(fs.lstatSync(claudeSkill).isSymbolicLink()).toBe(true);
      }),
    );
  });

  describe("error cases", () => {
    it.effect("yields CliError on copy failure when location is invalid", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();

        const result = yield* installSkill(makeOp({ location: "file:///nonexistent/path" })).pipe(
          Effect.provide(withServices(axmDir)),
          // CliError is in the E channel — catch it as applyPlan would
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("Failed to copy");
      }),
    );

    it.effect("yields CliError on copy failure (non-existent source)", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();

        const result = yield* installSkill(
          makeOp({
            sourcePath: path.join(tmpDir, "nonexistent"),
            agents: ["claude-code"],
          }),
        ).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, message: e.what })),
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
        const canonical = path.join(base, ".axm", "extensions", "external", "skills", "my-skill");
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

        // Use a mock setSkill that fails to simulate lockfile write failure
        const setSkillFn = vi.fn(() =>
          Effect.fail(
            makeCliError({
              code: "LOCKFILE_WRITE_FAILED",
              what: "write failed",
              cause: new Error("write failed"),
            }),
          ),
        );

        const result = yield* installSkill(
          makeOp({ agents: ["claude-code"], sourcePath: src }),
        ).pipe(Effect.provide(withServices(axmDir, { setSkillFn })));

        // Installation should still succeed even if lockfile failed
        expect(result.result).toBe("success");

        // Canonical files should exist
        const canonical = path.join(base, ".axm", "extensions", "external", "skills", "my-skill");
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
    /** Sets up a source dir matching extracted archive structure: axm-skill.json + src/. */
    const setupRegistrySource = (scope: string, name = "my-skill") => {
      const src = path.join(tmpDir, "registry", "extensions", scope, "skills", name);
      const srcDir = path.join(src, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(src, "axm-skill.json"),
        JSON.stringify({ name, version: "0.1.0" }),
      );
      fs.writeFileSync(path.join(srcDir, "SKILL.md"), `# ${name}`);
      fs.writeFileSync(path.join(srcDir, "prompt.md"), "prompt content");
      return src;
    };

    it.effect("uses .axm/extensions/@scope/skills/<name>/src/ for registry sources", () =>
      Effect.gen(function* () {
        const src = setupRegistrySource("@community");
        const { axmDir, base } = setupBase();

        const result = yield* installSkill(
          makeOp({
            agents: ["claude-code"],
            source: {
              type: "registry",
              scope: "@community",
              name: "my-skill",
              versionConstraint: Option.none(),
            },
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

        // Should NOT be in the external canonical location
        const externalCanonical = path.join(
          base,
          ".axm",
          "extensions",
          "external",
          "skills",
          "my-skill",
        );
        expect(fs.existsSync(externalCanonical)).toBe(false);
      }),
    );

    it.effect("uses scope from source, not location path", () =>
      Effect.gen(function* () {
        const src = setupRegistrySource("@myorg");
        const { axmDir, base } = setupBase();

        const result = yield* installSkill(
          makeOp({
            agents: ["claude-code"],
            source: {
              type: "registry",
              scope: "@myorg",
              name: "my-skill",
              versionConstraint: Option.none(),
            },
            location: `file://${src}`,
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        // Should use source.scope for canonical path
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
            source: {
              type: "registry",
              scope: "@community",
              name: "my-skill",
              versionConstraint: Option.none(),
            },
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
    it.effect(
      "removes from .axm/extensions/external/skills/ when installing as registry source",
      () =>
        Effect.gen(function* () {
          // Set up source in a path with @scope segment
          const src = path.join(
            tmpDir,
            "registry",
            "extensions",
            "@community",
            "skills",
            "my-skill",
          );
          fs.mkdirSync(src, { recursive: true });
          fs.writeFileSync(path.join(src, "SKILL.md"), "# my-skill");
          fs.writeFileSync(path.join(src, "prompt.md"), "prompt content");
          const { axmDir, base } = setupBase();

          // Pre-create in external canonical location (will be cleaned when switching to registry)
          const externalCanonical = path.join(
            base,
            ".axm",
            "extensions",
            "external",
            "skills",
            "my-skill",
          );
          fs.mkdirSync(externalCanonical, { recursive: true });
          fs.writeFileSync(path.join(externalCanonical, "old.txt"), "old content");

          const result = yield* installSkill(
            makeOp({
              agents: ["claude-code"],
              source: {
                type: "registry",
                scope: "@community",
                name: "my-skill",
                versionConstraint: Option.none(),
              },
              location: `file://${src}`,
            }),
          ).pipe(Effect.provide(withServices(axmDir)));

          expect(result.result).toBe("success");

          // External location should be cleaned
          expect(fs.existsSync(path.join(externalCanonical, "old.txt"))).toBe(false);
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
        const newCanonical = path.join(
          base,
          ".axm",
          "extensions",
          "external",
          "skills",
          "my-skill",
        );
        expect(fs.existsSync(path.join(newCanonical, "SKILL.md"))).toBe(true);
      }),
    );
  });

  describe("version constraint in settings", () => {
    /** Sets up a source dir matching extracted archive structure. */
    const setupRegistrySource2 = (scope: string, name = "my-skill") => {
      const src = path.join(tmpDir, "registry2", "extensions", scope, "skills", name);
      const srcDir = path.join(src, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(src, "axm-skill.json"),
        JSON.stringify({ name, version: "0.1.0" }),
      );
      fs.writeFileSync(path.join(srcDir, "SKILL.md"), `# ${name}`);
      return src;
    };

    it.effect("passes no versionConstraint for registry source without constraint", () =>
      Effect.gen(function* () {
        const src = setupRegistrySource2("@acme");
        const { axmDir } = setupBase();
        const setSkillFn = vi.fn(
          (_args: { name: string; lockEntry: unknown; versionConstraint: unknown }) => Effect.void,
        );

        const result = yield* installSkill(
          makeOp({
            agents: ["claude-code"],
            source: {
              type: "registry",
              scope: "@acme",
              name: "tool",
              versionConstraint: Option.none(),
            },
            skillName: "tool",
            location: `file://${src}`,
          }),
        ).pipe(Effect.provide(withServices(axmDir, { setSkillFn })));

        expect(result.result).toBe("success");
        expect(setSkillFn).toHaveBeenCalledOnce();
        const args = setSkillFn.mock.calls[0]![0];
        expect(Option.isNone(args.versionConstraint as Option.Option<string>)).toBe(true);
      }),
    );

    it.effect("passes caret versionConstraint for @acme/tool@^1.0.0", () =>
      Effect.gen(function* () {
        const src = setupRegistrySource2("@acme");
        const { axmDir } = setupBase();
        const setSkillFn = vi.fn(
          (_args: { name: string; lockEntry: unknown; versionConstraint: unknown }) => Effect.void,
        );

        const result = yield* installSkill(
          makeOp({
            agents: ["claude-code"],
            source: {
              type: "registry",
              scope: "@acme",
              name: "tool",
              versionConstraint: Option.some("^1.0.0"),
            },
            skillName: "tool",
            location: `file://${src}`,
            version: Option.some("1.2.3"),
          }),
        ).pipe(Effect.provide(withServices(axmDir, { setSkillFn })));

        expect(result.result).toBe("success");
        expect(setSkillFn).toHaveBeenCalledOnce();
        const args = setSkillFn.mock.calls[0]![0];
        expect(Option.getOrNull(args.versionConstraint as Option.Option<string>)).toBe("^1.0.0");
      }),
    );

    it.effect("passes exact versionConstraint for @acme/tool@1.2.3", () =>
      Effect.gen(function* () {
        const src = setupRegistrySource2("@acme");
        const { axmDir } = setupBase();
        const setSkillFn = vi.fn(
          (_args: { name: string; lockEntry: unknown; versionConstraint: unknown }) => Effect.void,
        );

        const result = yield* installSkill(
          makeOp({
            agents: ["claude-code"],
            source: {
              type: "registry",
              scope: "@acme",
              name: "tool",
              versionConstraint: Option.some("1.2.3"),
            },
            skillName: "tool",
            location: `file://${src}`,
            version: Option.some("1.2.3"),
          }),
        ).pipe(Effect.provide(withServices(axmDir, { setSkillFn })));

        expect(result.result).toBe("success");
        expect(setSkillFn).toHaveBeenCalledOnce();
        const args = setSkillFn.mock.calls[0]![0];
        expect(Option.getOrNull(args.versionConstraint as Option.Option<string>)).toBe("1.2.3");
      }),
    );

    it.effect("passes no versionConstraint for local source", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir } = setupBase();
        const setSkillFn = vi.fn(
          (_args: { name: string; lockEntry: unknown; versionConstraint: unknown }) => Effect.void,
        );

        const result = yield* installSkill(
          makeOp({ agents: ["claude-code"], sourcePath: src }),
        ).pipe(Effect.provide(withServices(axmDir, { setSkillFn })));

        expect(result.result).toBe("success");
        expect(setSkillFn).toHaveBeenCalledOnce();
        const args = setSkillFn.mock.calls[0]![0];
        expect(Option.isNone(args.versionConstraint as Option.Option<string>)).toBe(true);
      }),
    );
  });
});
