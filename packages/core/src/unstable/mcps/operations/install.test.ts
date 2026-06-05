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
import { CodingAgentRepository, type CodingAgentRepositoryService } from "../../agents/index.js";
import type { CodingAgent } from "../../agents/coding-agent.js";
import { TestRenderer, logsByTag } from "../../cli-renderer/index.js";
import { makeAppError, type AppError } from "../../app-error/index.js";
import type { ExtensionRef } from "../../extensions/index.js";
import type { McpServerExtensionRef, RegistryMcpServerRef } from "../refs.js";
import { SourceHostProviders } from "../../source-resolution/index.js";
import type { SourceHostProvidersService } from "../../source-resolution/index.js";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "../../workspace/service-interface.js";
import { makeBaseWorkspaceMock } from "../../workspace/test-stubs.js";
import {
  expectRecord,
  exactVersion,
  extensionName,
  handle,
  makeCodingAgentStub,
} from "../../test-helpers.js";
import type { InstallMcpServerOperation } from "./install.js";
import { installMcpServer } from "./install.js";

vi.mock("@napi-rs/keyring", () => {
  const store = new Map<string, string>();

  class Entry {
    private readonly key: string;

    constructor(service: string, account: string) {
      this.key = `${service}:${account}`;
    }

    getPassword(): string | null {
      return store.get(this.key) ?? null;
    }

    setPassword(value: string): void {
      store.set(this.key, value);
    }
  }

  return { Entry };
});

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

type SetMcpServerArgs = Parameters<WorkspaceMutationsService["setMcpServer"]>[0];

const makeWorkspaceMock = (
  axmDir: string,
  overrides?: {
    setMcpServerFn?: (args: SetMcpServerArgs) => Effect.Effect<void, AppError>;
  },
): WorkspaceMutationsService => {
  const readLf = () => {
    const lfPath = path.join(axmDir, "axm-lock.yaml");
    if (!fs.existsSync(lfPath)) return { lockfileVersion: 1, mcpServers: {} };
    return YAML.parse(fs.readFileSync(lfPath, "utf-8"));
  };
  const writeLf = (data: unknown) => {
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(data));
  };

  const setMcpServerFn = overrides?.setMcpServerFn;

  return makeBaseWorkspaceMock(axmDir, {
    getConfiguredAgents: () => Effect.succeed([]),
    getLockedMcpServers: () => Effect.succeed(readLf().mcpServers ?? {}),
    getLockedMcpServer: (name: string) =>
      Effect.succeed(Option.fromUndefinedOr(readLf().mcpServers?.[name])),
    setMcpServer: setMcpServerFn
      ? (args: SetMcpServerArgs) => setMcpServerFn(args)
      : (args: SetMcpServerArgs) =>
          Effect.try({
            try: () => {
              const lf = readLf();
              if (!lf.mcpServers) lf.mcpServers = {};
              lf.mcpServers[args.name] = {
                ...expectRecord(args.lockEntry),
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
    setMcpServerLock: setMcpServerFn
      ? (args: SetMcpServerArgs) => setMcpServerFn(args)
      : (args: SetMcpServerArgs) =>
          Effect.try({
            try: () => {
              const lf = readLf();
              if (!lf.mcpServers) lf.mcpServers = {};
              lf.mcpServers[args.name] = {
                ...expectRecord(args.lockEntry),
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
    getConfiguredMcpServers: () => Effect.succeed({}),
  });
};

const defaultAgentRepo: CodingAgentRepositoryService = {
  get: () => Effect.die(new Error("not implemented in test")),
  all: Effect.succeed([]),
  getConfiguredAgents: () => Effect.succeed([]),
  getMaterializationAgents: () => Effect.succeed([]),
  getUnknownConfiguredAgentIds: () => Effect.succeed([]),
};

const withServices = (
  axmDir: string,
  wsOverrides?: {
    setMcpServerFn?: (args: SetMcpServerArgs) => Effect.Effect<void, AppError>;
  },
  agentRepo?: CodingAgentRepositoryService,
) => makeServices(axmDir, wsOverrides, agentRepo).layer;

const makeServices = (
  axmDir: string,
  wsOverrides?: {
    setMcpServerFn?: (args: SetMcpServerArgs) => Effect.Effect<void, AppError>;
  },
  agentRepo?: CodingAgentRepositoryService,
) => {
  const mockWs = makeWorkspaceMock(axmDir, wsOverrides);
  const sourceProviders: SourceHostProvidersService = {
    find: () => Effect.succeed<ReadonlyArray<ExtensionRef>>([]),
    fetch: (ref) =>
      Effect.succeed(
        ref.refType === "git-hosted" || ref.refType === "local"
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

  return {
    layer: Layer.mergeAll(
      NodeServices.layer,
      WorkspaceMutations.layer(mockWs),
      renderer.layer,
      Layer.succeed(SourceHostProviders, sourceProviders),
      Layer.succeed(CodingAgentRepository, agentRepo ?? defaultAgentRepo),
    ),
    rendererState: renderer.state,
  };
};

const makeRegistryRef = (
  overrides: {
    name?: string;
    owner?: string;
    version?: string;
    integrity?: string;
    location?: string;
  } = {},
): RegistryMcpServerRef => {
  const name = overrides.name ?? "my-server";

  return {
    type: "mcp-server",
    refType: "registry",
    source: {
      type: "registry",
      location: new URL(overrides.location ?? "file:///tmp/reg"),
      owner: Option.none(),
    },
    server: { name: extensionName(name) },
    owner: handle(overrides.owner ?? "@community"),
    name: extensionName(name),
    version: exactVersion(overrides.version ?? "1.0.0"),
    integrity: Option.fromUndefinedOr(overrides.integrity || undefined),
    packages: [],
  };
};

const makeUnsafeRegistryRef = (
  overrides: {
    name?: string;
    owner?: string;
    version?: string;
    integrity?: string;
    location?: string;
  } = {},
): RegistryMcpServerRef => {
  const name = overrides.name ?? "my-server";

  return {
    type: "mcp-server",
    refType: "registry",
    source: {
      type: "registry",
      location: new URL(overrides.location ?? "file:///tmp/reg"),
      owner: Option.none(),
    },
    server: { name: extensionName(name) },
    // Assertion needed: this test intentionally constructs an invalid ref to hit runtime guards.
    owner: (overrides.owner ?? "@community") as unknown as RegistryMcpServerRef["owner"],
    // Assertion needed: this test intentionally constructs an invalid ref to hit runtime guards.
    name: name as unknown as RegistryMcpServerRef["name"],
    // Assertion needed: this test intentionally constructs an invalid ref to hit runtime guards.
    version: (overrides.version ?? "1.0.0") as unknown as RegistryMcpServerRef["version"],
    integrity: Option.fromUndefinedOr(overrides.integrity || undefined),
    packages: [],
  };
};

const makeOp = (
  overrides: {
    ref?: McpServerExtensionRef;
    force?: boolean;
    versionRange?: Option.Option<string>;
    skipSettings?: boolean;
    strictAgentSync?: boolean;
    env?: Readonly<Record<string, string>>;
  } = {},
): InstallMcpServerOperation => ({
  name: "install-mcp-server",
  args: {
    ref: overrides.ref ?? makeRegistryRef(),
    force: overrides.force ?? false,
    versionRange: overrides.versionRange ?? Option.none(),
    skipSettings: Option.fromUndefinedOr(overrides.skipSettings),
    strictAgentSync: Option.fromUndefinedOr(overrides.strictAgentSync),
    env: Option.fromUndefinedOr(overrides.env),
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

  const setupRegistryCanonical = (
    base: string,
    owner: string,
    name = "my-server",
    runnable = true,
  ) => {
    const canonicalPath = path.join(base, ".axm", "extensions", owner, "mcps", name);
    fs.mkdirSync(canonicalPath, { recursive: true });
    fs.writeFileSync(
      path.join(canonicalPath, "mcp-server.json"),
      JSON.stringify({
        owner,
        type: "mcp-server",
        name,
        version: "1.0.0",
        server: {
          name: `io.github.community/${name}`,
          description: `MCP server ${name}`,
          version: "1.0.0",
          ...(runnable
            ? {
                packages: [
                  {
                    registryType: "npm",
                    identifier: `@community/${name}`,
                    version: "1.0.0",
                    transport: { type: "stdio" },
                  },
                ],
              }
            : {}),
        },
      }),
    );
    return canonicalPath;
  };

  /** Creates a local registry with index.json and a zip archive for an MCP server. */
  const setupLocalRegistry = (opts: { owner?: string; name?: string; version?: string } = {}) => {
    const owner = opts.owner ?? "@community";
    const name = opts.name ?? "my-server";
    const version = opts.version ?? "1.0.0";
    const registryRoot = path.join(tmpDir, "local-registry");
    const extDir = path.join(registryRoot, "extensions", owner, "mcps", name);
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
          "mcps",
          "my-server",
        );
        expect(fs.existsSync(path.join(canonicalPath, "mcp-server.json"))).toBe(true);
      }),
    );

    it.effect("does not persist secret inputs in workspace settings", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const canonicalPath = setupRegistryCanonical(base, "@community");
        fs.writeFileSync(
          path.join(canonicalPath, "mcp-server.json"),
          JSON.stringify({
            owner: "@community",
            type: "mcp-server",
            name: "my-server",
            version: "1.0.0",
            server: {
              name: "io.github.community/my-server",
              description: "MCP server my-server",
              version: "1.0.0",
              packages: [
                {
                  registryType: "npm",
                  identifier: "@community/my-server",
                  version: "1.0.0",
                  transport: { type: "stdio" },
                  environmentVariables: [
                    { name: "PUBLIC_URL", isRequired: true },
                    { name: "API_TOKEN", isRequired: true, isSecret: true },
                  ],
                },
              ],
            },
          }),
        );
        let persistedEnv: Readonly<Record<string, string>> | undefined;

        const result = yield* installMcpServer(
          makeOp({
            ref: makeRegistryRef({ integrity: "" }),
            env: {
              PUBLIC_URL: "https://example.test",
              API_TOKEN: "secret-token",
            },
          }),
        ).pipe(
          Effect.provide(
            withServices(axmDir, {
              setMcpServerFn: (args) =>
                Effect.sync(() => {
                  persistedEnv = args.env;
                }),
            }),
          ),
        );

        expect(result.result).toBe("success");
        expect(persistedEnv).toEqual({ PUBLIC_URL: "https://example.test" });
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
          "mcps",
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
        const setMcpServerFn = vi.fn((_args: SetMcpServerArgs) => Effect.void);

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
    it.effect("calls WorkspaceMutations.setMcpServer after successful installation", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        const setMcpServerFn = vi.fn((_args: { name: string; lockEntry: unknown }) => Effect.void);

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(withServices(axmDir, { setMcpServerFn })));

        expect(result.result).toBe("success");
        expect(setMcpServerFn).toHaveBeenCalledOnce();
        expect(setMcpServerFn).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "my-server",
            lockEntry: expect.any(Object),
          }),
        );
      }),
    );

    it.effect("returns WorkspaceMutations.setMcpServer failure in result without raw warning", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        const setMcpServerFn = vi.fn(() =>
          Effect.fail(
            makeAppError({
              code: "internal",
              detail: "write failed",
              cause: new Error("write failed"),
            }),
          ),
        );
        const services = makeServices(axmDir, { setMcpServerFn });

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(services.layer));

        expect(result.result).toBe("success");
        expect(result.message).toContain("MCP server update failed");
        expect(result.message).toContain("write failed");
        expect(logsByTag(services.rendererState).warn).toEqual([]);
      }),
    );

    it.effect("accepts exact registry resolvedVersion for lockfile persistence", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        const setMcpServerFn = vi.fn((_args: SetMcpServerArgs) => Effect.void);

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "", version: "1.2.3" }) }),
        ).pipe(Effect.provide(withServices(axmDir, { setMcpServerFn })));

        expect(result.result).toBe("success");
        expect(setMcpServerFn).toHaveBeenCalledOnce();
        expect(setMcpServerFn).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "my-server",
            lockEntry: expect.objectContaining({ resolvedVersion: "1.2.3" }),
          }),
        );
      }),
    );

    it.effect("fails when registry resolvedVersion is a range", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        const setMcpServerFn = vi.fn((_args: { name: string; lockEntry: unknown }) => Effect.void);

        const result = yield* installMcpServer(
          makeOp({ ref: makeUnsafeRegistryRef({ integrity: "", version: "^1.0.0" }) }),
        ).pipe(
          Effect.provide(withServices(axmDir, { setMcpServerFn })),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, error: e })),
        );

        expect(result.result).toBe("error");
        expect(setMcpServerFn).not.toHaveBeenCalled();
        if (result.result === "error") {
          expect(result.error.code).toBe("validation");
          expect(result.error.detail).toContain("exact semver");
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
          Effect.catch((e) => Effect.succeed({ result: "error" as const, message: e.detail })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("Integrity mismatch");
      }),
    );
  });

  describe("path safety", () => {
    it.effect("fails when owner contains path traversal", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();

        const ref = makeUnsafeRegistryRef({
          owner: "../../../etc",
          integrity: "",
        });

        const result = yield* installMcpServer(makeOp({ ref })).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, error: e })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("internal");
        }
      }),
    );
  });

  describe("agent sync policy", () => {
    const stubAgent = (
      id: CodingAgent["id"],
      outcome: ReturnType<CodingAgent["addMcpServer"]>,
    ): CodingAgent =>
      makeCodingAgentStub(id, {
        resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "supported", dir: "/tmp" }),
        addMcpServer: () => outcome,
        removeMcpServer: () => Effect.succeed({ _tag: "success" }),
      });

    const getConfiguredAgentsMock = vi.fn<
      () => Effect.Effect<ReadonlyArray<CodingAgent>, AppError>
    >(() => Effect.succeed([]));
    const getUnknownConfiguredAgentIdsMock = vi.fn<
      () => Effect.Effect<ReadonlyArray<string>, AppError>
    >(() => Effect.succeed([]));

    const mockAgentRepo: CodingAgentRepositoryService = {
      get: () => Effect.die(new Error("not implemented in test")),
      all: Effect.succeed([]),
      getConfiguredAgents: getConfiguredAgentsMock,
      getMaterializationAgents: getConfiguredAgentsMock,
      getUnknownConfiguredAgentIds: getUnknownConfiguredAgentIdsMock,
    };

    it.effect("fails in strict mode when unknown configured agents exist", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed(["unknown-agent"]));
        getConfiguredAgentsMock.mockReturnValue(Effect.succeed([]));

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }), strictAgentSync: true }),
        ).pipe(
          Effect.provide(withServices(axmDir, undefined, mockAgentRepo)),
          Effect.catch((error) => Effect.succeed({ result: "error" as const, error })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("not_found");
        }
      }),
    );

    it.effect("returns degraded sync status when an agent add fails in best-effort mode", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(
          Effect.succeed([
            stubAgent(
              "claude-code",
              Effect.succeed({ _tag: "failed", reason: "agent command failed" }),
            ),
          ]),
        );

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(withServices(axmDir, undefined, mockAgentRepo)));

        expect(result.result).toBe("success");
        expect(result.message).toContain("agent-sync=degraded");
      }),
    );

    it.effect("fails in strict mode when an agent add fails", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(
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
          Effect.provide(withServices(axmDir, undefined, mockAgentRepo)),
          Effect.catch((error) => Effect.succeed({ result: "error" as const, error })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("internal");
        }
      }),
    );

    it.effect("keeps green sync when agent add is unsupported in best-effort mode", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(
          Effect.succeed([
            stubAgent(
              "claude-code",
              Effect.succeed({ _tag: "unsupported", reason: "not supported by agent" }),
            ),
          ]),
        );

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(withServices(axmDir, undefined, mockAgentRepo)));

        expect(result.result).toBe("success");
        expect(result.message).toContain("canonical=success");
        expect(result.message).toContain("agent-sync=green");
      }),
    );

    it.effect("returns no-runnable sync context without calling agents or raw warning", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community", "metadata-only", false);
        const addSpy = vi.fn(() => Effect.succeed({ _tag: "success" as const }));

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(
          Effect.succeed([
            makeCodingAgentStub("claude-code", {
              resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "supported", dir: "/tmp" }),
              addMcpServer: addSpy,
              removeMcpServer: () => Effect.succeed({ _tag: "success" }),
            }),
          ]),
        );
        const services = makeServices(axmDir, undefined, mockAgentRepo);

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ name: "metadata-only", integrity: "" }) }),
        ).pipe(Effect.provide(services.layer));

        expect(result.result).toBe("success");
        expect(result.message).toContain("agent-sync=green");
        expect(result.message).toContain("manifest server has no packages or remotes");
        expect(logsByTag(services.rendererState).warn).toEqual([]);
        expect(addSpy).not.toHaveBeenCalled();
      }),
    );

    it.effect("keeps green sync when required agent is disabled in best-effort mode", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(
          Effect.succeed([
            stubAgent(
              "claude-code",
              Effect.succeed({ _tag: "disabled", reason: "disabled by config" }),
            ),
          ]),
        );

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(withServices(axmDir, undefined, mockAgentRepo)));

        expect(result.result).toBe("success");
        expect(result.message).toContain("agent-sync=green");
      }),
    );

    it.effect("fails in strict mode when required support-set agent is disabled", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(
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
          Effect.provide(withServices(axmDir, undefined, mockAgentRepo)),
          Effect.catch((error) => Effect.succeed({ result: "error" as const, error })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("internal");
        }
      }),
    );

    it.effect("does not fail strict mode when non-required agent is disabled", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(
          Effect.succeed([
            stubAgent("adal", Effect.succeed({ _tag: "disabled", reason: "disabled by config" })),
          ]),
        );

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }), strictAgentSync: true }),
        ).pipe(Effect.provide(withServices(axmDir, undefined, mockAgentRepo)));

        expect(result.result).toBe("success");
        expect(result.message).toContain("agent-sync=green");
      }),
    );

    it.effect("fails when an agent add is misconfigured", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(
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
          Effect.provide(withServices(axmDir, undefined, mockAgentRepo)),
          Effect.catch((error) => Effect.succeed({ result: "error" as const, error })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("internal");
        }
      }),
    );

    it.effect("keeps best-effort success when unknown configured agents exist", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed(["unknown-agent"]));
        getConfiguredAgentsMock.mockReturnValue(Effect.succeed([]));

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(withServices(axmDir, undefined, mockAgentRepo)));

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

          const chromeAgent: CodingAgent = makeCodingAgentStub("claude-code", {
            resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "supported", dir: "/tmp" }),
            addMcpServer: addSpy,
            removeMcpServer: () => Effect.succeed({ _tag: "success" }),
          });

          getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
          getConfiguredAgentsMock.mockReturnValue(Effect.succeed([chromeAgent]));

          const result = yield* installMcpServer(
            makeOp({
              ref: makeRegistryRef({ name: "chrome-devtools-mcp", integrity: "" }),
            }),
          ).pipe(Effect.provide(withServices(axmDir, undefined, mockAgentRepo)));

          expect(result.result).toBe("success");
          expect(result.message).toContain("Installed chrome-devtools-mcp");
          expect(result.message).toContain("agent-sync=green");
          expect(addSpy).toHaveBeenCalledOnce();
          expect(addSpy).toHaveBeenCalledWith({
            workspaceRoot: base,
            scope: "project",
            serverName: "chrome-devtools-mcp",
            canonicalPath,
            owner: "@community",
            resolvedVersion: "1.0.0",
            enabled: true,
            configValues: {},
          });
        }),
    );
  });
});
