import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { afterEach, beforeEach, vi } from "vitest";
import { DefaultCodingAgentRepository } from "../../../agents/repository.js";
import type { CodingAgent } from "../../../agents/coding-agent.js";
import { makeOutputTestLayer } from "@axm.sh/core/unstable/output";
import { makeAppError } from "@axm.sh/core/unstable/app-error";
import type {
  ExtensionRef,
  McpServerExtensionRef,
  RegistryMcpServerRef,
} from "@axm.sh/core/unstable/sources";
import { SourceHostProviders } from "../../../sources/index.js";
import type { SourceHostProvidersService } from "../../../sources/index.js";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import { taxonomyStubs } from "../../../workspace/test-stubs.js";
import type { InstallMcpServerOperation } from "./install.js";
import { installMcpServer } from "./install.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeWorkspaceMock = (
  axmDir: string,
  overrides?: {
    setMcpServerFn?: ReturnType<typeof vi.fn>;
  },
): WorkspaceContextService => {
  const readLf = () => {
    const lfPath = path.join(axmDir, "axm-lock.yaml");
    if (!fs.existsSync(lfPath)) return { lockfileVersion: 1, mcpServers: {} };
    return YAML.parse(fs.readFileSync(lfPath, "utf-8"));
  };
  const writeLf = (data: unknown) => {
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(data));
  };

  const setMcpServerFn = overrides?.setMcpServerFn;

  return {
    ...taxonomyStubs,
    scope: "project",
    path: axmDir,
    baseDir: path.dirname(axmDir),
    resolvePlan: () =>
      Effect.succeed({ _tag: "ExecutedPlan", name: "mock", description: Option.none(), jobs: [] }),
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getRegistrySourceHosts: () => Effect.succeed([]),
    getConfiguredProfile: () => Effect.succeed("@community"),
    getDefaultProfile: () => Effect.succeed(Option.none()),
    addConfiguredSource: () => Effect.void,
    getConfiguredSkills: () => Effect.succeed({}),
    getInstalledSkills: () => Effect.succeed({}),
    getConfiguredAgents: () => Effect.succeed([]),
    getLockedSkills: () => Effect.succeed({}),
    getLockedSkill: () => Effect.succeed(Option.none()),
    getSkillDir: () => Effect.succeed({ canonicalPath: "", skillSrcPath: "" }),
    setSkill: () => Effect.void,
    setSkillLock: () => Effect.void,
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
    getLockedMcpServers: () => Effect.succeed(readLf().mcpServers ?? {}),
    getLockedMcpServer: (name: string) =>
      Effect.succeed(Option.fromUndefinedOr(readLf().mcpServers?.[name])),
    setMcpServer: setMcpServerFn
      ? (args: { name: string; lockEntry: unknown }) => setMcpServerFn(args)
      : (args: { name: string; lockEntry: unknown }) =>
          Effect.try({
            try: () => {
              const lf = readLf();
              if (!lf.mcpServers) lf.mcpServers = {};
              lf.mcpServers[args.name] = {
                ...(args.lockEntry as Record<string, unknown>),
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
    setMcpServerLock: setMcpServerFn
      ? (args: { name: string; lockEntry: unknown }) => setMcpServerFn(args)
      : (args: { name: string; lockEntry: unknown }) =>
          Effect.try({
            try: () => {
              const lf = readLf();
              if (!lf.mcpServers) lf.mcpServers = {};
              lf.mcpServers[args.name] = {
                ...(args.lockEntry as Record<string, unknown>),
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

const withServices = (
  axmDir: string,
  wsOverrides?: {
    setMcpServerFn?: ReturnType<typeof vi.fn>;
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
  return Layer.mergeAll(
    NodeServices.layer,
    Workspace.layer(mockWs),
    makeOutputTestLayer()[0],
    Layer.succeed(SourceHostProviders, sourceProviders),
  );
};

const makeRegistryRef = (
  overrides: {
    name?: string;
    profile?: string;
    version?: string;
    integrity?: string;
    location?: string;
  } = {},
): RegistryMcpServerRef => ({
  type: "mcp-server",
  refType: "registry",
  source: {
    type: "registry",
    location: new URL(overrides.location ?? "file:///tmp/reg"),
    profile: Option.none(),
  },
  server: { name: overrides.name ?? "my-server" },
  profile: overrides.profile ?? "@community",
  name: overrides.name ?? "my-server",
  version: overrides.version ?? "1.0.0",
  integrity: overrides.integrity ?? "",
});

const makeOp = (
  overrides: {
    ref?: McpServerExtensionRef;
    force?: boolean;
    versionConstraint?: Option.Option<string>;
    skipSettings?: boolean;
    strictAgentSync?: boolean;
  } = {},
): InstallMcpServerOperation => ({
  name: "install-mcp-server",
  args: {
    ref: overrides.ref ?? makeRegistryRef(),
    force: overrides.force ?? false,
    versionConstraint: overrides.versionConstraint ?? Option.none(),
    skipSettings: Option.fromUndefinedOr(overrides.skipSettings),
    strictAgentSync: Option.fromUndefinedOr(overrides.strictAgentSync),
  },
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("installMcpServer", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "install-mcp-server-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const setupBase = () => {
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });
    return { base, axmDir };
  };

  const setupRegistryCanonical = (base: string, profile: string, name = "my-server") => {
    const canonicalPath = path.join(base, ".axm", "extensions", profile, "mcp-servers", name);
    fs.mkdirSync(canonicalPath, { recursive: true });
    fs.writeFileSync(
      path.join(canonicalPath, "axm-mcp-server.json"),
      JSON.stringify({ name, version: "1.0.0" }),
    );
    return canonicalPath;
  };

  /** Creates a local registry with index.json and a zip archive for an MCP server. */
  const setupLocalRegistry = (opts: { profile?: string; name?: string; version?: string } = {}) => {
    const profile = opts.profile ?? "@community";
    const name = opts.name ?? "my-server";
    const version = opts.version ?? "1.0.0";
    const registryRoot = path.join(tmpDir, "local-registry");
    const extDir = path.join(registryRoot, "extensions", profile, "mcp-servers", name);
    fs.mkdirSync(extDir, { recursive: true });

    // Create index.json
    fs.writeFileSync(
      path.join(extDir, "index.json"),
      JSON.stringify({
        name,
        type: "mcp-server",
        versions: { [version]: { version, published: new Date().toISOString(), integrity: "" } },
      }),
    );

    // Create a simple zip archive containing a file
    const archiveSourceDir = path.join(tmpDir, "archive-source");
    fs.mkdirSync(archiveSourceDir, { recursive: true });
    fs.writeFileSync(path.join(archiveSourceDir, "server.js"), "module.exports = {}");
    const archivePath = path.join(extDir, `${version}.zip`);
    execSync(`cd "${archiveSourceDir}" && zip -r "${archivePath}" .`);

    return { registryRoot, archivePath };
  };

  describe("registry install — empty integrity with existing canonical", () => {
    it.effect("skips fetch and reuses existing canonical directory", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");
        expect(result.message).toContain("my-server");

        const canonicalPath = path.join(
          base,
          ".axm",
          "extensions",
          "@community",
          "mcp-servers",
          "my-server",
        );
        expect(fs.existsSync(path.join(canonicalPath, "axm-mcp-server.json"))).toBe(true);
      }),
    );
  });

  describe("registry install — empty integrity without canonical", () => {
    it.effect("fetches without validation when canonical does not exist", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const { registryRoot } = setupLocalRegistry();

        const ref = makeRegistryRef({
          integrity: "",
          location: `file://${registryRoot}`,
        });

        const result = yield* installMcpServer(makeOp({ ref })).pipe(
          Effect.provide(withServices(axmDir)),
        );

        expect(result.result).toBe("success");

        const canonicalPath = path.join(
          base,
          ".axm",
          "extensions",
          "@community",
          "mcp-servers",
          "my-server",
        );
        expect(fs.existsSync(canonicalPath)).toBe(true);
      }),
    );
  });

  describe("skipSettings", () => {
    it.effect("calls setMcpServerLock instead of setMcpServer when skipSettings is true", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        const setMcpServerFn = vi.fn((_args: { name: string; lockEntry: unknown }) => Effect.void);

        const result = yield* installMcpServer(
          makeOp({
            ref: makeRegistryRef({ integrity: "" }),
            skipSettings: true,
          }),
        ).pipe(Effect.provide(withServices(axmDir, { setMcpServerFn })));

        expect(result.result).toBe("success");
        expect(setMcpServerFn).toHaveBeenCalledOnce();
      }),
    );
  });

  describe("lockfile update", () => {
    it.effect("calls Workspace.setMcpServer after successful installation", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        const setMcpServerFn = vi.fn((_args: { name: string; lockEntry: unknown }) => Effect.void);

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(withServices(axmDir, { setMcpServerFn })));

        expect(result.result).toBe("success");
        expect(setMcpServerFn).toHaveBeenCalledOnce();
        expect(setMcpServerFn).toHaveBeenCalledWith({
          name: "my-server",
          lockEntry: expect.any(Object),
        });
      }),
    );

    it.effect("swallows Workspace.setMcpServer failure without failing installation", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        const setMcpServerFn = vi.fn(() =>
          Effect.fail(
            makeAppError({
              code: "SETTINGS_WRITE_FAILED",
              what: "write failed",
              cause: new Error("write failed"),
            }),
          ),
        );

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(withServices(axmDir, { setMcpServerFn })));

        expect(result.result).toBe("success");
      }),
    );

    it.effect("accepts exact registry resolvedVersion for lockfile persistence", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        const setMcpServerFn = vi.fn((_args: { name: string; lockEntry: unknown }) => Effect.void);

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "", version: "1.2.3" }) }),
        ).pipe(Effect.provide(withServices(axmDir, { setMcpServerFn })));

        expect(result.result).toBe("success");
        expect(setMcpServerFn).toHaveBeenCalledOnce();
        expect(setMcpServerFn).toHaveBeenCalledWith({
          name: "my-server",
          lockEntry: expect.objectContaining({ resolvedVersion: "1.2.3" }),
        });
      }),
    );

    it.effect("fails when registry resolvedVersion is a range", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        const setMcpServerFn = vi.fn((_args: { name: string; lockEntry: unknown }) => Effect.void);

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "", version: "^1.0.0" }) }),
        ).pipe(
          Effect.provide(withServices(axmDir, { setMcpServerFn })),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, error: e })),
        );

        expect(result.result).toBe("error");
        expect(setMcpServerFn).not.toHaveBeenCalled();
        if (result.result === "error") {
          expect(result.error.code).toBe("LOCKFILE_RESOLVED_VERSION_INVALID");
          expect(result.error.what).toContain("exact semver");
          expect(result.error.details.join("\n")).toContain("Received: ^1.0.0");
        }
      }),
    );
  });

  describe("non-empty integrity validation", () => {
    it.effect("fails when integrity does not match", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();
        const { registryRoot } = setupLocalRegistry();

        const ref = makeRegistryRef({
          integrity: "sha512-WRONG==",
          location: `file://${registryRoot}`,
        });

        const result = yield* installMcpServer(makeOp({ ref })).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("Integrity mismatch");
      }),
    );
  });

  describe("path safety", () => {
    it.effect("fails when profile contains path traversal", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();

        const ref = makeRegistryRef({
          profile: "../../../etc",
          integrity: "",
        });

        const result = yield* installMcpServer(makeOp({ ref })).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, error: e })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("INSTALL_MCP_SERVER_PATH_TRAVERSAL");
        }
      }),
    );
  });

  describe("agent sync policy", () => {
    const stubAgent = (
      id: CodingAgent["id"],
      outcome: ReturnType<CodingAgent["addMcpServer"]>,
    ): CodingAgent => ({
      id,
      resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "supported", dir: "/tmp" }),
      addMcpServer: () => outcome,
      removeMcpServer: () => Effect.succeed({ _tag: "success" }),
    });

    it.effect("fails in strict mode when unknown configured agents exist", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        vi.spyOn(DefaultCodingAgentRepository, "getUnknownConfiguredAgentIds").mockReturnValue(
          Effect.succeed(["unknown-agent"]),
        );
        vi.spyOn(DefaultCodingAgentRepository, "getConfiguredAgents").mockReturnValue(
          Effect.succeed([]),
        );

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }), strictAgentSync: true }),
        ).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catch((error) => Effect.succeed({ result: "error" as const, error })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("CODING_AGENT_UNKNOWN_CONFIGURED");
        }
      }),
    );

    it.effect("returns degraded sync status when an agent add fails in best-effort mode", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        vi.spyOn(DefaultCodingAgentRepository, "getUnknownConfiguredAgentIds").mockReturnValue(
          Effect.succeed([]),
        );
        vi.spyOn(DefaultCodingAgentRepository, "getConfiguredAgents").mockReturnValue(
          Effect.succeed([
            stubAgent(
              "claude-code",
              Effect.succeed({ _tag: "failed", reason: "agent command failed" }),
            ),
          ]),
        );

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");
        expect(result.message).toContain("agent-sync=degraded");
      }),
    );

    it.effect("fails in strict mode when an agent add fails", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        vi.spyOn(DefaultCodingAgentRepository, "getUnknownConfiguredAgentIds").mockReturnValue(
          Effect.succeed([]),
        );
        vi.spyOn(DefaultCodingAgentRepository, "getConfiguredAgents").mockReturnValue(
          Effect.succeed([
            stubAgent(
              "claude-code",
              Effect.succeed({ _tag: "failed", reason: "agent command failed" }),
            ),
          ]),
        );

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }), strictAgentSync: true }),
        ).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catch((error) => Effect.succeed({ result: "error" as const, error })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("MCP_SERVER_AGENT_SYNC_FAILED");
        }
      }),
    );

    it.effect("keeps green sync when agent add is unsupported in best-effort mode", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        vi.spyOn(DefaultCodingAgentRepository, "getUnknownConfiguredAgentIds").mockReturnValue(
          Effect.succeed([]),
        );
        vi.spyOn(DefaultCodingAgentRepository, "getConfiguredAgents").mockReturnValue(
          Effect.succeed([
            stubAgent(
              "claude-code",
              Effect.succeed({ _tag: "unsupported", reason: "not supported by agent" }),
            ),
          ]),
        );

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");
        expect(result.message).toContain("canonical=success");
        expect(result.message).toContain("agent-sync=green");
      }),
    );

    it.effect("keeps green sync when required agent is disabled in best-effort mode", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        vi.spyOn(DefaultCodingAgentRepository, "getUnknownConfiguredAgentIds").mockReturnValue(
          Effect.succeed([]),
        );
        vi.spyOn(DefaultCodingAgentRepository, "getConfiguredAgents").mockReturnValue(
          Effect.succeed([
            stubAgent(
              "claude-code",
              Effect.succeed({ _tag: "disabled", reason: "disabled by config" }),
            ),
          ]),
        );

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");
        expect(result.message).toContain("agent-sync=green");
      }),
    );

    it.effect("fails in strict mode when required support-set agent is disabled", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        vi.spyOn(DefaultCodingAgentRepository, "getUnknownConfiguredAgentIds").mockReturnValue(
          Effect.succeed([]),
        );
        vi.spyOn(DefaultCodingAgentRepository, "getConfiguredAgents").mockReturnValue(
          Effect.succeed([
            stubAgent(
              "claude-code",
              Effect.succeed({ _tag: "disabled", reason: "disabled by config" }),
            ),
          ]),
        );

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }), strictAgentSync: true }),
        ).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catch((error) => Effect.succeed({ result: "error" as const, error })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("MCP_SERVER_AGENT_SYNC_DISABLED_REQUIRED");
        }
      }),
    );

    it.effect("does not fail strict mode when non-required agent is disabled", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        vi.spyOn(DefaultCodingAgentRepository, "getUnknownConfiguredAgentIds").mockReturnValue(
          Effect.succeed([]),
        );
        vi.spyOn(DefaultCodingAgentRepository, "getConfiguredAgents").mockReturnValue(
          Effect.succeed([
            stubAgent("adal", Effect.succeed({ _tag: "disabled", reason: "disabled by config" })),
          ]),
        );

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }), strictAgentSync: true }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");
        expect(result.message).toContain("agent-sync=green");
      }),
    );

    it.effect("fails when an agent add is misconfigured", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        vi.spyOn(DefaultCodingAgentRepository, "getUnknownConfiguredAgentIds").mockReturnValue(
          Effect.succeed([]),
        );
        vi.spyOn(DefaultCodingAgentRepository, "getConfiguredAgents").mockReturnValue(
          Effect.succeed([
            stubAgent(
              "claude-code",
              Effect.succeed({ _tag: "misconfigured", reason: "invalid MCP config path" }),
            ),
          ]),
        );

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catch((error) => Effect.succeed({ result: "error" as const, error })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("MCP_SERVER_AGENT_SYNC_MISCONFIGURED");
        }
      }),
    );

    it.effect("keeps best-effort success when unknown configured agents exist", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        vi.spyOn(DefaultCodingAgentRepository, "getUnknownConfiguredAgentIds").mockReturnValue(
          Effect.succeed(["unknown-agent"]),
        );
        vi.spyOn(DefaultCodingAgentRepository, "getConfiguredAgents").mockReturnValue(
          Effect.succeed([]),
        );

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");
        expect(result.message).toContain("agent-sync=green");
      }),
    );

    it.effect(
      "syncs chrome-devtools-mcp install args to configured agents with deterministic mocks",
      () =>
        Effect.gen(function* () {
          const { axmDir, base } = setupBase();
          const canonicalPath = setupRegistryCanonical(base, "@community", "chrome-devtools-mcp");
          const addSpy = vi.fn(() => Effect.succeed({ _tag: "success" as const }));

          const chromeAgent: CodingAgent = {
            id: "claude-code",
            resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "supported", dir: "/tmp" }),
            addMcpServer: addSpy,
            removeMcpServer: () => Effect.succeed({ _tag: "success" }),
          };

          vi.spyOn(DefaultCodingAgentRepository, "getUnknownConfiguredAgentIds").mockReturnValue(
            Effect.succeed([]),
          );
          vi.spyOn(DefaultCodingAgentRepository, "getConfiguredAgents").mockReturnValue(
            Effect.succeed([chromeAgent]),
          );

          const result = yield* installMcpServer(
            makeOp({
              ref: makeRegistryRef({ name: "chrome-devtools-mcp", integrity: "" }),
            }),
          ).pipe(Effect.provide(withServices(axmDir)));

          expect(result.result).toBe("success");
          expect(result.message).toContain("Installed chrome-devtools-mcp");
          expect(result.message).toContain("agent-sync=green");
          expect(addSpy).toHaveBeenCalledOnce();
          expect(addSpy).toHaveBeenCalledWith({
            workspaceRoot: base,
            serverName: "chrome-devtools-mcp",
            canonicalPath,
            profile: "@community",
            resolvedVersion: "1.0.0",
          });
        }),
    );
  });
});
