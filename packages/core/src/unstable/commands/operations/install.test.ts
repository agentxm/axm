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
import { TestRenderer, logsByTag } from "../../cli-renderer/index.js";
import { makeAppError, type AppError } from "../../app-error/index.js";
import type { ExtensionRef } from "../../extensions/index.js";
import type { CommandExtensionRef, RegistryCommandRef } from "../refs.js";
import { SourceHostProviders } from "../../source-resolution/index.js";
import type { SourceHostProvidersService } from "../../source-resolution/index.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import { expectRecord, exactVersion, extensionName, handle } from "../../test-helpers.js";
import { CodingAgentRepository } from "../../agents/index.js";
import type { CodingAgent } from "../../agents/coding-agent.js";
import type { InstallCommandOperation } from "./install.js";
import { installCommand } from "./install.js";
import { makeStubAgent, makeAgentRepoMock, makeWorkspaceMock } from "./test-helpers.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeInstallWorkspaceMock = (
  axmDir: string,
  wsOverrides?: {
    setCommandFn?: (args: { name: string; lockEntry: unknown }) => Effect.Effect<void, AppError>;
  },
) => {
  const readLf = () => {
    const lfPath = path.join(axmDir, "axm-lock.yaml");
    if (!fs.existsSync(lfPath)) return { lockfileVersion: 1, commands: {} };
    return YAML.parse(fs.readFileSync(lfPath, "utf-8"));
  };
  const writeLf = (data: unknown) => {
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(data));
  };

  const setCommandFn = wsOverrides?.setCommandFn;

  const setCommandImpl = setCommandFn
    ? (args: { name: string; lockEntry: unknown }) => setCommandFn(args)
    : (args: { name: string; lockEntry: unknown }) =>
        Effect.try({
          try: () => {
            const lf = readLf();
            if (!lf.commands) lf.commands = {};
            lf.commands[args.name] = {
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
        });

  return makeWorkspaceMock(axmDir, {
    getConfiguredAgents: () => Effect.succeed([]),
    getLockedCommands: () => Effect.succeed(readLf().commands ?? {}),
    getLockedCommand: (name: string) =>
      Effect.succeed(Option.fromUndefinedOr(readLf().commands?.[name])),
    setCommand: setCommandImpl,
    setCommandLock: setCommandImpl,
  });
};

const withServices = (
  axmDir: string,
  wsOverrides?: {
    setCommandFn?: (args: { name: string; lockEntry: unknown }) => Effect.Effect<void, AppError>;
  },
  agents?: ReadonlyArray<CodingAgent>,
) => makeServices(axmDir, wsOverrides, agents).layer;

const makeServices = (
  axmDir: string,
  wsOverrides?: {
    setCommandFn?: (args: { name: string; lockEntry: unknown }) => Effect.Effect<void, AppError>;
  },
  agents?: ReadonlyArray<CodingAgent>,
) => {
  const mockWs = makeInstallWorkspaceMock(axmDir, wsOverrides);
  const renderer = TestRenderer.make();
  const sourceProviders: SourceHostProvidersService = {
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
      NodeServices.layer,
      WorkspaceMutations.layer(mockWs),
      renderer.layer,
      Layer.succeed(SourceHostProviders, sourceProviders),
      Layer.succeed(CodingAgentRepository, makeAgentRepoMock(agents ?? [])),
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
): RegistryCommandRef => {
  const name = overrides.name ?? "my-command";

  return {
    type: "command",
    refType: "registry",
    source: {
      type: "registry",
      location: new URL(overrides.location ?? "file:///tmp/reg"),
      owner: Option.none(),
    },
    command: { name: extensionName(name) },
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
): RegistryCommandRef => {
  const name = overrides.name ?? "my-command";

  return {
    type: "command",
    refType: "registry",
    source: {
      type: "registry",
      location: new URL(overrides.location ?? "file:///tmp/reg"),
      owner: Option.none(),
    },
    command: { name: extensionName(name) },
    // Assertion needed: these tests intentionally construct invalid refs to hit runtime guards.
    owner: (overrides.owner ?? "@community") as unknown as RegistryCommandRef["owner"],
    // Assertion needed: these tests intentionally construct invalid refs to hit runtime guards.
    name: name as unknown as RegistryCommandRef["name"],
    // Assertion needed: these tests intentionally construct invalid refs to hit runtime guards.
    version: (overrides.version ?? "1.0.0") as unknown as RegistryCommandRef["version"],
    integrity: Option.fromUndefinedOr(overrides.integrity || undefined),
    packages: [],
  };
};

const makeOp = (
  overrides: {
    ref?: CommandExtensionRef;
    force?: boolean;
    versionRange?: Option.Option<string>;
    skipSettings?: boolean;
  } = {},
): InstallCommandOperation => ({
  name: "install-command",
  args: {
    ref: overrides.ref ?? makeRegistryRef(),
    force: overrides.force ?? false,
    versionRange: overrides.versionRange ?? Option.none(),
    skipSettings: Option.fromUndefinedOr(overrides.skipSettings),
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

  const setupRegistryCanonical = (base: string, owner: string, name = "my-command") => {
    const canonicalPath = path.join(base, ".axm", "extensions", owner, "commands", name);
    fs.mkdirSync(canonicalPath, { recursive: true });
    fs.writeFileSync(
      path.join(canonicalPath, "command.json"),
      JSON.stringify({ name, version: "1.0.0", type: "command", owner }),
    );
    return canonicalPath;
  };

  /** Creates a local registry with index.json and a zip archive for a command. */
  const setupLocalRegistry = (opts: { owner?: string; name?: string; version?: string } = {}) => {
    const owner = opts.owner ?? "@community";
    const name = opts.name ?? "my-command";
    const version = opts.version ?? "1.0.0";
    const registryRoot = path.join(tmpDir, "local-registry");
    const extDir = path.join(registryRoot, "extensions", owner, "commands", name);
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
        expect(fs.existsSync(path.join(canonicalPath, "command.json"))).toBe(true);
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
    it.effect("calls WorkspaceMutations.setCommand after successful installation", () =>
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

    it.effect("lock entry includes agents and sourceHash", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        const setCommandFn = vi.fn((_args: { name: string; lockEntry: unknown }) => Effect.void);

        yield* installCommand(makeOp({ ref: makeRegistryRef({ integrity: "" }) })).pipe(
          Effect.provide(withServices(axmDir, { setCommandFn })),
        );

        const lockEntry = expectRecord(setCommandFn.mock.calls[0]?.[0]?.lockEntry);
        expect(lockEntry["agents"]).toEqual(expect.any(Array));
        expect(lockEntry["sourceHash"]).toEqual(expect.any(String));
      }),
    );

    it.effect("returns error when WorkspaceMutations.setCommand fails", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        setupRegistryCanonical(base, "@community");
        const setCommandFn = vi.fn(() =>
          Effect.fail(
            makeAppError({
              code: "internal",
              detail: "write failed",
              cause: new Error("write failed"),
            }),
          ),
        );
        const services = makeServices(axmDir, { setCommandFn });

        const result = yield* installCommand(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(services.layer));

        expect(result.result).toBe("error");
        expect(logsByTag(services.rendererState).warn).toEqual([]);
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
          makeOp({ ref: makeUnsafeRegistryRef({ integrity: "", version: "^1.0.0" }) }),
        ).pipe(
          Effect.provide(withServices(axmDir, { setCommandFn })),
          Effect.catch((e) => Effect.succeed({ result: "error" as const, error: e })),
        );

        expect(result.result).toBe("error");
        expect(setCommandFn).not.toHaveBeenCalled();
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

        const result = yield* installCommand(makeOp({ ref })).pipe(
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

        const result = yield* installCommand(makeOp({ ref })).pipe(
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

  describe("agent rendering", () => {
    it.effect("renders to configured agents and includes renderedFiles in lockfile", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const canonicalPath = setupRegistryCanonical(base, "@community");
        // Add the command content file
        fs.writeFileSync(
          path.join(canonicalPath, "my-command.md"),
          "---\ndescription: test command\n---\nHello world",
        );

        const setCommandFn = vi.fn((_args: { name: string; lockEntry: unknown }) => Effect.void);
        const agents = [makeStubAgent("claude-code")];

        const result = yield* installCommand(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(withServices(axmDir, { setCommandFn }, agents)));

        expect(result.result).toBe("success");
        if (result.result === "success") {
          expect(result.artifact).toEqual({
            path: ".claude-code/commands/my-command.md",
            scope: "project",
            agents: ["claude-code"],
            version: "1.0.0",
            change: "created",
            fileCount: 1,
            targets: [
              {
                path: ".claude-code/commands/my-command.md",
                change: "created",
                agentIds: ["claude-code"],
              },
            ],
          });
        }
        expect(setCommandFn).toHaveBeenCalledOnce();
        const lockEntry = expectRecord(setCommandFn.mock.calls[0]?.[0]?.lockEntry);
        expect(lockEntry["agents"]).toEqual(["claude-code"]);
        expect(lockEntry["renderedFiles"]).toBeDefined();
        expect(lockEntry["sourceHash"]).toBeDefined();
      }),
    );

    it.effect("reports unchanged artifact when the command is already installed", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const canonicalPath = setupRegistryCanonical(base, "@community");
        fs.writeFileSync(path.join(canonicalPath, "my-command.md"), "Hello world");
        const agents = [makeStubAgent("claude-code")];
        const layer = withServices(axmDir, undefined, agents);

        yield* installCommand(makeOp({ ref: makeRegistryRef({ integrity: "" }) })).pipe(
          Effect.provide(layer),
        );
        const lockfilePath = path.join(axmDir, "axm-lock.yaml");
        const lockfileBefore = fs.readFileSync(lockfilePath, "utf-8");
        const result = yield* installCommand(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(layer));
        const lockfileAfter = fs.readFileSync(lockfilePath, "utf-8");

        expect(result.result).toBe("success");
        if (result.result === "success") {
          expect(result.artifact?.change).toBe("unchanged");
          expect(result.artifact?.targets?.[0]?.change).toBe("unchanged");
        }
        expect(lockfileAfter).toBe(lockfileBefore);
      }),
    );

    it.effect("renders to all configured agents when manifest has residual agents field", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const canonicalPath = setupRegistryCanonical(base, "@community");
        fs.writeFileSync(path.join(canonicalPath, "my-command.md"), "Hello world");
        fs.writeFileSync(
          path.join(canonicalPath, "command.json"),
          JSON.stringify({
            name: "my-command",
            version: "1.0.0",
            type: "command",
            owner: "@community",
            agents: ["codex"],
          }),
        );

        const setCommandFn = vi.fn((_args: { name: string; lockEntry: unknown }) => Effect.void);
        const agents = [makeStubAgent("claude-code"), makeStubAgent("codex")];

        yield* installCommand(makeOp({ ref: makeRegistryRef({ integrity: "" }) })).pipe(
          Effect.provide(withServices(axmDir, { setCommandFn }, agents)),
        );

        const lockEntry = expectRecord(setCommandFn.mock.calls[0]?.[0]?.lockEntry);
        expect(lockEntry["agents"]).toEqual(["claude-code", "codex"]);
      }),
    );

    it.effect("returns rendering warnings in the operation result without raw warning logs", () =>
      Effect.gen(function* () {
        const { axmDir, base } = setupBase();
        const canonicalPath = setupRegistryCanonical(base, "@community");
        fs.writeFileSync(path.join(canonicalPath, "my-command.md"), "Hello world");
        const warningAgent: CodingAgent = {
          ...makeStubAgent("claude-code"),
          addCommand: ({ workspaceRoot, commandName }) =>
            Effect.succeed({
              _tag: "success",
              renderedFilePath: path.join(
                workspaceRoot,
                ".claude-code",
                "commands",
                `${commandName}.md`,
              ),
              warnings: ["frontmatter - unsupported field omitted"],
            }),
        };
        const services = makeServices(axmDir, undefined, [warningAgent]);

        const result = yield* installCommand(
          makeOp({ ref: makeRegistryRef({ integrity: "" }) }),
        ).pipe(Effect.provide(services.layer));

        expect(result).toMatchObject({
          result: "success",
          message: expect.stringContaining(
            "Rendering warnings: claude-code: frontmatter - unsupported field omitted",
          ),
        });
        expect(logsByTag(services.rendererState).warn).toEqual([]);
      }),
    );
  });
});
