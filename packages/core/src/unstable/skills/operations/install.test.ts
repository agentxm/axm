import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import YAML from "yaml";
import { afterEach, beforeEach, vi } from "vitest";
import { TestRenderer } from "../../cli-renderer/index.js";
import { makeAppError } from "../../app-error/index.js";
import type {
  BuiltinSkillRef,
  ExtensionRef,
  GitHostedSkillRef,
  LocalSkillRef,
  RegistrySkillRef,
  Source,
  SkillExtensionRef,
} from "../../sources/index.js";
import { SourceHostProviders } from "../../source-resolution/index.js";
import type { SourceHostProvidersService } from "../../source-resolution/index.js";
import {
  Workspace,
  type SetSkillArgs,
  type WorkspaceContextService,
} from "../../workspace/service-interface.js";
import { taxonomyStubs } from "../../workspace/test-stubs.js";
import { at } from "../../test-helpers.js";
import {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
  type CodingAgent,
  getAgentById,
} from "../../agents/index.js";
import type { SkillPathSource } from "../paths.js";
import type { InstallSkillOperation } from "./install.js";
import { installSkill } from "./install.js";
import { sanitizeName } from "../utils.js";

/** Creates a workspace mock that writes lockfile + settings to disk. */
const makeWorkspaceMock = (
  axmDir: string,
  overrides?: {
    setSkillFn?: ReturnType<typeof vi.fn>;
    configuredAgents?: ReadonlyArray<string>;
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
    ...taxonomyStubs,
    scope: "project",
    path: axmDir,
    baseDir: path.dirname(axmDir),
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getRegistrySourceHosts: () => Effect.succeed([]),
    getConfiguredProfile: () => Effect.succeed("@community"),
    getDefaultProfile: () => Effect.succeed(Option.none()),
    addConfiguredSource: () => Effect.void,
    getConfiguredSkills: () => Effect.succeed({}),
    getInstalledSkills: () => Effect.succeed({}),
    getConfiguredAgents: () => Effect.succeed(overrides?.configuredAgents ?? ["claude-code"]),
    getLockedSkills: () => Effect.succeed(readLf().skills ?? {}),
    getLockedSkill: (name: string) =>
      Effect.succeed(Option.fromUndefinedOr(readLf().skills?.[name])),
    getSkillDir: (name: string, source?: SkillPathSource) => {
      const base = path.dirname(axmDir);
      const sanitized = sanitizeName(name);
      if (source?.refType === "registry") {
        const canonicalPath = path.join(
          base,
          ".axm",
          "extensions",
          source.profile,
          "skills",
          sanitized,
        );
        return Effect.succeed({ canonicalPath, skillSrcPath: path.join(canonicalPath, "src") });
      }
      const canonicalPath = path.join(base, ".axm", "extensions", "external", "skills", sanitized);
      return Effect.succeed({ canonicalPath, skillSrcPath: canonicalPath });
    },
    setSkill: setSkillFn
      ? ({ name, lockEntry, versionConstraint }: SetSkillArgs) =>
          setSkillFn({ name, lockEntry, versionConstraint })
      : ({ name, lockEntry }: Pick<SetSkillArgs, "name" | "lockEntry">) =>
          Effect.try({
            try: () => {
              const lf = readLf();
              lf.skills[name] = {
                ...lockEntry,
                updatedAt: new Date().toISOString(),
              };
              writeLf(lf);
            },
            catch: (error) =>
              makeAppError({
                code: "LOCKFILE_WRITE_FAILED",
                what: "Mock write failed",
                cause: error,
              }),
          }),
    setSkillLock: setSkillFn
      ? ({ name, lockEntry, versionConstraint }: SetSkillArgs) =>
          setSkillFn({ name, lockEntry, versionConstraint })
      : ({ name, lockEntry }: Pick<SetSkillArgs, "name" | "lockEntry">) =>
          Effect.try({
            try: () => {
              const lf = readLf();
              lf.skills[name] = {
                ...lockEntry,
                updatedAt: new Date().toISOString(),
              };
              writeLf(lf);
            },
            catch: (error) =>
              makeAppError({
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
    getLockedCommands: () => Effect.succeed({}),
    getLockedCommand: () => Effect.succeed(Option.none()),
    setCommand: () => Effect.void,
    setCommandLock: () => Effect.void,
    removeCommand: () => Effect.void,
    getLockedMcpServers: () => Effect.succeed({}),
    getLockedMcpServer: () => Effect.succeed(Option.none()),
    setMcpServer: () => Effect.void,
    setMcpServerLock: () => Effect.void,
    removeMcpServer: () => Effect.void,
    removeSkillLock: () => Effect.void,
    removeCommandSettings: () => Effect.void,
    removeCommandLock: () => Effect.void,
    removeMcpServerSettings: () => Effect.void,
    removeMcpServerLock: () => Effect.void,
    removePackSettings: () => Effect.void,
    removePackLock: () => Effect.void,
    isExtensionRequiredByInstalledPack: () => Effect.succeed(false),
    markDependencyRetainedInLockfile: () => Effect.void,
    getConfiguredCommands: () => Effect.succeed({}),
    getConfiguredMcpServers: () => Effect.succeed({}),
  };
};

/** Creates a layer providing FileSystem + a minimal Workspace service. */
const withServices = (
  axmDir: string,
  wsOverrides?: {
    setSkillFn?: ReturnType<typeof vi.fn>;
    configuredAgents?: ReadonlyArray<string>;
  },
) => {
  const mockWs = makeWorkspaceMock(axmDir, wsOverrides);
  const sourceProviders: SourceHostProvidersService = {
    find: () => Effect.succeed<ReadonlyArray<ExtensionRef>>([]),
    fetch: (ref) =>
      Effect.gen(function* () {
        if (ref.refType === "git-hosted" || ref.refType === "local") {
          return { directory: new URL(ref.location).pathname };
        }
        if (ref.refType === "registry") {
          return { directory: ref.source.location.pathname };
        }
        return yield* makeAppError({
          code: "SOURCE_FETCH_FAILED",
          what: "Builtin refs are not fetchable in tests",
        });
      }),
    cloneUrl: () => Option.none(),
    origin: (source) =>
      source.type === "registry"
        ? source.location.href
        : source.type === "local"
          ? source.path
          : source.type,
  };
  const { layer: outputLayer } = TestRenderer.make();
  const configuredAgentIds = wsOverrides?.configuredAgents ?? [];
  const configuredAgents: ReadonlyArray<CodingAgent> = configuredAgentIds
    .map((id) => {
      const descriptor = Option.getOrUndefined(getAgentById(id));
      if (!descriptor) return undefined;
      const agent: CodingAgent = {
        id: descriptor.id,
        resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
          Effect.gen(function* () {
            const p = yield* Path.Path;
            return {
              _tag: "supported" as const,
              dir: p.resolve(workspaceRoot, descriptor.skills.dir),
            };
          }),
        addMcpServer: () => Effect.succeed({ _tag: "unsupported" as const, reason: "test" }),
        removeMcpServer: () => Effect.succeed({ _tag: "unsupported" as const, reason: "test" }),
      };
      return agent;
    })
    .filter((a): a is CodingAgent => a !== undefined);
  const unknownAgentIds = configuredAgentIds.filter((id) => Option.isNone(getAgentById(id)));
  const defaultAgentRepo: CodingAgentRepositoryService = {
    get: () => Effect.die(new Error("not implemented in test")),
    all: Effect.succeed([]),
    getConfiguredAgents: () => Effect.succeed(configuredAgents),
    getUnknownConfiguredAgentIds: () => Effect.succeed(unknownAgentIds),
  };
  return Layer.mergeAll(
    NodeServices.layer,
    Workspace.layer(mockWs),
    outputLayer,
    Layer.succeed(SourceHostProviders, sourceProviders),
    Layer.succeed(CodingAgentRepository, defaultAgentRepo),
  );
};

/** Creates a minimal AddSkillOperation for testing using the new ref-based args. */
const makeOp = (
  overrides: {
    source?: Source;
    force?: boolean;
    skillName?: string;
    sourcePath?: string;
    profile?: string;
    location?: string;
    version?: Option.Option<string>;
    versionConstraint?: Option.Option<string>;
    gitTreeSha?: Option.Option<string>;
    skipSettings?: boolean;
    strictUnknownAgents?: boolean;
    skill?: {
      name: string;
      description: Option.Option<string>;
      metadata: Option.Option<Record<string, unknown>>;
    };
  } = {},
): InstallSkillOperation => {
  const sourceInput = overrides.source ?? ({ type: "local", path: "/tmp/source" } satisfies Source);
  const skill = overrides.skill ?? {
    name: overrides.skillName ?? "my-skill",
    description: Option.some("A test skill"),
    metadata: Option.none(),
  };
  const location = overrides.location ?? `file://${overrides.sourcePath ?? ""}`;
  const source: Source =
    sourceInput.type === "registry" && overrides.location !== undefined
      ? { ...sourceInput, location: new URL(overrides.location) }
      : sourceInput;
  const version = overrides.version ?? Option.some("1.0.0");
  const gitTreeSha = overrides.gitTreeSha ?? Option.none();

  // Construct SkillExtensionRef directly based on source type
  const ref: SkillExtensionRef = (() => {
    const base = { type: "skill" as const, skill };
    switch (source.type) {
      case "registry":
        return {
          ...base,
          refType: "registry" as const,
          source,
          profile: overrides.profile ?? "@community",
          name: skill.name,
          version: Option.getOrElse(version, () => ""),
          integrity: "",
        } satisfies RegistrySkillRef;
      case "local":
        return {
          ...base,
          refType: "local" as const,
          source,
          location,
        } satisfies LocalSkillRef;
      case "builtin":
        return {
          ...base,
          refType: "builtin" as const,
          source,
        } satisfies BuiltinSkillRef;
      default:
        return {
          ...base,
          refType: "git-hosted" as const,
          source,
          location,
          gitTreeSha,
        } satisfies GitHostedSkillRef;
    }
  })();

  return {
    name: "install-skill",
    args: {
      ref,
      force: overrides.force ?? false,
      versionConstraint: overrides.versionConstraint ?? Option.none(),
      skipSettings: Option.fromUndefinedOr(overrides.skipSettings),
      strictUnknownAgents: Option.fromUndefinedOr(overrides.strictUnknownAgents),
      sourceName: Option.none(),
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

  /**
   * Pre-populates the canonical directory at the expected location.
   * Registry tests use empty integrity (synthetic refs from fork/publish pipeline),
   * so the handler reuses existing canonical files instead of fetching.
   */
  const setupRegistryCanonical = (base: string, profile: string, name = "my-skill") => {
    const canonicalPath = path.join(base, ".axm", "extensions", profile, "skills", name);
    const srcDir = path.join(canonicalPath, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(canonicalPath, "axm-skill.json"),
      JSON.stringify({ name, version: "0.1.0" }),
    );
    fs.writeFileSync(path.join(srcDir, "SKILL.md"), `# ${name}`);
    fs.writeFileSync(path.join(srcDir, "prompt.md"), "prompt content");
    return canonicalPath;
  };

  describe("happy path — sanitize→copy→symlink→lockfile pipeline", () => {
    it.effect("copies skill files to canonical location and creates symlink for agent", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        const result = yield* installSkill(makeOp({ sourcePath: src })).pipe(
          Effect.provide(withServices(axmDir, { configuredAgents: ["claude-code", "cursor"] })),
        );

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

        const result = yield* installSkill(makeOp({ sourcePath: src })).pipe(
          Effect.provide(withServices(axmDir, { configuredAgents: ["claude-code", "cursor"] })),
        );

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

        const result = yield* installSkill(makeOp({ sourcePath: src })).pipe(
          Effect.provide(withServices(axmDir, { setSkillFn })),
        );

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
            makeAppError({
              code: "SETTINGS_WRITE_FAILED",
              what: "write failed",
              cause: new Error("write failed"),
            }),
          ),
        );

        const result = yield* installSkill(makeOp({ sourcePath: src })).pipe(
          Effect.provide(withServices(axmDir, { setSkillFn })),
        );

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
        const result = yield* installSkill(makeOp({ sourcePath: src })).pipe(
          Effect.provide(withServices(axmDir, { configuredAgents: ["amp"] })),
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
        const result = yield* installSkill(makeOp({ sourcePath: src })).pipe(
          Effect.provide(withServices(axmDir, { configuredAgents: ["amp", "claude-code"] })),
        );

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
    it.effect("yields AppError on copy failure when location is invalid", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();

        const result = yield* installSkill(makeOp({ location: "file:///nonexistent/path" })).pipe(
          Effect.provide(withServices(axmDir)),
          // AppError is in the E channel — catch it as applyPlan would
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("Failed to copy");
      }),
    );

    it.effect("yields AppError on copy failure (non-existent source)", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();

        const result = yield* installSkill(
          makeOp({
            sourcePath: path.join(tmpDir, "nonexistent"),
          }),
        ).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.what })),
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

        const result = yield* installSkill(makeOp({ sourcePath: src })).pipe(
          Effect.provide(withServices(axmDir)),
        );

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

        const result = yield* installSkill(makeOp({ sourcePath: src })).pipe(
          Effect.provide(withServices(axmDir)),
        );

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
            makeAppError({
              code: "LOCKFILE_WRITE_FAILED",
              what: "write failed",
              cause: new Error("write failed"),
            }),
          ),
        );

        const result = yield* installSkill(makeOp({ sourcePath: src })).pipe(
          Effect.provide(withServices(axmDir, { setSkillFn })),
        );

        // Installation should still succeed even if lockfile failed
        expect(result.result).toBe("success");

        // Canonical files should exist
        const canonical = path.join(base, ".axm", "extensions", "external", "skills", "my-skill");
        expect(fs.existsSync(path.join(canonical, "SKILL.md"))).toBe(true);
      }),
    );
  });

  describe("per-agent results", () => {
    it.effect("skips unknown agents and succeeds for known agents", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        // Mix valid and invalid agent IDs
        const result = yield* installSkill(
          makeOp({
            sourcePath: src,
          }),
        ).pipe(
          Effect.provide(
            withServices(axmDir, { configuredAgents: ["claude-code", "nonexistent-agent"] }),
          ),
        );

        // Overall result should succeed (unknown agent skipped best-effort)
        expect(result.result).toBe("success");

        // But claude-code symlink should still have been created
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(true);
      }),
    );

    it.effect("fails on unknown agents when strictUnknownAgents is true", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir } = setupBase();

        const result = yield* installSkill(
          makeOp({
            sourcePath: src,
            strictUnknownAgents: true,
          }),
        ).pipe(
          Effect.provide(
            withServices(axmDir, { configuredAgents: ["claude-code", "nonexistent-agent"] }),
          ),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("Unknown configured agents");
      }),
    );
  });

  describe("registry source canonical path", () => {
    it.effect("uses .axm/extensions/@profile/skills/<name>/src/ for registry sources", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        const result = yield* installSkill(
          makeOp({
            source: {
              type: "registry",
              location: new URL("file:///tmp/reg"),
              profile: Option.none(),
            },
            profile: "@community",
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

    it.effect("uses profile from source, not location path", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@myorg");

        const result = yield* installSkill(
          makeOp({
            source: {
              type: "registry",
              location: new URL("file:///tmp/reg"),
              profile: Option.none(),
            },
            profile: "@myorg",
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        // Should use source.profile for canonical path
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

    it.effect("writes registry lockfile fields (resolvedVersion, integrity, sourceName)", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        // Create an empty lockfile
        fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 1\nskills: {}\n");

        const result = yield* installSkill(
          makeOp({
            source: {
              type: "registry",
              location: new URL("file:///tmp/reg"),
              profile: Option.none(),
            },
            profile: "@community",
            version: Option.some("1.2.3"),
            versionConstraint: Option.some("^1.0.0"),
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        // Lockfile should contain registry-specific fields
        const lockContent = fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8");
        const lockfile = YAML.parse(lockContent);
        const entry = lockfile.skills["my-skill"];
        expect(entry).toBeDefined();
        expect(entry.type).toBe("registry");
        expect(entry.profile).toBe("@community");
        expect(entry.name).toBe("my-skill");
        expect(entry.resolvedVersion).toBe("1.2.3");
        expect(entry.sourceName).toBe("default");
      }),
    );

    it.effect("fails when registry resolvedVersion is a range", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        const result = yield* installSkill(
          makeOp({
            source: {
              type: "registry",
              location: new URL("file:///tmp/reg"),
              profile: Option.none(),
            },
            profile: "@community",
            version: Option.some("^1.0.0"),
            versionConstraint: Option.some("^1.0.0"),
          }),
        ).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, error: e })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("LOCKFILE_RESOLVED_VERSION_INVALID");
          expect(result.error.what).toContain("exact semver");
          expect(result.error.details.join("\n")).toContain("Received: ^1.0.0");
        }
      }),
    );
  });

  describe("pre-clean from all locations", () => {
    it.effect(
      "synthetic registry ref with existing canonical preserves files without fetching",
      () =>
        Effect.gen(function* () {
          const { axmDir, base } = setupBase();

          // Pre-create registry canonical (simulates fork/publish pipeline)
          const registryCanonical = path.join(
            base,
            ".axm",
            "extensions",
            "@community",
            "skills",
            "my-skill",
          );
          const srcDir = path.join(registryCanonical, "src");
          fs.mkdirSync(srcDir, { recursive: true });
          fs.writeFileSync(path.join(srcDir, "SKILL.md"), "# my-skill");

          const result = yield* installSkill(
            makeOp({
              source: {
                type: "registry",
                location: new URL("file:///tmp/reg"),
                profile: Option.none(),
              },
              profile: "@community",
            }),
          ).pipe(Effect.provide(withServices(axmDir)));

          expect(result.result).toBe("success");

          // Canonical files should still exist (useExisting path)
          expect(fs.existsSync(path.join(srcDir, "SKILL.md"))).toBe(true);
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
    it.effect("passes no versionConstraint for registry source without constraint", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@acme", "tool");
        const setSkillFn = vi.fn(
          (_args: Parameters<WorkspaceContextService["setSkill"]>[0]) => Effect.void,
        );

        const result = yield* installSkill(
          makeOp({
            source: {
              type: "registry",
              location: new URL("file:///tmp/reg"),
              profile: Option.none(),
            },
            profile: "@acme",
            skillName: "tool",
          }),
        ).pipe(Effect.provide(withServices(axmDir, { setSkillFn })));

        expect(result.result).toBe("success");
        expect(setSkillFn).toHaveBeenCalledOnce();
        const args = at(setSkillFn.mock.calls, 0)[0];
        expect(Option.isNone(args.versionConstraint)).toBe(true);
      }),
    );

    it.effect("passes caret versionConstraint for @acme/tool@^1.0.0", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@acme", "tool");
        const setSkillFn = vi.fn(
          (_args: Parameters<WorkspaceContextService["setSkill"]>[0]) => Effect.void,
        );

        const result = yield* installSkill(
          makeOp({
            source: {
              type: "registry",
              location: new URL("file:///tmp/reg"),
              profile: Option.none(),
            },
            profile: "@acme",
            skillName: "tool",
            version: Option.some("1.2.3"),
            versionConstraint: Option.some("^1.0.0"),
          }),
        ).pipe(Effect.provide(withServices(axmDir, { setSkillFn })));

        expect(result.result).toBe("success");
        expect(setSkillFn).toHaveBeenCalledOnce();
        const args = at(setSkillFn.mock.calls, 0)[0];
        expect(Option.getOrNull(args.versionConstraint)).toBe("^1.0.0");
      }),
    );

    it.effect("passes exact versionConstraint for @acme/tool@1.2.3", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@acme", "tool");
        const setSkillFn = vi.fn(
          (_args: Parameters<WorkspaceContextService["setSkill"]>[0]) => Effect.void,
        );

        const result = yield* installSkill(
          makeOp({
            source: {
              type: "registry",
              location: new URL("file:///tmp/reg"),
              profile: Option.none(),
            },
            profile: "@acme",
            skillName: "tool",
            version: Option.some("1.2.3"),
            versionConstraint: Option.some("1.2.3"),
          }),
        ).pipe(Effect.provide(withServices(axmDir, { setSkillFn })));

        expect(result.result).toBe("success");
        expect(setSkillFn).toHaveBeenCalledOnce();
        const args = at(setSkillFn.mock.calls, 0)[0];
        expect(Option.getOrNull(args.versionConstraint)).toBe("1.2.3");
      }),
    );

    it.effect("passes no versionConstraint for local source", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir } = setupBase();
        const setSkillFn = vi.fn(
          (_args: Parameters<WorkspaceContextService["setSkill"]>[0]) => Effect.void,
        );

        const result = yield* installSkill(makeOp({ sourcePath: src })).pipe(
          Effect.provide(withServices(axmDir, { setSkillFn })),
        );

        expect(result.result).toBe("success");
        expect(setSkillFn).toHaveBeenCalledOnce();
        const args = at(setSkillFn.mock.calls, 0)[0];
        expect(Option.isNone(args.versionConstraint)).toBe(true);
      }),
    );
  });
});
