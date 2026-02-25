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
import { makeLogTestLayer } from "../../../tui/index.js";
import { makeCliError } from "../../../cli-error/index.js";
import {
  SourceHostProviders,
  type SourceHostProvidersService,
  type ExtensionRef,
} from "../../../sources/index.js";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import { taxonomyStubs } from "../../../workspace/test-stubs.js";
import type { InstallCommandOperation } from "./install.js";
import { installCommand } from "./install.js";
import type { CommandExtensionRef, RegistryCommandRef } from "../../../sources/types.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeWorkspaceMock = (
  axmDir: string,
  overrides?: {
    setCommandFn?: ReturnType<typeof vi.fn>;
  },
): WorkspaceContextService => {
  const readLf = () => {
    const lfPath = path.join(axmDir, "axm-lock.yaml");
    if (!fs.existsSync(lfPath)) return { lockfileVersion: 1, commands: {} };
    return YAML.parse(fs.readFileSync(lfPath, "utf-8"));
  };
  const writeLf = (data: unknown) => {
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(data));
  };

  const setCommandFn = overrides?.setCommandFn;

  return {
    ...taxonomyStubs,
    global: false,
    path: axmDir,
    baseDir: path.dirname(axmDir),
    nonInteractive: true,
    preview: false,
    resolvePlan: () => Effect.succeed({ name: "mock", description: Option.none(), jobs: [] }),
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
    getLockedCommands: () => Effect.succeed(readLf().commands ?? {}),
    getLockedCommand: (name: string) =>
      Effect.succeed(Option.fromNullable(readLf().commands?.[name])),
    setCommand: setCommandFn
      ? (args: { name: string; lockEntry: unknown }) => setCommandFn(args)
      : (args: { name: string; lockEntry: unknown }) =>
          Effect.try({
            try: () => {
              const lf = readLf();
              if (!lf.commands) lf.commands = {};
              lf.commands[args.name] = {
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
    setCommandLock: setCommandFn
      ? (args: { name: string; lockEntry: unknown }) => setCommandFn(args)
      : (args: { name: string; lockEntry: unknown }) =>
          Effect.try({
            try: () => {
              const lf = readLf();
              if (!lf.commands) lf.commands = {};
              lf.commands[args.name] = {
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
    removeCommand: () => Effect.void,
    getLockedMcpServers: () => Effect.succeed({}),
    getLockedMcpServer: () => Effect.succeed(Option.none()),
    setMcpServer: () => Effect.void,
    setMcpServerLock: () => Effect.void,
    removeMcpServer: () => Effect.void,
    getConfiguredCommands: () => Effect.succeed({}),
    getConfiguredMcpServers: () => Effect.succeed({}),
  };
};

const withServices = (
  axmDir: string,
  wsOverrides?: {
    setCommandFn?: ReturnType<typeof vi.fn>;
  },
) => {
  const mockWs = makeWorkspaceMock(axmDir, wsOverrides);
  const [logLayer] = makeLogTestLayer();
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
    logLayer,
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
): RegistryCommandRef => ({
  type: "command",
  refType: "registry",
  source: {
    type: "registry",
    location: new URL(overrides.location ?? "file:///tmp/reg"),
    namespace: Option.none(),
  },
  command: { name: overrides.name ?? "my-command" },
  namespace: overrides.namespace ?? "@community",
  name: overrides.name ?? "my-command",
  version: overrides.version ?? "1.0.0",
  integrity: overrides.integrity ?? "",
});

const makeOp = (
  overrides: {
    ref?: CommandExtensionRef;
    force?: boolean;
    versionConstraint?: Option.Option<string>;
    skipSettings?: boolean;
  } = {},
): InstallCommandOperation => ({
  name: "install-command",
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

describe("installCommand", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "install-command-")));
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

  const setupRegistryCanonical = (base: string, namespace: string, name = "my-command") => {
    const canonicalPath = path.join(base, ".axm", "extensions", namespace, "commands", name);
    fs.mkdirSync(canonicalPath, { recursive: true });
    fs.writeFileSync(
      path.join(canonicalPath, "axm-command.json"),
      JSON.stringify({ name, version: "1.0.0" }),
    );
    return canonicalPath;
  };

  /** Creates a local registry with index.json and a zip archive for a command. */
  const setupLocalRegistry = (
    opts: { namespace?: string; name?: string; version?: string } = {},
  ) => {
    const namespace = opts.namespace ?? "@community";
    const name = opts.name ?? "my-command";
    const version = opts.version ?? "1.0.0";
    const registryRoot = path.join(tmpDir, "local-registry");
    const extDir = path.join(registryRoot, "extensions", namespace, "commands", name);
    fs.mkdirSync(extDir, { recursive: true });

    // Create index.json
    fs.writeFileSync(
      path.join(extDir, "index.json"),
      JSON.stringify({
        name,
        type: "command",
        versions: { [version]: { version, published: new Date().toISOString(), integrity: "" } },
      }),
    );

    // Create a simple zip archive containing a file
    const archiveSourceDir = path.join(tmpDir, "archive-source");
    fs.mkdirSync(archiveSourceDir, { recursive: true });
    fs.writeFileSync(path.join(archiveSourceDir, "run.sh"), "#!/bin/bash\necho hello");
    const archivePath = path.join(extDir, `${version}.zip`);
    execSync(`cd "${archiveSourceDir}" && zip -r "${archivePath}" .`);

    return { registryRoot, archivePath };
  };

  describe("registry install — empty integrity with existing canonical", () => {
    it.effect("skips fetch and reuses existing canonical directory", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");

        const result = yield* installCommand(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(withServices(axmDir)));

        expect(result.result).toBe("success");
        expect(result.message).toContain("my-command");

        // Canonical files should still exist (useExisting path)
        const canonicalPath = path.join(
          base,
          ".axm",
          "extensions",
          "@community",
          "commands",
          "my-command",
        );
        expect(fs.existsSync(path.join(canonicalPath, "axm-command.json"))).toBe(true);
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

        const result = yield* installCommand(makeOp({ ref })).pipe(
          Effect.provide(withServices(axmDir)),
        );

        expect(result.result).toBe("success");

        // Canonical should exist now
        const canonicalPath = path.join(
          base,
          ".axm",
          "extensions",
          "@community",
          "commands",
          "my-command",
        );
        expect(fs.existsSync(canonicalPath)).toBe(true);
      }),
    );
  });

  describe("skipSettings", () => {
    it.effect("calls setCommandLock instead of setCommand when skipSettings is true", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        const setCommandFn = vi.fn((_args: { name: string; lockEntry: unknown }) => Effect.void);

        const result = yield* installCommand(
          makeOp({
            ref: makeRegistryRef({ integrity: "" }),
            skipSettings: true,
          }),
        ).pipe(Effect.provide(withServices(axmDir, { setCommandFn })));

        expect(result.result).toBe("success");
        expect(setCommandFn).toHaveBeenCalledOnce();
      }),
    );
  });

  describe("lockfile update", () => {
    it.effect("calls Workspace.setCommand after successful installation", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        const setCommandFn = vi.fn((_args: { name: string; lockEntry: unknown }) => Effect.void);

        const result = yield* installCommand(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(withServices(axmDir, { setCommandFn })));

        expect(result.result).toBe("success");
        expect(setCommandFn).toHaveBeenCalledOnce();
        expect(setCommandFn).toHaveBeenCalledWith({
          name: "my-command",
          lockEntry: expect.any(Object),
        });
      }),
    );

    it.effect("swallows Workspace.setCommand failure without failing installation", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        const setCommandFn = vi.fn(() =>
          Effect.fail(
            makeCliError({
              code: "SETTINGS_WRITE_FAILED",
              what: "write failed",
              cause: new Error("write failed"),
            }),
          ),
        );

        const result = yield* installCommand(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(withServices(axmDir, { setCommandFn })));

        expect(result.result).toBe("success");
      }),
    );

    it.effect("accepts exact registry resolvedVersion for lockfile persistence", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        const setCommandFn = vi.fn((_args: { name: string; lockEntry: unknown }) => Effect.void);

        const result = yield* installCommand(
          makeOp({ ref: makeRegistryRef({ integrity: "", version: "1.2.3" }) }),
        ).pipe(Effect.provide(withServices(axmDir, { setCommandFn })));

        expect(result.result).toBe("success");
        expect(setCommandFn).toHaveBeenCalledOnce();
        expect(setCommandFn).toHaveBeenCalledWith({
          name: "my-command",
          lockEntry: expect.objectContaining({ resolvedVersion: "1.2.3" }),
        });
      }),
    );

    it.effect("fails when registry resolvedVersion is a range", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        const setCommandFn = vi.fn((_args: { name: string; lockEntry: unknown }) => Effect.void);

        const result = yield* installCommand(
          makeOp({ ref: makeRegistryRef({ integrity: "", version: "^1.0.0" }) }),
        ).pipe(
          Effect.provide(withServices(axmDir, { setCommandFn })),
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, error: e })),
        );

        expect(result.result).toBe("error");
        expect(setCommandFn).not.toHaveBeenCalled();
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

        const result = yield* installCommand(makeOp({ ref })).pipe(
          Effect.provide(withServices(axmDir)),
          Effect.catchAll((e) => Effect.succeed({ result: "error" as const, message: e.what })),
        );

        expect(result.result).toBe("error");
        expect(result.message).toContain("Integrity mismatch");
      }),
    );
  });
});
