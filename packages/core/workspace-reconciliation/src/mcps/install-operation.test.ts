import { exactVersion, extensionName, handle } from "../test-helpers.js";
import { execSync } from "node:child_process";
import { NativeWriteAuthorityPermissive } from "@agentxm/agent-integration/testing";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import YAML from "yaml";
import { afterEach, beforeEach, vi } from "vitest";
import {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "@agentxm/workspace-projection";
import type { CodingAgent } from "@agentxm/agent-integration";
import { SettingsWriteError, type WorkspaceSettingsReadFailure } from "@agentxm/workspace-state";
import type { WorkspaceStateMutationFailure } from "@agentxm/workspace-state";
import { LockfileWriteError } from "@agentxm/workspace-state";
import { type ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type {
  McpServerExtensionRef,
  RegistryMcpServerRef,
} from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import { SourceHostProviders } from "@agentxm/extension-sources";
import type { SourceHostProvidersService } from "@agentxm/extension-sources";
import { WorkspaceMutations, type WorkspaceMutationsService } from "@agentxm/workspace-state";
import { makeBaseWorkspaceMock } from "@agentxm/workspace-state/testing";
import { expectRecord, makeCodingAgentStub } from "./test-helpers.js";
import type { McpSecretStoreService } from "@agentxm/extension-materialization";
import { McpSecretStore, mcpSecretAccount } from "@agentxm/extension-materialization";
import type { InstallMcpServerOperation } from "./install-operation.js";
import { installMcpServer } from "./install-operation.js";

/**
 * A credential store that keeps what it is given, but refuses the one value
 * the write-failure example uses — the condition a locked or full keychain
 * produces. It is a behaviour, not a module patch: the install reaches it
 * through the port it declares.
 */
const REFUSED_SECRET_VALUE = "fail-to-save";

const makeTestSecretStore = (): {
  readonly service: McpSecretStoreService;
  readonly values: Map<string, string>;
} => {
  const values = new Map<string, string>();
  return {
    values,
    service: {
      read: (account) => Effect.sync(() => Option.fromNullOr(values.get(account) ?? null)),
      write: (account, value) =>
        Effect.sync(() => {
          if (value === REFUSED_SECRET_VALUE) return "failed";
          values.set(account, value);
          return "saved";
        }),
      erase: (account) => Effect.sync(() => (values.delete(account) ? "deleted" : "absent")),
    },
  };
};

let secretStore = makeTestSecretStore();

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

type SetMcpServerArgs = Parameters<WorkspaceMutationsService["setMcpServer"]>[0];

const makeWorkspaceMock = (
  axmDir: string,
  overrides?: {
    setMcpServerFn?: (args: SetMcpServerArgs) => Effect.Effect<void, WorkspaceStateMutationFailure>;
  },
): WorkspaceMutationsService => {
  const readLf = () => {
    const lfPath = path.join(axmDir, "axm-lock.yaml");
    if (!fs.existsSync(lfPath)) return { lockfileVersion: 3, mcpServers: {} };
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
              lf.mcpServers[args.resolutionKey] = {
                ...expectRecord(args.lockEntry),
                updatedAt: new Date().toISOString(),
              };
              writeLf(lf);
            },
            catch: (error) =>
              new SettingsWriteError({
                path: "axm.json",
                step: "encode",
                cause: error,
              }),
          }),
    setMcpServerLock: setMcpServerFn
      ? (args: SetMcpServerArgs) =>
          setMcpServerFn(args).pipe(
            Effect.mapError(
              (cause) =>
                new LockfileWriteError({
                  path: path.join(axmDir, "axm-lock.yaml"),
                  step: "write-temp",
                  cause,
                }),
            ),
          )
      : (args: SetMcpServerArgs) =>
          Effect.try({
            try: () => {
              const lf = readLf();
              if (!lf.mcpServers) lf.mcpServers = {};
              lf.mcpServers[args.resolutionKey] = {
                ...expectRecord(args.lockEntry),
                updatedAt: new Date().toISOString(),
              };
              writeLf(lf);
            },
            catch: (error) =>
              new LockfileWriteError({
                path: path.join(axmDir, "axm-lock.yaml"),
                step: "write-temp",
                cause: error,
              }),
          }),
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
    setMcpServerFn?: (args: SetMcpServerArgs) => Effect.Effect<void, WorkspaceStateMutationFailure>;
  },
  agentRepo?: CodingAgentRepositoryService,
) => makeServices(axmDir, wsOverrides, agentRepo).layer;

const makeServices = (
  axmDir: string,
  wsOverrides?: {
    setMcpServerFn?: (args: SetMcpServerArgs) => Effect.Effect<void, WorkspaceStateMutationFailure>;
  },
  agentRepo?: CodingAgentRepositoryService,
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

  return {
    layer: Layer.mergeAll(
      Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer, NativeWriteAuthorityPermissive),
      WorkspaceMutations.layer(mockWs),
      Layer.succeed(McpSecretStore, secretStore.service),
      Layer.succeed(SourceHostProviders, sourceProviders),
      Layer.succeed(CodingAgentRepository, agentRepo ?? defaultAgentRepo),
    ),
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

    publisherBindingId: "hbnd_test",
    source: {
      type: "registry",
      name: "agentxm",
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

    publisherBindingId: "hbnd_test",
    source: {
      type: "registry",
      name: "agentxm",
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
    inherited?: boolean;
    strictAgentSync?: boolean;
    env?: Readonly<Record<string, string>>;
  } = {},
): InstallMcpServerOperation => ({
  name: "install-mcp-server",
  args: {
    nonInteractive: true,
    ref: overrides.ref ?? makeRegistryRef(),
    force: overrides.force ?? false,
    ...(overrides.inherited === true
      ? {}
      : {
          declaration: {
            name: (overrides.ref ?? makeRegistryRef()).server.name,
            versionRange: overrides.versionRange ?? Option.none(),
          },
        }),
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
    secretStore = makeTestSecretStore();
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
    const canonicalPath = path.join(base, "agent_extensions", "agentxm", owner, "mcps", name);
    fs.mkdirSync(canonicalPath, { recursive: true });
    fs.writeFileSync(
      path.join(canonicalPath, "mcp.json"),
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
          "agent_extensions",
          "agentxm",
          "@community",
          "mcps",
          "my-server",
        );
        expect(fs.existsSync(path.join(canonicalPath, "mcp.json"))).toBe(true);
      }),
    );

    for (const token of ["secret-token", "${API_TOKEN}"]) {
      it.effect(
        `stores literal credentials in the keychain and symbolic credentials in settings: ${token}`,
        () =>
          Effect.gen(function* () {
            const { axmDir, base } = setupBase();
            const canonicalPath = setupRegistryCanonical(base, "@community");
            fs.writeFileSync(
              path.join(canonicalPath, "mcp.json"),
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
                  API_TOKEN: token,
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
            expect(persistedEnv).toEqual({
              PUBLIC_URL: "https://example.test",
              ...(token === "${API_TOKEN}" ? { API_TOKEN: token } : {}),
            });
            expect([...secretStore.values.values()]).toEqual(
              token === "${API_TOKEN}" ? [] : [token],
            );
          }),
      );
    }

    it.effect("warns when a secret cannot be saved to the system keychain", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const canonicalPath = setupRegistryCanonical(base, "@community");
        fs.writeFileSync(
          path.join(canonicalPath, "mcp.json"),
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
                  environmentVariables: [{ name: "API_TOKEN", isRequired: true, isSecret: true }],
                },
              ],
            },
          }),
        );

        const result = yield* installMcpServer(
          makeOp({
            ref: makeRegistryRef({ integrity: "" }),
            env: { API_TOKEN: "fail-to-save" },
          }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");
        expect(result.message).toContain("API_TOKEN could not be saved to the system keychain");
        expect(result.message).not.toContain("fail-to-save");
      }),
    );

    it.effect("fails with the --env recipe when a required input is unset", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const canonicalPath = setupRegistryCanonical(base, "@community");
        fs.writeFileSync(
          path.join(canonicalPath, "mcp.json"),
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
                    { name: "REGION", isRequired: true },
                  ],
                },
              ],
            },
          }),
        );

        const result = yield* Effect.result(
          installMcpServer(
            makeOp({
              ref: makeRegistryRef({ integrity: "" }),
              env: { PUBLIC_URL: "https://example.test" },
            }),
          ).pipe(Effect.provide(withServices(axmDir))),
        );

        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure._tag).toBe("McpRequiredInputsMissing");
          expect(result.failure).toMatchObject({
            localName: "my-server",
            inputNames: ["REGION"],
          });
        }
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
          "agent_extensions",
          "agentxm",
          "@community",
          "mcps",
          "my-server",
        );
        expect(fs.existsSync(canonicalPath)).toBe(true);
      }),
    );
  });

  describe("inherited", () => {
    it.effect("records accepted resolution without declaring a root for inherited members", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        const setMcpServerFn = vi.fn((_args: SetMcpServerArgs) => Effect.void);

        const result = yield* installMcpServer(
          makeOp({
            ref: makeRegistryRef({ integrity: "" }),
            inherited: true,
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

    it.effect("fails when WorkspaceMutations.setMcpServer cannot commit state", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        const setMcpServerFn = vi.fn(() =>
          Effect.fail(
            new SettingsWriteError({
              path: "axm.json",
              step: "encode",
              cause: new Error("write failed"),
            }),
          ),
        );
        const services = makeServices(axmDir, { setMcpServerFn });

        const error = yield* Effect.flip(
          installMcpServer(makeOp({ ref: makeRegistryRef({ integrity: "" }) })).pipe(
            Effect.provide(services.layer),
          ),
        );

        expect(error._tag).toBe("SettingsWriteError");
      }),
    );

    it.effect("accepts exact registry resolvedVersion for lockfile persistence", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community", "my-server", true);
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
        setupRegistryCanonical(base, "@community", "my-server", true);
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
          expect(result.error._tag).toBe("LockfileResolvedVersionInvalid");
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
          Effect.catch((error) => Effect.succeed({ result: "error" as const, error })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error._tag).toBe("ArchiveIntegrityMismatch");
        }
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
          expect(result.error._tag).toBe("McpCanonicalPathUnsafe");
        }
      }),
    );
  });

  describe("agent sync policy", () => {
    const stubAgent = (id: CodingAgent["id"]): CodingAgent =>
      makeCodingAgentStub(id, {
        resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "supported", dir: "/tmp" }),
        addMcpServer: () => Effect.succeed({ _tag: "unsupported", reason: "not called" }),
        removeMcpServer: () => Effect.succeed({ _tag: "success" }),
      });

    const getConfiguredAgentsMock = vi.fn<
      () => Effect.Effect<ReadonlyArray<CodingAgent>, WorkspaceSettingsReadFailure>
    >(() => Effect.succeed([]));
    const getUnknownConfiguredAgentIdsMock = vi.fn<
      () => Effect.Effect<ReadonlyArray<string>, WorkspaceSettingsReadFailure>
    >(() => Effect.succeed([]));

    const mockAgentRepo: CodingAgentRepositoryService = {
      get: () => Effect.die(new Error("not implemented in test")),
      all: Effect.succeed([]),
      getConfiguredAgents: getConfiguredAgentsMock,
      getMaterializationAgents: getConfiguredAgentsMock,
      getUnknownConfiguredAgentIds: getUnknownConfiguredAgentIdsMock,
    };

    it.effect("reports configured agents and deduplicated materialization targets", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(
          Effect.succeed([stubAgent("claude-code"), stubAgent("codex")]),
        );

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(withServices(axmDir, undefined, mockAgentRepo)));

        expect(result.result).toBe("success");
        if (result.result !== "success") {
          throw new Error(result.message);
        }
        expect(result.artifact).toEqual(
          expect.objectContaining({
            change: "created",
            agents: ["claude-code", "codex"],
            fileCount: 4,
            targets: [
              expect.objectContaining({
                path: "agent_extensions/agentxm/@community/mcps/my-server",
                change: "created",
              }),
              { path: "axm.json", change: "created" },
              {
                path: ".mcp.json",
                change: "created",
                agentIds: ["claude-code"],
              },
              {
                path: ".codex/config.toml",
                change: "created",
                agentIds: ["codex"],
              },
            ],
          }),
        );
      }),
    );

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
          expect(result.error).toMatchObject({
            _tag: "McpAgentSyncRefused",
            fault: "unknown-agents",
            agentIds: ["unknown-agent"],
          });
        }
      }),
    );

    it.effect("reports a configured agent without MCP projection support", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(Effect.succeed([stubAgent("amp")]));

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(withServices(axmDir, undefined, mockAgentRepo)));

        expect(result.result).toBe("success");
        if (result.result !== "success") {
          throw new Error(result.message);
        }
        expect(result.message).toContain("canonical=success");
        expect(result.message).toContain("agent-sync=green");
        expect(result.message).toContain("does not have MCP config support");
        expect(result.artifact).toEqual(
          expect.objectContaining({
            agents: [],
            fileCount: 2,
            targets: [
              expect.objectContaining({
                path: "agent_extensions/agentxm/@community/mcps/my-server",
              }),
              expect.objectContaining({ path: "axm.json" }),
            ],
          }),
        );
      }),
    );

    it.effect("returns no-runnable sync context without writing native config", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community", "metadata-only", false);

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(Effect.succeed([stubAgent("claude-code")]));
        const services = makeServices(axmDir, undefined, mockAgentRepo);

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ name: "metadata-only", integrity: "" }) }),
        ).pipe(Effect.provide(services.layer));

        expect(result.result).toBe("success");
        expect(result.message).toContain("agent-sync=green");
        expect(result.message).toContain("manifest server has no packages or remotes");
        expect(fs.existsSync(path.join(base, ".mcp.json"))).toBe(false);
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

    it.effect("projects chrome-devtools-mcp install through the manifest target decision", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community", "chrome-devtools-mcp");

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(Effect.succeed([stubAgent("claude-code")]));

        const result = yield* installMcpServer(
          makeOp({
            ref: makeRegistryRef({ name: "chrome-devtools-mcp", integrity: "" }),
          }),
        ).pipe(Effect.provide(withServices(axmDir, undefined, mockAgentRepo)));

        expect(result.result).toBe("success");
        expect(result.message).toContain("Installed chrome-devtools-mcp");
        expect(result.message).toContain("agent-sync=green");
        expect(JSON.parse(fs.readFileSync(path.join(base, ".mcp.json"), "utf8"))).toMatchObject({
          mcpServers: {
            "chrome-devtools-mcp": expect.objectContaining({ command: "npx" }),
          },
        });
      }),
    );
  });
});

describe("mcpSecretAccount", () => {
  const base = {
    scopeRoot: "/workspace/project",
    localName: "work-context",
    sourceIdentity: "registry:https%3A%2F%2Fregistry.example:@acme/mcps/context",
    inputName: "API_TOKEN",
  } as const;

  it("derives a deterministic hexadecimal account", () => {
    const account = mcpSecretAccount(base);
    expect(account).toMatch(/^[0-9a-f]{64}$/u);
    expect(mcpSecretAccount(base)).toBe(account);
  });

  it.each([
    ["workspace root", { ...base, scopeRoot: "/workspace/other" }],
    ["local connection name", { ...base, localName: "personal-context" }],
    ["source identity", { ...base, sourceIdentity: `${base.sourceIdentity}-other` }],
    ["input name", { ...base, inputName: "OTHER_TOKEN" }],
  ])("changes the account when the %s changes", (_component, variant) => {
    expect(mcpSecretAccount(variant)).not.toBe(mcpSecretAccount(base));
  });
});
