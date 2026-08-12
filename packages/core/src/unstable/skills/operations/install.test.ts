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
import { TestRenderer, logsByTag } from "../../cli-renderer/index.js";
import { makeAppError, type AppError } from "../../app-error/index.js";
import type { ExtensionRef } from "../../extensions/index.js";
import { computeSourceHash } from "../../extensions/index.js";
import type {
  GitHostedSkillRef,
  LocalSkillRef,
  RegistrySkillRef,
  SkillExtensionRef,
  WorkspaceSkillRef,
} from "../refs.js";
import type { Source } from "../../sources/index.js";
import { SourceHostProviders } from "../../source-resolution/index.js";
import type { SourceHostProvidersService } from "../../source-resolution/index.js";
import {
  WorkspaceMutations,
  type SetSkillArgs,
  type WorkspaceMutationsService,
} from "../../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import {
  at,
  expectRecord,
  exactVersion,
  extensionName,
  handle,
  makeCodingAgentStub,
} from "../../test-helpers.js";
import {
  AGENTS,
  CodingAgentRepository,
  type CodingAgentRepositoryService,
  type CodingAgent,
} from "../../agents/index.js";
import type { AgentDescriptor, AgentId } from "../../agents/types.js";
import type { SkillPathSource } from "../paths.js";
import type { InstallSkillOperation } from "./install.js";
import { installSkill, buildRenderedFilesFromResults, computeSkillSourceHash } from "./install.js";
import { sanitizeName } from "../../extensions/utils.js";
import type { InstallResult } from "./install-result.js";
import { makeAxmSkillCompatibilityPolicyLayer } from "../axm-skill-compatibility.js";

/** Creates a workspace mock that writes lockfile + settings to disk. */
const makeWorkspaceMock = (
  axmDir: string,
  overrides?: {
    setSkillFn?: (
      args: Pick<SetSkillArgs, "name" | "lockEntry" | "versionRange">,
    ) => Effect.Effect<void, AppError>;
    configuredAgents?: ReadonlyArray<string>;
    settingsSkills?: Readonly<
      Record<string, { readonly source: string; readonly enabled: boolean }>
    >;
  },
): WorkspaceMutationsService => {
  const configuredSkills: Record<string, { readonly source: string; readonly enabled: boolean }> = {
    ...overrides?.settingsSkills,
  };
  const readLf = () => {
    const lfPath = path.join(axmDir, "axm-lock.yaml");
    if (!fs.existsSync(lfPath)) return { lockfileVersion: 3, skills: {} };
    return YAML.parse(fs.readFileSync(lfPath, "utf-8"));
  };
  const writeLf = (data: unknown) => {
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(data));
  };

  const setSkillFn = overrides?.setSkillFn;

  return makeBaseWorkspaceMock(axmDir, {
    getConfiguredAgents: () => Effect.succeed(overrides?.configuredAgents ?? ["claude-code"]),
    getConfiguredSkillEntries: () => Effect.succeed(configuredSkills),
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
          source.owner,
          "skills",
          sanitized,
        );
        return Effect.succeed({ canonicalPath, skillSrcPath: path.join(canonicalPath, "src") });
      }
      const canonicalPath = path.join(base, ".axm", "extensions", "external", "skills", sanitized);
      return Effect.succeed({ canonicalPath, skillSrcPath: canonicalPath });
    },
    setSkill: setSkillFn
      ? ({ name, lockEntry, versionRange }: SetSkillArgs) =>
          setSkillFn({ name, lockEntry, versionRange })
      : ({ name, lockEntry }: Pick<SetSkillArgs, "name" | "lockEntry">) =>
          Effect.try({
            try: () => {
              const lf = readLf();
              lf.skills[name] = {
                ...lockEntry,
                updatedAt: new Date().toISOString(),
              };
              const entry = expectRecord(lockEntry);
              configuredSkills[name] = {
                source:
                  entry["type"] === "registry" &&
                  typeof entry["owner"] === "string" &&
                  typeof entry["name"] === "string"
                    ? `${entry["owner"]}/skills/${entry["name"]}`
                    : "local:/tmp/source",
                enabled: true,
              };
              writeLf(lf);
            },
            catch: (error) =>
              makeAppError({
                code: "internal",
                detail: "Mock write failed",
                cause: error,
              }),
          }),
    setSkillLock: setSkillFn
      ? ({ name, lockEntry, versionRange }: SetSkillArgs) =>
          setSkillFn({ name, lockEntry, versionRange })
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
                code: "internal",
                detail: "Mock write failed",
                cause: error,
              }),
          }),
  });
};

const makeServices = (
  axmDir: string,
  wsOverrides?: {
    setSkillFn?: (
      args: Pick<SetSkillArgs, "name" | "lockEntry" | "versionRange">,
    ) => Effect.Effect<void, AppError>;
    configuredAgents?: ReadonlyArray<string>;
    settingsSkills?: Readonly<
      Record<string, { readonly source: string; readonly enabled: boolean }>
    >;
  },
) => {
  const mockWs = makeWorkspaceMock(axmDir, wsOverrides);
  const sourceProviders: SourceHostProvidersService = {
    resolveNamedRegistry: () => Effect.die("not used"),
    find: () => Effect.succeed<ReadonlyArray<ExtensionRef>>([]),
    fetch: (ref) =>
      Effect.succeed(
        ref.refType === "git-hosted" || ref.refType === "local" || ref.refType === "workspace"
          ? { directory: new URL(ref.location).pathname }
          : { directory: ref.source.location.pathname },
      ),
    cloneUrl: () => Option.none(),
    origin: (source) =>
      source.type === "registry"
        ? source.location.href
        : source.type === "local"
          ? source.path
          : source.type,
  };
  const renderer = TestRenderer.make();
  const configuredAgentIds = wsOverrides?.configuredAgents ?? [];
  const isKnownAgentId = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);
  const descriptorFor = (id: string): AgentDescriptor | undefined =>
    isKnownAgentId(id) ? AGENTS[id] : undefined;
  const configuredAgents: ReadonlyArray<CodingAgent> = configuredAgentIds
    .map((id) => {
      const descriptor = descriptorFor(id);
      if (!descriptor) return undefined;
      const agent: CodingAgent = makeCodingAgentStub(descriptor.id, {
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
      });
      return agent;
    })
    .filter((a): a is CodingAgent => a !== undefined);
  const unknownAgentIds = configuredAgentIds.filter((id) => descriptorFor(id) === undefined);
  const universalAgent = (() => {
    const descriptor = AGENTS.universal;
    return makeCodingAgentStub(descriptor.id, {
      resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
        Effect.gen(function* () {
          const p = yield* Path.Path;
          return {
            _tag: "supported" as const,
            dir: p.resolve(workspaceRoot, descriptor.skills.dir),
          };
        }),
    });
  })();
  const defaultAgentRepo: CodingAgentRepositoryService = {
    get: () => Effect.die(new Error("not implemented in test")),
    all: Effect.succeed([]),
    getConfiguredAgents: () => Effect.succeed(configuredAgents),
    getMaterializationAgents: () => Effect.succeed([universalAgent, ...configuredAgents]),
    getUnknownConfiguredAgentIds: () => Effect.succeed(unknownAgentIds),
  };
  return {
    layer: Layer.mergeAll(
      NodeServices.layer,
      WorkspaceMutations.layer(mockWs),
      renderer.layer,
      Layer.succeed(SourceHostProviders, sourceProviders),
      Layer.succeed(CodingAgentRepository, defaultAgentRepo),
    ),
    rendererState: renderer.state,
  };
};

/** Creates a layer providing FileSystem + a minimal WorkspaceMutations service. */
const withServices = (
  axmDir: string,
  wsOverrides?: {
    setSkillFn?: (
      args: Pick<SetSkillArgs, "name" | "lockEntry" | "versionRange">,
    ) => Effect.Effect<void, AppError>;
    configuredAgents?: ReadonlyArray<string>;
    settingsSkills?: Readonly<
      Record<string, { readonly source: string; readonly enabled: boolean }>
    >;
  },
) => makeServices(axmDir, wsOverrides).layer;

/** Creates a minimal AddSkillOperation for testing using the new ref-based args. */
const makeOp = (
  overrides: {
    source?: Source;
    force?: boolean;
    skillName?: string;
    sourcePath?: string;
    owner?: string;
    location?: string;
    version?: Option.Option<string>;
    integrity?: Option.Option<string>;
    versionRange?: Option.Option<string>;
    gitTreeSha?: Option.Option<string>;
    refSourcePath?: string;
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
  const skill = {
    name: extensionName(overrides.skill?.name ?? overrides.skillName ?? "my-skill"),
    description: overrides.skill?.description ?? Option.some("A test skill"),
    metadata: overrides.skill?.metadata ?? Option.none(),
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
          owner: handle(overrides.owner ?? "@community"),
          publisherBindingId: "hbnd_test",
          name: skill.name,
          version: exactVersion(Option.getOrElse(version, () => "1.0.0")),
          integrity: overrides.integrity ?? Option.none(),
          packages: [],
        } satisfies RegistrySkillRef;
      case "local":
        return {
          ...base,
          refType: "local" as const,
          source,
          location,
        } satisfies LocalSkillRef;
      case "workspace":
        return {
          ...base,
          refType: "workspace" as const,
          source,
          owner: source.owner,
          name: source.name,
          version: exactVersion(Option.getOrElse(version, () => "1.0.0")),
          scope: "project" as const,
          location,
          sourceHash: computeSourceHash("workspace-source"),
        } satisfies WorkspaceSkillRef;
      default:
        return {
          ...base,
          refType: "git-hosted" as const,
          source,
          location,
          ...(overrides.refSourcePath !== undefined ? { sourcePath: overrides.refSourcePath } : {}),
          gitTreeSha,
        } satisfies GitHostedSkillRef;
    }
  })();

  return {
    name: "install-skill",
    args: {
      ref,
      force: overrides.force ?? false,
      versionRange: overrides.versionRange ?? Option.none(),
      skipSettings: Option.fromUndefinedOr(overrides.skipSettings),
      strictUnknownAgents: Option.fromUndefinedOr(overrides.strictUnknownAgents),
      existingInstalledAt: Option.none(),
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
   * Registry tests use empty integrity (synthetic refs from publish pipeline),
   * so the handler reuses existing canonical files instead of fetching.
   */
  const setupRegistryCanonical = (base: string, owner: string, name = "my-skill") => {
    const canonicalPath = path.join(base, ".axm", "extensions", owner, "skills", name);
    const srcDir = path.join(canonicalPath, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(canonicalPath, "skill.json"),
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

        const universalSkillDir = path.join(base, ".agents", "skills", "my-skill");
        expect(fs.existsSync(universalSkillDir)).toBe(true);
        expect(fs.lstatSync(universalSkillDir).isSymbolicLink()).toBe(true);
      }),
    );

    it.effect("materializes the universal target when no agents are configured", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        const result = yield* installSkill(makeOp({ sourcePath: src })).pipe(
          Effect.provide(withServices(axmDir, { configuredAgents: [] })),
        );

        expect(result.result).toBe("success");
        expect(fs.existsSync(path.join(base, ".agents", "skills", "my-skill"))).toBe(true);
        expect(fs.existsSync(path.join(base, ".claude", "skills", "my-skill"))).toBe(false);

        const lockfile = YAML.parse(fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8"));
        const lockEntry = expectRecord(lockfile.skills["my-skill"]);
        expect(lockEntry).not.toHaveProperty("agents");
        expect(lockEntry["universalArtifact"]).toBeUndefined();
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

    it.effect("reports recipient agents and materialized locations in the artifact", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir } = setupBase();

        const result = yield* installSkill(makeOp({ sourcePath: src })).pipe(
          Effect.provide(withServices(axmDir, { configuredAgents: ["claude-code", "cursor"] })),
        );

        expect(result.result).toBe("success");
        if (result.result === "success") {
          expect(result.artifact?.agents).toEqual(["claude-code", "cursor"]);
          expect(result.artifact?.targets).toEqual([
            { path: ".agents/skills/my-skill", change: "created" },
            { path: ".claude/skills/my-skill", change: "created", agentIds: ["claude-code"] },
            { path: ".cursor/skills/my-skill", change: "created", agentIds: ["cursor"] },
          ]);
          expect(result.artifact?.change).toBe("created");
        }
      }),
    );

    it.effect("dedupes shared universal target locations for multiple configured agents", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir } = setupBase();

        const result = yield* installSkill(makeOp({ sourcePath: src })).pipe(
          Effect.provide(
            withServices(axmDir, {
              configuredAgents: ["antigravity", "amp", "claude-code"],
            }),
          ),
        );

        expect(result.result).toBe("success");
        if (result.result === "success") {
          expect(result.artifact?.agents).toEqual(["antigravity", "amp", "claude-code"]);
          expect(result.artifact?.targets).toEqual([
            {
              path: ".agents/skills/my-skill",
              change: "created",
              agentIds: ["antigravity", "amp"],
            },
            { path: ".claude/skills/my-skill", change: "created", agentIds: ["claude-code"] },
          ]);
        }
      }),
    );

    it.effect("reports unchanged when reinstalling the same source and target symlinks", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir } = setupBase();
        const layer = withServices(axmDir, { configuredAgents: ["claude-code"] });

        yield* installSkill(makeOp({ sourcePath: src })).pipe(Effect.provide(layer));

        const second = yield* installSkill(makeOp({ sourcePath: src, force: true })).pipe(
          Effect.provide(layer),
        );

        expect(second.result).toBe("success");
        if (second.result === "success") {
          expect(second.artifact?.change).toBe("unchanged");
          expect(second.artifact?.agents).toEqual(["claude-code"]);
          expect(second.artifact?.targets).toEqual([
            { path: ".agents/skills/my-skill", change: "unchanged" },
            { path: ".claude/skills/my-skill", change: "unchanged", agentIds: ["claude-code"] },
          ]);
        }
      }),
    );

    it.effect(
      "reports updated when the source content changes but target symlinks are unchanged",
      () =>
        Effect.gen(function* () {
          const src = setupSource();
          const { axmDir } = setupBase();
          const layer = withServices(axmDir, { configuredAgents: ["claude-code"] });

          yield* installSkill(makeOp({ sourcePath: src })).pipe(Effect.provide(layer));
          const canonical = path.join(
            path.dirname(axmDir),
            ".axm",
            "extensions",
            "external",
            "skills",
            "my-skill",
          );
          const canonicalBefore = yield* computeSkillSourceHash(canonical).pipe(
            Effect.provide(NodeServices.layer),
          );
          fs.writeFileSync(path.join(src, "prompt.md"), "changed prompt content");
          const changedSource = yield* computeSkillSourceHash(src).pipe(
            Effect.provide(NodeServices.layer),
          );
          expect(changedSource).not.toBe(canonicalBefore);

          const second = yield* installSkill(makeOp({ sourcePath: src, force: true })).pipe(
            Effect.provide(layer),
          );
          const canonicalAfter = yield* computeSkillSourceHash(canonical).pipe(
            Effect.provide(NodeServices.layer),
          );
          expect(canonicalAfter).toBe(changedSource);

          expect(second.result).toBe("success");
          if (second.result === "success") {
            expect(second.artifact?.change).toBe("updated");
            expect(second.artifact?.targets).toEqual([
              { path: ".agents/skills/my-skill", change: "unchanged" },
              { path: ".claude/skills/my-skill", change: "unchanged", agentIds: ["claude-code"] },
            ]);
          }
        }),
    );

    it.effect("sanitizes skill name for canonical directory", () =>
      Effect.gen(function* () {
        const displayName = "My Awesome Skill!!";
        const src = setupSource(displayName);
        const { axmDir, base } = setupBase();
        const ref: LocalSkillRef = {
          type: "skill",
          refType: "local",
          source: { type: "local", path: src },
          location: `file://${src}`,
          skill: {
            // Assertion needed: this test intentionally passes an unsanitized local skill
            // name so installSkill exercises the runtime sanitization path.
            name: displayName as unknown as LocalSkillRef["skill"]["name"],
            description: Option.some("A test skill"),
            metadata: Option.none(),
          },
        };
        const op: InstallSkillOperation = {
          name: "install-skill",
          args: {
            ref,
            force: false,
            versionRange: Option.none(),
            skipSettings: Option.none(),
            strictUnknownAgents: Option.none(),
            existingInstalledAt: Option.none(),
            sourceName: Option.none(),
          },
        };

        const result = yield* installSkill(op).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        const canonical = path.join(
          base,
          ".axm",
          "extensions",
          "external",
          "skills",
          sanitizeName(displayName),
        );
        expect(fs.existsSync(canonical)).toBe(true);
      }),
    );

    it.effect("calls WorkspaceMutations.setSkill after successful installation", () =>
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
          versionRange: expect.anything(),
        });
      }),
    );

    it.effect("fails when WorkspaceMutations.setSkill cannot persist desired state", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir } = setupBase();
        const setSkillFn = vi.fn(() =>
          Effect.fail(
            makeAppError({
              code: "internal",
              detail: "write failed",
              cause: new Error("write failed"),
            }),
          ),
        );
        const services = makeServices(axmDir, { setSkillFn });

        const result = yield* installSkill(makeOp({ sourcePath: src })).pipe(
          Effect.provide(services.layer),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.message).toContain("failed to record desired state");
          expect(result.error.detail).toContain("write failed");
          expect(result.error.suggestions?.[0]?.cmd).toContain("axm skills install");
        }
        expect(logsByTag(services.rendererState).warn).toEqual([]);
        expect(setSkillFn).toHaveBeenCalledOnce();
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
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("Failed to copy skill files from /nonexistent/path");
        expect(result.message).toContain("source does not exist");
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
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("Failed to copy skill files from");
        expect(result.message).toContain("source does not exist");
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
        fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 3\nskills: {}\n");

        const result = yield* installSkill(makeOp({ sourcePath: src })).pipe(
          Effect.provide(withServices(axmDir)),
        );

        expect(result.result).toBe("success");

        // Lockfile should contain the skill entry
        const lockContent = fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8");
        expect(lockContent).toContain("my-skill");
      }),
    );
  });

  describe("per-agent results", () => {
    it.effect("skips unknown agents as result context and succeeds for known agents", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();
        const services = makeServices(axmDir, {
          configuredAgents: ["claude-code", "nonexistent-agent"],
        });

        // Mix valid and invalid agent IDs
        const result = yield* installSkill(
          makeOp({
            sourcePath: src,
          }),
        ).pipe(Effect.provide(services.layer));

        // Overall result should succeed (unknown agent skipped best-effort)
        expect(result.result).toBe("success");
        expect(result.message).toContain("Skipping unknown configured agents: nonexistent-agent");
        expect(logsByTag(services.rendererState).warn).toEqual([]);

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
    it.effect("uses .axm/extensions/@owner/skills/<name>/src/ for registry sources", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        const result = yield* installSkill(
          makeOp({
            source: {
              type: "registry",
              location: new URL("file:///tmp/reg"),
              owner: Option.none(),
            },
            owner: "@community",
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

    it.effect("uses owner from source, not location path", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@myorg");

        const result = yield* installSkill(
          makeOp({
            source: {
              type: "registry",
              location: new URL("file:///tmp/reg"),
              owner: Option.none(),
            },
            owner: "@myorg",
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        // Should use source.owner for canonical path
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
        fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), "lockfileVersion: 3\nskills: {}\n");

        const result = yield* installSkill(
          makeOp({
            source: {
              type: "registry",
              location: new URL("file:///tmp/reg"),
              owner: Option.none(),
            },
            owner: "@community",
            version: Option.some("1.2.3"),
            versionRange: Option.some("^1.0.0"),
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        // Lockfile should contain registry-specific fields
        const lockContent = fs.readFileSync(path.join(axmDir, "axm-lock.yaml"), "utf-8");
        const lockfile = YAML.parse(lockContent);
        const entry = lockfile.skills["my-skill"];
        expect(entry).toBeDefined();
        expect(entry.type).toBe("registry");
        expect(entry.owner).toBe("@community");
        expect(entry.name).toBe("my-skill");
        expect(entry.resolvedVersion).toBe("1.2.3");
        expect(entry.sourceName).toBe("default");
      }),
    );

    // Range versions (e.g. "^1.0.0") are now statically prevented by the
    // Version branded type on RegistrySkillRef.version.
    // Schema-level rejection is tested in version-constraints.test.ts.
  });

  describe("canonical reuse — installed content is workspace-owned", () => {
    const writeRegistryLock = (axmDir: string, resolvedVersion: string) => {
      fs.writeFileSync(
        path.join(axmDir, "axm-lock.yaml"),
        YAML.stringify({
          lockfileVersion: 3,
          skills: {
            "my-skill": {
              type: "registry",
              owner: "@community",
              name: "my-skill",
              resolvedVersion,
              integrity: "sha512-abc",
              sourceName: "default",
              publisherBindingId: "hbnd_test",
              installedAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          },
        }),
      );
    };

    const registryOp = (overrides: { force?: boolean; version?: string } = {}) =>
      makeOp({
        source: {
          type: "registry",
          location: new URL("file:///tmp/reg"),
          owner: Option.none(),
        },
        owner: "@community",
        integrity: Option.some("sha512-abc"),
        version: Option.some(overrides.version ?? "1.0.0"),
        ...(overrides.force === undefined ? {} : { force: overrides.force }),
      });

    it.effect(
      "reuses the existing canonical tree when desired state and trust pin the requested version",
      () =>
        Effect.gen(function* () {
          const { axmDir, base } = setupBase();
          setupRegistryCanonical(base, "@community");
          writeRegistryLock(axmDir, "1.0.0");

          // Workspace-owned rewrite of installed content (e.g. a formatter run).
          const canonical = path.join(
            base,
            ".axm",
            "extensions",
            "@community",
            "skills",
            "my-skill",
          );
          fs.writeFileSync(path.join(canonical, "src", "SKILL.md"), "# my-skill\n\nreformatted\n");

          const result = yield* installSkill(registryOp()).pipe(
            Effect.provide(
              withServices(axmDir, {
                settingsSkills: {
                  "my-skill": {
                    source: "@community/skills/my-skill",
                    enabled: true,
                  },
                },
              }),
            ),
          );

          expect(result.result).toBe("success");
          expect(fs.readFileSync(path.join(canonical, "src", "SKILL.md"), "utf-8")).toContain(
            "reformatted",
          );
        }),
    );

    it.effect("force re-materializes instead of reusing the canonical tree", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        writeRegistryLock(axmDir, "1.0.0");

        // No registry is reachable at file:///tmp/reg, so a forced install must
        // fail by attempting the download rather than silently reusing.
        const result = yield* installSkill(registryOp({ force: true })).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
        );

        expect(result.result).toBe("error");
      }),
    );

    it.effect("re-materializes when the requested version differs from the locked version", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        writeRegistryLock(axmDir, "0.9.0");

        const result = yield* installSkill(registryOp({ version: "1.0.0" })).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
        );

        expect(result.result).toBe("error");
      }),
    );
  });

  describe("pre-clean from all locations", () => {
    it.effect("rejects incompatible reused official bytes before changing canonical state", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const canonical = setupRegistryCanonical(base, "@agentxm", "axm");
        const marker = path.join(canonical, "src", "prompt.md");
        fs.writeFileSync(marker, "preserve me");

        const error = yield* installSkill(
          makeOp({
            source: {
              type: "registry",
              location: new URL("file:///tmp/reg"),
              owner: Option.none(),
            },
            owner: "@agentxm",
            skillName: "axm",
          }),
        ).pipe(
          Effect.provide(
            Layer.mergeAll(withServices(axmDir), makeAxmSkillCompatibilityPolicyLayer("1.0.0")),
          ),
          Effect.flip,
        );

        expect(error.code).toBe("conflict");
        expect(fs.readFileSync(marker, "utf8")).toBe("preserve me");
      }),
    );

    it.effect(
      "synthetic registry ref with existing canonical preserves files without fetching",
      () =>
        Effect.gen(function* () {
          const { axmDir, base } = setupBase();

          // Pre-create registry canonical (simulates publish pipeline)
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
                owner: Option.none(),
              },
              owner: "@community",
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
    it.effect("passes no versionRange for registry source without constraint", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@acme", "tool");
        const setSkillFn = vi.fn(
          (_args: Parameters<WorkspaceMutationsService["setSkill"]>[0]) => Effect.void,
        );

        const result = yield* installSkill(
          makeOp({
            source: {
              type: "registry",
              location: new URL("file:///tmp/reg"),
              owner: Option.none(),
            },
            owner: "@acme",
            skillName: "tool",
          }),
        ).pipe(Effect.provide(withServices(axmDir, { setSkillFn })));

        expect(result.result).toBe("success");
        expect(setSkillFn).toHaveBeenCalledOnce();
        const args = at(setSkillFn.mock.calls, 0)[0];
        expect(Option.isNone(args.versionRange)).toBe(true);
      }),
    );

    it.effect("passes caret versionRange for @acme/tool@^1.0.0", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@acme", "tool");
        const setSkillFn = vi.fn(
          (_args: Parameters<WorkspaceMutationsService["setSkill"]>[0]) => Effect.void,
        );

        const result = yield* installSkill(
          makeOp({
            source: {
              type: "registry",
              location: new URL("file:///tmp/reg"),
              owner: Option.none(),
            },
            owner: "@acme",
            skillName: "tool",
            version: Option.some("1.2.3"),
            versionRange: Option.some("^1.0.0"),
          }),
        ).pipe(Effect.provide(withServices(axmDir, { setSkillFn })));

        expect(result.result).toBe("success");
        expect(setSkillFn).toHaveBeenCalledOnce();
        const args = at(setSkillFn.mock.calls, 0)[0];
        expect(Option.getOrNull(args.versionRange)).toBe("^1.0.0");
      }),
    );

    it.effect("passes exact versionRange for @acme/tool@1.2.3", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@acme", "tool");
        const setSkillFn = vi.fn(
          (_args: Parameters<WorkspaceMutationsService["setSkill"]>[0]) => Effect.void,
        );

        const result = yield* installSkill(
          makeOp({
            source: {
              type: "registry",
              location: new URL("file:///tmp/reg"),
              owner: Option.none(),
            },
            owner: "@acme",
            skillName: "tool",
            version: Option.some("1.2.3"),
            versionRange: Option.some("1.2.3"),
          }),
        ).pipe(Effect.provide(withServices(axmDir, { setSkillFn })));

        expect(result.result).toBe("success");
        expect(setSkillFn).toHaveBeenCalledOnce();
        const args = at(setSkillFn.mock.calls, 0)[0];
        expect(Option.getOrNull(args.versionRange)).toBe("1.2.3");
      }),
    );

    it.effect("passes no versionRange for local source", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir } = setupBase();
        const setSkillFn = vi.fn(
          (_args: Parameters<WorkspaceMutationsService["setSkill"]>[0]) => Effect.void,
        );

        const result = yield* installSkill(makeOp({ sourcePath: src })).pipe(
          Effect.provide(withServices(axmDir, { setSkillFn })),
        );

        expect(result.result).toBe("success");
        expect(setSkillFn).toHaveBeenCalledOnce();
        const args = at(setSkillFn.mock.calls, 0)[0];
        expect(Option.isNone(args.versionRange)).toBe(true);
      }),
    );
  });

  describe("rendered files tracking", () => {
    it.effect("symlink-mode install records source identity without rendered files", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir } = setupBase();
        const setSkillFn = vi.fn((_args: { name: string; lockEntry: unknown }) => Effect.void);

        const result = yield* installSkill(makeOp({ sourcePath: src })).pipe(
          Effect.provide(withServices(axmDir, { setSkillFn, configuredAgents: ["claude-code"] })),
        );

        expect(result.result).toBe("success");
        expect(setSkillFn).toHaveBeenCalledOnce();
        const lockEntry = expectRecord(at(setSkillFn.mock.calls, 0)[0].lockEntry);
        expect(lockEntry["renderedFiles"]).toBeUndefined();
        expect(lockEntry["sourceHash"]).toEqual(expect.any(String));
        expect(lockEntry).not.toHaveProperty("agents");
        expect(lockEntry["universalArtifact"]).toBeUndefined();
      }),
    );

    it("buildRenderedFilesFromResults maps copy-mode results to renderedFiles", () => {
      const targets: ReadonlyArray<{ agentId: AgentId; targetDir: string }> = [
        { agentId: "claude-code", targetDir: "/project/.claude/skills" },
        { agentId: "cursor", targetDir: "/project/.cursor/skills" },
      ];
      const results: ReadonlyArray<InstallResult> = [
        {
          success: true,
          mode: "copy",
          symlinkFailed: true,
          error: Option.none(),
          path: "/project/.claude/skills/my-skill",
          canonicalPath: "/project/.axm/extensions/external/skills/my-skill",
        },
        {
          success: true,
          mode: "symlink",
          symlinkFailed: false,
          error: Option.none(),
          path: "/project/.cursor/skills/my-skill",
          canonicalPath: "/project/.axm/extensions/external/skills/my-skill",
        },
      ];

      const renderedFiles = buildRenderedFilesFromResults(targets, results, (targetPath) =>
        targetPath.replace("/project/", ""),
      );

      // Only the copy-mode agent should be in renderedFiles
      expect(renderedFiles["claude-code"]).toBeDefined();
      expect(renderedFiles["claude-code"]?.[0]?.path).toBe(".claude/skills/my-skill");
      // Symlink-mode agent should NOT be in renderedFiles
      expect(renderedFiles["cursor"]).toBeUndefined();
    });

    it("buildRenderedFilesFromResults excludes failed copy-mode results", () => {
      const targets: ReadonlyArray<{ agentId: AgentId; targetDir: string }> = [
        { agentId: "claude-code", targetDir: "/project/.claude/skills" },
      ];
      const results: ReadonlyArray<InstallResult> = [
        {
          success: false,
          mode: "copy",
          symlinkFailed: true,
          error: Option.some("copy failed"),
          path: "/project/.claude/skills/my-skill",
          canonicalPath: "/project/.axm/extensions/external/skills/my-skill",
        },
      ];

      const renderedFiles = buildRenderedFilesFromResults(targets, results, (targetPath) =>
        targetPath.replace("/project/", ""),
      );

      expect(Object.keys(renderedFiles)).toHaveLength(0);
    });

    it.effect("computeSkillSourceHash produces a stable hash from directory contents", () =>
      Effect.gen(function* () {
        const dir = path.join(tmpDir, "hash-test");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "SKILL.md"), "# Test");
        fs.writeFileSync(path.join(dir, "prompt.md"), "prompt");

        const hash1 = yield* computeSkillSourceHash(dir).pipe(Effect.provide(NodeServices.layer));
        const hash2 = yield* computeSkillSourceHash(dir).pipe(Effect.provide(NodeServices.layer));

        expect(hash1).toBe(hash2);
        expect(typeof hash1).toBe("string");
        expect(hash1.length).toBeGreaterThan(0);
      }),
    );
  });

  describe("SKILL.md materialization", () => {
    it.effect("does not prepend a marker to SKILL.md for git-hosted source", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        const result = yield* installSkill(
          makeOp({
            source: {
              type: "github",
              url: new URL("https://github.com"),
              owner: "test-owner",
              repo: "test-repo",
              ref: Option.none(),
              subPath: Option.none(),
            },
            sourcePath: src,
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        const canonical = path.join(base, ".axm", "extensions", "external", "skills", "my-skill");
        const content = fs.readFileSync(path.join(canonical, "SKILL.md"), "utf-8");
        expect(content).toBe("# my-skill");
      }),
    );

    it.effect("reports git-hosted source details on the install artifact", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir } = setupBase();

        const result = yield* installSkill(
          makeOp({
            source: {
              type: "github",
              url: new URL("https://github.com"),
              owner: "qualitymd",
              repo: "quality.md",
              ref: Option.some("main"),
              subPath: Option.none(),
            },
            sourcePath: src,
            refSourcePath: "skills/quality",
            gitTreeSha: Option.some("2ade2ca678e5f91a7d4dd31e74e84d1bcc3986eb"),
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");
        if (result.result !== "success") return;
        expect(result.artifact?.source).toEqual({
          type: "github",
          origin: "https://github.com/qualitymd/quality.md",
          ref: "main",
          directory: "skills/quality",
          gitTreeHash: "2ade2ca678e5f91a7d4dd31e74e84d1bcc3986eb",
        });
      }),
    );

    it.effect("does not prepend a marker to SKILL.md for registry source", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        const result = yield* installSkill(
          makeOp({
            source: {
              type: "registry",
              location: new URL("file:///tmp/reg"),
              owner: Option.none(),
            },
            owner: "@community",
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");

        const srcDir = path.join(
          base,
          ".axm",
          "extensions",
          "@community",
          "skills",
          "my-skill",
          "src",
        );
        const content = fs.readFileSync(path.join(srcDir, "SKILL.md"), "utf-8");
        expect(content).toBe("# my-skill");
      }),
    );

    it.effect("does NOT modify SKILL.md for local-path source", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        const result = yield* installSkill(makeOp({ sourcePath: src })).pipe(
          Effect.provide(withServices(axmDir)),
        );

        expect(result.result).toBe("success");

        // The original source SKILL.md should NOT have a marker
        const sourceContent = fs.readFileSync(path.join(src, "SKILL.md"), "utf-8");
        expect(sourceContent).toBe("# my-skill");

        // The copied canonical SKILL.md should also NOT have a marker (local source)
        const canonical = path.join(base, ".axm", "extensions", "external", "skills", "my-skill");
        const canonicalContent = fs.readFileSync(path.join(canonical, "SKILL.md"), "utf-8");
        expect(canonicalContent).toBe("# my-skill");
      }),
    );

    it.effect("copy-mode fallback preserves marker-free content in the agent dir", () =>
      Effect.gen(function* () {
        const src = setupSource();
        const { axmDir, base } = setupBase();

        const result = yield* installSkill(
          makeOp({
            source: {
              type: "github",
              url: new URL("https://github.com"),
              owner: "test-owner",
              repo: "test-repo",
              ref: Option.none(),
              subPath: Option.none(),
            },
            sourcePath: src,
          }),
        ).pipe(Effect.provide(withServices(axmDir, { configuredAgents: ["claude-code"] })));

        expect(result.result).toBe("success");

        const agentSkillDir = path.join(base, ".claude", "skills", "my-skill");
        const agentContent = fs.readFileSync(path.join(agentSkillDir, "SKILL.md"), "utf-8");
        expect(agentContent).toBe("# my-skill");
      }),
    );
  });
});
