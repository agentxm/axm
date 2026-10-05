import type { McpBinding } from "@agentxm/workspace-kernel/agent-adapters";
import { McpServerLockEntrySchema } from "@agentxm/workspace-kernel/workspace-state";
import * as Schema from "effect/Schema";
import { decodeExtensionNameSync } from "@agentxm/extension-model/unstable/extensions";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { execSync } from "node:child_process";
import { NativeWriteAuthorityPermissive } from "@agentxm/workspace-kernel/agent-adapters/testing";
import { FootprintRecorderTest } from "@agentxm/workspace-kernel/planning/testing";
import { recordFootprint } from "@agentxm/workspace-kernel/settlement";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { RegistryTransportTest } from "@agentxm/registry-client/testing";
import { afterEach, beforeEach, vi } from "vitest";
import {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "@agentxm/workspace-kernel/projection";
import type { CodingAgent } from "@agentxm/workspace-kernel/agent-adapters";
import {
  SettingsWriteError,
  type WorkspaceSettingsReadFailure,
  type WorkspaceLockfileMutationFailure,
  type WorkspaceStateMutationFailure,
  AcceptedResolutionWriter,
  DesiredStateWriter,
  SettingsWriter,
  type SetMcpServerArgs,
  computeMaterializedTreeIntegrity,
  mcpRegistryResolutionKey,
  mcpWorkspaceSourceKey,
  type McpServerLockEntry,
} from "@agentxm/workspace-kernel/workspace-state";
import { type ExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/extension-ref";
import type {
  McpServerExtensionRef,
  RegistryMcpServerRef,
} from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import {
  SourceHostProviders,
  type SourceHostProvidersService,
} from "@agentxm/workspace-kernel/sources";
import { WorkspaceReadTest } from "@agentxm/workspace-kernel/workspace-state/testing";
import { makeCodingAgentStub } from "./test-helpers.js";
import { type InstallMcpServerOperation } from "@agentxm/workspace-kernel/materialization";
import { installMcpServer } from "./install-operation.js";
import { printSourceParams } from "@agentxm/extension-model/unstable/sources/printer";
import { McpServerManagerLive } from "../manager.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const defaultAgentRepo: CodingAgentRepositoryService = {
  get: () => Effect.die(new Error("not implemented in test")),
  all: Effect.succeed([]),
  getConfiguredAgents: () => Effect.succeed([]),
  getMaterializationAgents: () => Effect.succeed([]),
  getUnknownConfiguredAgentIds: () => Effect.succeed([]),
};

const DEFAULT_REGISTRY_LOCATION = "file:///tmp/reg";

type AcceptedResolutions = NonNullable<Parameters<typeof WorkspaceReadTest>[0]["lockfile"]>;

/**
 * The accepted resolutions a test workspace holds: one Registry row per
 * canonical MCP tree present under the install root, at the tree's current
 * integrity, so a test that lays a canonical tree down starts from accepted
 * state rather than from drift.
 */
const acceptedCanonicalTrees = (
  base: string,
  authority = DEFAULT_REGISTRY_LOCATION,
): Effect.Effect<AcceptedResolutions> =>
  Effect.gen(function* () {
    const root = path.join(base, "agent_extensions", "registry");
    const mcpServers: Record<string, McpServerLockEntry> = {};
    const owners = fs.existsSync(root) ? fs.readdirSync(root) : [];
    for (const owner of owners) {
      const mcpsRoot = path.join(root, owner, "mcps");
      const names = fs.existsSync(mcpsRoot) ? fs.readdirSync(mcpsRoot) : [];
      for (const name of names) {
        const treeIntegrity = yield* computeMaterializedTreeIntegrity(
          path.join(mcpsRoot, name),
        ).pipe(Effect.orDie);
        mcpServers[mcpRegistryResolutionKey({ authority, owner, name })] = {
          source: { type: "registry", url: new URL(authority) },
          identity: { owner: decodeHandleSync(owner), name: decodeExtensionNameSync(name) },
          resolved: {
            version: decodeVersionSync("1.0.0"),
            integrity: "sha512-stub",
            publisherBindingId: "hbnd_test",
          },
          treeIntegrity,
        };
      }
    }
    return { lockfileVersion: 10, skills: {}, mcpServers } as const satisfies AcceptedResolutions;
  }).pipe(Effect.provide(NodeServices.layer));

const withServices = (
  axmDir: string,
  wsOverrides?: {
    setMcpServerFn?: (args: SetMcpServerArgs) => Effect.Effect<void, WorkspaceStateMutationFailure>;
    setAcceptedMcpServerFn?: (
      args: SetMcpServerArgs,
    ) => Effect.Effect<void, WorkspaceLockfileMutationFailure>;
  },
  agentRepo?: CodingAgentRepositoryService,
  lockfile?: AcceptedResolutions,
) => makeServices(axmDir, wsOverrides, agentRepo, lockfile).layer;

const makeServices = (
  axmDir: string,
  wsOverrides?: {
    setMcpServerFn?: (args: SetMcpServerArgs) => Effect.Effect<void, WorkspaceStateMutationFailure>;
    setAcceptedMcpServerFn?: (
      args: SetMcpServerArgs,
    ) => Effect.Effect<void, WorkspaceLockfileMutationFailure>;
  },
  agentRepo?: CodingAgentRepositoryService,
  lockfile?: AcceptedResolutions,
) => {
  const setMcpServer = wsOverrides?.setMcpServerFn;
  const setAcceptedMcpServer = wsOverrides?.setAcceptedMcpServerFn;
  const sourceProviders: SourceHostProvidersService = {
    resolveNamedRegistry: () => Effect.die("not used"),
    find: () => Effect.succeed<ReadonlyArray<ExtensionRef>>([]),
    fetch: (ref) =>
      Effect.succeed(
        ref.refType !== "registry"
          ? { directory: new URL(ref.location).pathname }
          : { directory: ref.source.location.pathname },
      ),
    acquireForTransition: (ref) =>
      Effect.succeed(
        ref.refType !== "registry"
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
    layer: Layer.provideMerge(
      McpServerManagerLive,
      Layer.mergeAll(
        Layer.mergeAll(
          Layer.provideMerge(RegistryTransportTest(FetchHttpClient.layer), NodeServices.layer),
          NativeWriteAuthorityPermissive,
          FootprintRecorderTest,
        ),
        WorkspaceReadTest({
          baseDir: path.dirname(axmDir),
          runtimeDir: axmDir,
          settings: { agents: [] },
          ...(lockfile === undefined
            ? { acceptedResolutions: acceptedCanonicalTrees(path.dirname(axmDir)) }
            : { lockfile }),
        }),
        Layer.mock(SettingsWriter, { setEntry: () => Effect.void }),
        // The mocked state writers stand in for durable writes, so they record
        // the footprint a real write would; the install classifies from it.
        Layer.mock(DesiredStateWriter, {
          declare: (type, args) =>
            recordFootprint({ path: path.join(axmDir, "axm.json"), change: "modified" }).pipe(
              Effect.andThen(
                type === "mcp-server" && "resolutionKey" in args
                  ? (setMcpServer?.(args) ?? Effect.void)
                  : Effect.void,
              ),
            ),
        }),
        Layer.mock(AcceptedResolutionWriter, {
          setAccepted: (type, key, entry) =>
            recordFootprint({ path: path.join(axmDir, "axm-lock.yaml"), change: "modified" }).pipe(
              Effect.andThen(
                Effect.suspend(() => {
                  if (type !== "mcp-server") return Effect.void;
                  if (!Schema.is(McpServerLockEntrySchema)(entry))
                    return Effect.die(new Error("Expected an accepted MCP lock entry"));
                  const lockEntry = entry;
                  return (
                    setAcceptedMcpServer?.({
                      name: entry.identity.name,
                      resolutionKey: key,
                      lockEntry,
                      versionRange: Option.none(),
                    }) ?? Effect.void
                  );
                }),
              ),
            ),
        }),
        Layer.succeed(SourceHostProviders, sourceProviders),
        Layer.succeed(CodingAgentRepository, agentRepo ?? defaultAgentRepo),
      ),
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
    server: { name: decodeExtensionNameSync(name) },
    owner: decodeHandleSync(overrides.owner ?? "@community"),
    name: decodeExtensionNameSync(name),
    version: decodeVersionSync(overrides.version ?? "1.0.0"),
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
    server: { name: decodeExtensionNameSync(name) },
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
    bindings?: ReadonlyArray<McpBinding>;
    sourceIdentity?: string;
  } = {},
): InstallMcpServerOperation => {
  const ref = overrides.ref ?? makeRegistryRef();
  const sourceIdentity =
    overrides.sourceIdentity ??
    (ref.refType === "registry"
      ? mcpRegistryResolutionKey({
          authority: ref.source.location,
          owner: ref.owner,
          name: ref.server.name,
        })
      : ref.refType === "workspace"
        ? mcpWorkspaceSourceKey(ref.owner, ref.server.name)
        : ref.refType === "local"
          ? ref.source.path
          : printSourceParams(ref.source));
  return {
    name: "install-mcp-server",
    args: {
      nonInteractive: true,
      ref,
      sourceIdentity,
      force: overrides.force ?? false,
      ...(overrides.inherited === true
        ? {}
        : {
            declaration: {
              name: ref.server.name,
              versionRange: overrides.versionRange ?? Option.none(),
            },
          }),
      strictAgentSync: Option.fromUndefinedOr(overrides.strictAgentSync),
      ...(overrides.bindings === undefined ? {} : { bindings: overrides.bindings }),
      nativeInsertionEligible: true,
    },
  };
};

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
    const canonicalPath = path.join(base, "agent_extensions", "registry", owner, "mcps", name);
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
    fs.writeFileSync(
      path.join(archiveSourceDir, "mcp.json"),
      JSON.stringify({
        owner,
        name,
        type: "mcp-server",
        version,
        server: {
          name: "ai.example/server",
          description: "Fixture",
          version,
          packages: [
            {
              registryType: "npm",
              identifier: "example-server",
              version,
              transport: { type: "stdio" },
            },
          ],
        },
      }),
    );
    const archivePath = path.join(extDir, `${version}.zip`);
    execSync(`cd "${archiveSourceDir}" && zip -r "${archivePath}" .`);

    return { registryRoot, archivePath };
  };

  describe("registry install — empty integrity with existing canonical", () => {
    it.effect("skips fetch and reuses the accepted canonical tree", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        // No Registry is reachable at the ref's location: success proves the
        // accepted tree was kept rather than acquired again.
        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");
        expect(result.message).toContain("my-server");

        const canonicalPath = path.join(
          base,
          "agent_extensions",
          "registry",
          "@community",
          "mcps",
          "my-server",
        );
        expect(fs.existsSync(path.join(canonicalPath, "mcp.json"))).toBe(true);
      }),
    );

    it.effect("re-acquires an edited canonical tree instead of accepting its drift", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const { registryRoot } = setupLocalRegistry();
        const location = `file://${registryRoot}`;
        const canonicalPath = setupRegistryCanonical(base, "@community");
        const accepted = yield* acceptedCanonicalTrees(base, location);
        fs.writeFileSync(path.join(canonicalPath, "mcp.json"), '{ "edited": true }');
        const drifted = yield* computeMaterializedTreeIntegrity(canonicalPath).pipe(
          Effect.provide(NodeServices.layer),
        );
        let persisted: McpServerLockEntry | undefined;

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ integrity: "", location }) }),
        ).pipe(
          Effect.provide(
            withServices(
              axmDir,
              {
                setMcpServerFn: (args) =>
                  Effect.sync(() => {
                    persisted = args.lockEntry;
                  }),
              },
              undefined,
              accepted,
            ),
          ),
        );

        // The tree on disk is no longer the accepted one, so the install
        // acquires the ref again; the drifted integrity never reaches the lock.
        expect(result.result).toBe("success");
        expect(fs.existsSync(path.join(canonicalPath, "server.js"))).toBe(true);
        expect(fs.readFileSync(path.join(canonicalPath, "mcp.json"), "utf8")).not.toContain(
          "edited",
        );
        expect(persisted?.treeIntegrity).toBeDefined();
        expect(persisted?.treeIntegrity).not.toBe(drifted);
      }),
    );

    it.effect("persists a native environment reference without a credential store", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const root = setupRegistryCanonical(base, "@community");
        fs.writeFileSync(
          path.join(root, "mcp.json"),
          JSON.stringify({
            owner: "@community",
            type: "mcp-server",
            name: "my-server",
            version: "1.0.0",
            server: {
              name: "io.github.community/my-server",
              description: "Reference fixture",
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
        const bindings: ReadonlyArray<McpBinding> = [
          { target: { kind: "environment", name: "API_TOKEN" }, value: { env: "HOST_API_TOKEN" } },
        ];
        let persisted: ReadonlyArray<McpBinding> | undefined;
        const result = yield* installMcpServer(makeOp({ bindings })).pipe(
          Effect.provide(
            withServices(axmDir, {
              setMcpServerFn: (args) =>
                Effect.sync(() => {
                  persisted = args.bindings;
                }),
            }),
          ),
        );
        expect(result.result).toBe("success");
        expect(persisted).toEqual(bindings);
      }),
    );

    it.effect("blocks secret literals before declaration without echoing them", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const root = setupRegistryCanonical(base, "@community");
        fs.writeFileSync(
          path.join(root, "mcp.json"),
          JSON.stringify({
            owner: "@community",
            type: "mcp-server",
            name: "my-server",
            version: "1.0.0",
            server: {
              name: "io.github.community/my-server",
              description: "Reference fixture",
              version: "1.0.0",
              packages: [
                {
                  registryType: "npm",
                  identifier: "@community/my-server",
                  transport: { type: "stdio" },
                  environmentVariables: [{ name: "API_TOKEN", isRequired: true, isSecret: true }],
                },
              ],
            },
          }),
        );
        let declared = false;
        const result = yield* Effect.result(
          installMcpServer(
            makeOp({
              bindings: [
                { target: { kind: "environment", name: "API_TOKEN" }, value: "private-sentinel" },
              ],
            }),
          ).pipe(
            Effect.provide(
              withServices(axmDir, {
                setMcpServerFn: () =>
                  Effect.sync(() => {
                    declared = true;
                  }),
              }),
            ),
          ),
        );
        expect(result._tag).toBe("Failure");
        expect(declared).toBe(false);
        expect(JSON.stringify(result)).not.toContain("private-sentinel");
      }),
    );

    it.effect("reports an invalid manifest as a typed failure", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const canonicalPath = setupRegistryCanonical(base, "@community");
        fs.writeFileSync(path.join(canonicalPath, "mcp.json"), "{");

        const result = yield* Effect.result(
          installMcpServer(makeOp({ ref: makeRegistryRef({ integrity: "" }) })).pipe(
            Effect.provide(withServices(axmDir)),
          ),
        );
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure")
          expect(result.failure).toMatchObject({ _tag: "McpConfigInvalid" });
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
          "registry",
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
        ).pipe(Effect.provide(withServices(axmDir, { setAcceptedMcpServerFn: setMcpServerFn })));

        expect(result.result).toBe("success");
        expect(setMcpServerFn).toHaveBeenCalledOnce();
      }),
    );
  });

  describe("lockfile update", () => {
    it.effect("declares the MCP server after successful installation", () =>
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

    it.effect("fails when the desired-state declaration cannot commit", () =>
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

        expect(error).toMatchObject({ _tag: "SettingsWriteError" });
      }),
    );

    it.effect("accepts exact registry resolvedVersion for lockfile persistence", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();
        const { registryRoot } = setupLocalRegistry({ version: "1.2.3" });
        const setMcpServerFn = vi.fn((_args: SetMcpServerArgs) => Effect.void);

        const result = yield* installMcpServer(
          makeOp({
            ref: makeRegistryRef({
              integrity: "",
              version: "1.2.3",
              location: `file://${registryRoot}`,
            }),
          }),
        ).pipe(Effect.provide(withServices(axmDir, { setMcpServerFn })));

        expect(result.result).toBe("success");
        expect(setMcpServerFn).toHaveBeenCalledOnce();
        expect(setMcpServerFn).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "my-server",
            lockEntry: expect.objectContaining({
              resolved: expect.objectContaining({ version: "1.2.3" }),
            }),
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
          expect(result.error).toMatchObject({ _tag: "LockfileResolvedVersionInvalid" });
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
          expect(result.error).toMatchObject({ _tag: "ArchiveIntegrityMismatch" });
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
          expect(result.error).toMatchObject({ _tag: "McpCanonicalPathUnsafe" });
        }
      }),
    );
  });

  describe("agent sync policy", () => {
    const stubAgent = (id: CodingAgent["id"]): CodingAgent =>
      makeCodingAgentStub(id, {
        resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "supported", dir: "/tmp" }),
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
                path: "agent_extensions/registry/@community/mcps/my-server",
                change: "created",
              }),
              { path: "axm.json", change: "created" },
              {
                path: path.join(base, ".mcp.json"),
                change: "created",
                agentIds: ["claude-code"],
              },
              {
                path: path.join(base, ".codex/config.toml"),
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

    it.effect("reports a configured native MCP reader without a verified AXM writer", () =>
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
        expect(result.message).toContain("agent-sync=degraded");
        expect(result.message).toContain("amp supports native MCP, but AXM has no verified writer");
        expect(result.artifact).toEqual(
          expect.objectContaining({
            agents: ["amp"],
            fileCount: 2,
            targets: [
              expect.objectContaining({
                path: "agent_extensions/registry/@community/mcps/my-server",
              }),
              expect.objectContaining({ path: "axm.json" }),
            ],
          }),
        );
      }),
    );

    it.effect("refuses a manifest without a runnable distribution", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community", "metadata-only", false);

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(Effect.succeed([stubAgent("claude-code")]));
        const services = makeServices(axmDir, undefined, mockAgentRepo);

        const result = yield* installMcpServer(
          makeOp({ ref: makeRegistryRef({ name: "metadata-only", integrity: "" }) }),
        ).pipe(Effect.provide(services.layer), Effect.flip);
        expect(result).toMatchObject({ _tag: "McpConfigurationRefused" });
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
