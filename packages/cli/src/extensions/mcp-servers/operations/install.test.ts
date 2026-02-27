import { execSync } from "node:child_process";
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
import { ClackLogTestLayer } from "../../../clack-effect/log/ClackLogTest.js";
import { makeCliError } from "../../../cli-error/index.js";
import {
  SourceHostProviders,
  type SourceHostProvidersService,
  type ExtensionRef,
} from "../../../sources/index.js";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import { taxonomyStubs } from "../../../workspace/test-stubs.js";
import type { InstallMcpServerOperation } from "./install.js";
import { installMcpServer } from "./install.js";
import type { McpServerExtensionRef, RegistryMcpServerRef } from "../../../sources/types.js";

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
    nonInteractive: true,
    preview: false,
    resolvePlan: () =>
      Effect.succeed({ _tag: "ExecutedPlan", name: "mock", description: Option.none(), jobs: [] }),
    getConfiguredSources: () => Effect.succeed([]),
    getConfiguredSourceByName: () => Effect.succeed(Option.none()),
    getRegistrySourceHosts: () => Effect.succeed([]),
    getConfiguredNamespace: () => Effect.succeed("@community"),
    getDefaultNamespace: () => Effect.succeed(Option.none()),
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
      Effect.succeed(Option.fromNullable(readLf().mcpServers?.[name])),
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
              makeCliError({
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
              makeCliError({
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
        return yield* makeCliError({
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
    NodeContext.layer,
    Workspace.layer(mockWs),
    ClackLogTestLayer,
    Layer.succeed(SourceHostProviders, sourceProviders),
  );
};

const makeRegistryRef = (
  overrides: {
    name?: string;
    namespace?: string;
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
    namespace: Option.none(),
  },
  server: { name: overrides.name ?? "my-server" },
  namespace: overrides.namespace ?? "@community",
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
  } = {},
): InstallMcpServerOperation => ({
  name: "install-mcp-server",
  args: {
    ref: overrides.ref ?? makeRegistryRef(),
    force: overrides.force ?? false,
    versionConstraint: overrides.versionConstraint ?? Option.none(),
    skipSettings: Option.fromNullable(overrides.skipSettings),
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
  });

  const setupBase = () => {
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });
    return { base, axmDir };
  };

  const setupRegistryCanonical = (base: string, namespace: string, name = "my-server") => {
    const canonicalPath = path.join(base, ".axm", "extensions", namespace, "mcp-servers", name);
    fs.mkdirSync(canonicalPath, { recursive: true });
    fs.writeFileSync(
      path.join(canonicalPath, "axm-mcp-server.json"),
      JSON.stringify({ name, version: "1.0.0" }),
    );
    return canonicalPath;
  };

  /** Creates a local registry with index.json and a zip archive for an MCP server. */
  const setupLocalRegistry = (
    opts: { namespace?: string; name?: string; version?: string } = {},
  ) => {
    const namespace = opts.namespace ?? "@community";
    const name = opts.name ?? "my-server";
    const version = opts.version ?? "1.0.0";
    const registryRoot = path.join(tmpDir, "local-registry");
    const extDir = path.join(registryRoot, "extensions", namespace, "mcp-servers", name);
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
            makeCliError({
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
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, error: e })),
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
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("Integrity mismatch");
      }),
    );
  });

  describe("path safety", () => {
    it.effect("fails when namespace contains path traversal", () =>
      Effect.gen(function* () {
        const { axmDir } = setupBase();

        const ref = makeRegistryRef({
          namespace: "../../../etc",
          integrity: "",
        });

        const result = yield* installMcpServer(makeOp({ ref })).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, error: e })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("INSTALL_MCP_SERVER_PATH_TRAVERSAL");
        }
      }),
    );
  });
});
