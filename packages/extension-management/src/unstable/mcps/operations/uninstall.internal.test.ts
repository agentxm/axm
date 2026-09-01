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
import type { McpServerLockEntry } from "../../lockfile/index.js";
import { makeAppError, type AppError } from "../../app-error/index.js";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "../../workspace/service-interface.js";
import {
  makeBaseWorkspaceMock,
  makeRegistryMcpServerLockEntry,
} from "../../workspace/test-stubs.js";
import { handle, makeCodingAgentStub } from "../../test-helpers.js";
import type { UninstallMcpServerOperation } from "./uninstall.js";
import { uninstallMcpServer } from "./uninstall.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeWorkspaceMock = (
  axmDir: string,
  lockfileMcpServers: Record<string, McpServerLockEntry> = {},
  overrides?: {
    removeMcpServerFn?: (name: string) => Effect.Effect<void, AppError>;
  },
): WorkspaceMutationsService => {
  let mcpServers: Record<string, McpServerLockEntry> = { ...lockfileMcpServers };
  const removeMcpServerFn = overrides?.removeMcpServerFn;

  const writeToDisk = () => {
    const lockfile: { lockfileVersion: number; mcpServers: Record<string, unknown> } = {
      lockfileVersion: 4,
      mcpServers: {},
    };
    for (const [k, v] of Object.entries(mcpServers)) {
      lockfile.mcpServers[k] = v;
    }
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));
  };

  return makeBaseWorkspaceMock(axmDir, {
    getConfiguredAgents: () => Effect.succeed([]),
    getLockedMcpServers: () => Effect.succeed(mcpServers),
    getLockedMcpServer: (name: string) => Effect.succeed(Option.fromUndefinedOr(mcpServers[name])),
    removeMcpServer:
      removeMcpServerFn !== undefined
        ? (name: string) => removeMcpServerFn(name)
        : (name: string) =>
            Effect.sync(() => {
              const { [name]: _, ...rest } = mcpServers;
              void _;
              mcpServers = rest;
              writeToDisk();
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
  lockfileMcpServers: Record<string, McpServerLockEntry> = {},
  wsOverrides?: {
    removeMcpServerFn?: (name: string) => Effect.Effect<void, AppError>;
  },
  agentRepo?: CodingAgentRepositoryService,
) => makeServices(axmDir, lockfileMcpServers, wsOverrides, agentRepo).layer;

const makeServices = (
  axmDir: string,
  lockfileMcpServers: Record<string, McpServerLockEntry> = {},
  wsOverrides?: {
    removeMcpServerFn?: (name: string) => Effect.Effect<void, AppError>;
  },
  agentRepo?: CodingAgentRepositoryService,
) => {
  const renderer = TestRenderer.make();

  return {
    layer: Layer.mergeAll(
      NodeServices.layer,
      WorkspaceMutations.layer(makeWorkspaceMock(axmDir, lockfileMcpServers, wsOverrides)),
      renderer.layer,
      Layer.succeed(CodingAgentRepository, agentRepo ?? defaultAgentRepo),
    ),
    rendererState: renderer.state,
  };
};

const makeOp = (
  overrides: { serverName?: string; strictAgentSync?: boolean } = {},
): UninstallMcpServerOperation => ({
  name: "uninstall-mcp-server",
  args: {
    serverName: overrides.serverName ?? "my-server",
    strictAgentSync: Option.fromUndefinedOr(overrides.strictAgentSync),
  },
});

const makeRegistryLockEntry = (name = "my-server"): McpServerLockEntry =>
  makeRegistryMcpServerLockEntry({
    owner: handle("@community"),
    name,
  });

const makeRegistryLockEntryYaml = (name = "my-server") => ({
  type: "registry",
  owner: "@community",
  name,
  resolvedVersion: "1.0.0",
  integrity: "sha512-AAAA==",
  sourceName: "agentxm",

  publisherBindingId: "hbnd_test",
});

const writeLockfileYaml = (axmDir: string, mcpServers: Record<string, unknown>) => {
  const lockfile = { lockfileVersion: 4, mcpServers };
  fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("uninstallMcpServer", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "uninstall-mcp-server-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const setupWorkspace = (
    opts: {
      serverName?: string;
      createCanonical?: boolean;
      owner?: string;
    } = {},
  ) => {
    const serverName = opts.serverName ?? "my-server";
    const owner = opts.owner ?? "@community";
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });

    const canonicalPath = path.join(base, "agent_extensions", "agentxm", owner, "mcps", serverName);
    if (opts.createCanonical !== false) {
      fs.mkdirSync(canonicalPath, { recursive: true });
      fs.writeFileSync(path.join(canonicalPath, "server.js"), "module.exports = {}");
    }

    const lockfileMcpServers = { [serverName]: makeRegistryLockEntry(serverName) };
    writeLockfileYaml(axmDir, { [serverName]: makeRegistryLockEntryYaml(serverName) });

    return { base, axmDir, canonicalPath, lockfileMcpServers };
  };

  describe("full uninstall — lockfile entry exists", () => {
    it.effect("removes canonical dir and lockfile entry", () =>
      Effect.gen(function* () {
        const { axmDir, canonicalPath, lockfileMcpServers } = setupWorkspace();

        const result = yield* uninstallMcpServer(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers)),
        );

        expect(result.result).toBe("success");
        if (result.result !== "success") {
          throw new Error("Expected successful uninstall result");
        }
        expect(result.message).toContain("Uninstalled my-server");
        expect(result.artifact).toMatchObject({
          path: "axm.json / axm-lock.yaml",
          scope: "project",
          change: "removed",
          targets: [{ path: "axm.json", change: "removed" }],
        });
        expect(fs.existsSync(canonicalPath)).toBe(false);
      }),
    );

    it.effect("calls WorkspaceMutations.removeMcpServer", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace();
        const removeMcpServerFn = vi.fn((_name: string) => Effect.void);

        const result = yield* uninstallMcpServer(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers, { removeMcpServerFn })),
        );

        expect(result.result).toBe("success");
        expect(removeMcpServerFn).toHaveBeenCalledOnce();
        expect(removeMcpServerFn).toHaveBeenCalledWith("my-server");
      }),
    );
  });

  describe("server not installed", () => {
    it.effect(
      "returns success with not-installed message when not in lockfile and no files on disk",
      () =>
        Effect.gen(function* () {
          const base = path.join(tmpDir, "project");
          const axmDir = path.join(base, ".axm");
          fs.mkdirSync(axmDir, { recursive: true });
          writeLockfileYaml(axmDir, {});

          const result = yield* uninstallMcpServer(makeOp()).pipe(
            Effect.provide(withServices(axmDir, {})),
          );

          expect(result.result).toBe("success");
          expect(result.message).toBe("not installed");
        }),
    );
  });

  describe("canonical directory already missing", () => {
    it.effect("ignores a stale receipt when canonical content is missing", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace({ createCanonical: false });
        const removeMcpServerFn = vi.fn((_name: string) => Effect.void);

        const result = yield* uninstallMcpServer(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers, { removeMcpServerFn })),
        );

        expect(result.result).toBe("success");
        expect(result.message).toBe("not installed");
        expect(removeMcpServerFn).not.toHaveBeenCalled();
      }),
    );
  });

  describe("settings removal failure", () => {
    it.effect("returns removeMcpServer failure in result without raw warning", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace();
        const removeMcpServerFn = vi.fn(() =>
          Effect.fail(
            makeAppError({
              code: "internal",
              detail: "write failed",
              cause: new Error("write failed"),
            }),
          ),
        );
        const services = makeServices(axmDir, lockfileMcpServers, { removeMcpServerFn });

        const result = yield* uninstallMcpServer(makeOp()).pipe(Effect.provide(services.layer));

        expect(result.result).toBe("success");
        expect(result.message).toContain("MCP server removal from settings failed");
        expect(result.message).toContain("write failed");
        expect(logsByTag(services.rendererState).warn).toEqual([]);
      }),
    );
  });

  describe("agent sync policy", () => {
    const stubAgent = (
      id: CodingAgent["id"],
      outcome: ReturnType<CodingAgent["removeMcpServer"]>,
    ): CodingAgent =>
      makeCodingAgentStub(id, {
        resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "supported", dir: "/tmp" }),
        addMcpServer: () => Effect.succeed({ _tag: "success" }),
        removeMcpServer: () => outcome,
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
        const { axmDir, lockfileMcpServers } = setupWorkspace();

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed(["unknown-agent"]));
        getConfiguredAgentsMock.mockReturnValue(Effect.succeed([]));

        const result = yield* uninstallMcpServer(makeOp({ strictAgentSync: true })).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers, undefined, mockAgentRepo)),
          Effect.catch((error) => Effect.succeed({ result: "error" as const, error })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.category).toBe("not_found");
        }
      }),
    );

    it.effect("returns degraded sync status when an agent remove fails in best-effort mode", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace();

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(
          Effect.succeed([
            stubAgent(
              "claude-code",
              Effect.succeed({ _tag: "failed", reason: "agent command failed" }),
            ),
          ]),
        );

        const result = yield* uninstallMcpServer(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers, undefined, mockAgentRepo)),
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("agent-sync=degraded");
      }),
    );

    it.effect("fails in strict mode when an agent remove fails", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace();

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(
          Effect.succeed([
            stubAgent(
              "claude-code",
              Effect.succeed({ _tag: "failed", reason: "agent command failed" }),
            ),
          ]),
        );

        const result = yield* uninstallMcpServer(makeOp({ strictAgentSync: true })).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers, undefined, mockAgentRepo)),
          Effect.catch((error) => Effect.succeed({ result: "error" as const, error })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.category).toBe("internal");
        }
      }),
    );

    it.effect("keeps green sync when agent remove is unsupported in best-effort mode", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace();

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(
          Effect.succeed([
            stubAgent(
              "claude-code",
              Effect.succeed({ _tag: "unsupported", reason: "not supported by agent" }),
            ),
          ]),
        );

        const result = yield* uninstallMcpServer(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers, undefined, mockAgentRepo)),
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("canonical=success");
        expect(result.message).toContain("agent-sync=green");
      }),
    );

    it.effect("keeps green sync when required agent is disabled in best-effort mode", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace();

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(
          Effect.succeed([
            stubAgent(
              "claude-code",
              Effect.succeed({ _tag: "disabled", reason: "disabled by config" }),
            ),
          ]),
        );

        const result = yield* uninstallMcpServer(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers, undefined, mockAgentRepo)),
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("agent-sync=green");
      }),
    );

    it.effect("fails in strict mode when required support-set agent is disabled", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace();

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(
          Effect.succeed([
            stubAgent(
              "claude-code",
              Effect.succeed({ _tag: "disabled", reason: "disabled by config" }),
            ),
          ]),
        );

        const result = yield* uninstallMcpServer(makeOp({ strictAgentSync: true })).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers, undefined, mockAgentRepo)),
          Effect.catch((error) => Effect.succeed({ result: "error" as const, error })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.category).toBe("internal");
        }
      }),
    );

    it.effect("does not fail strict mode when non-required agent is disabled", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace();

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(
          Effect.succeed([
            stubAgent("adal", Effect.succeed({ _tag: "disabled", reason: "disabled by config" })),
          ]),
        );

        const result = yield* uninstallMcpServer(makeOp({ strictAgentSync: true })).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers, undefined, mockAgentRepo)),
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("agent-sync=green");
      }),
    );

    it.effect("fails when an agent remove is misconfigured", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace();

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
        getConfiguredAgentsMock.mockReturnValue(
          Effect.succeed([
            stubAgent(
              "claude-code",
              Effect.succeed({ _tag: "misconfigured", reason: "invalid MCP config path" }),
            ),
          ]),
        );

        const result = yield* uninstallMcpServer(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers, undefined, mockAgentRepo)),
          Effect.catch((error) => Effect.succeed({ result: "error" as const, error })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.category).toBe("internal");
        }
      }),
    );

    it.effect("keeps best-effort success when unknown configured agents exist", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace();

        getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed(["unknown-agent"]));
        getConfiguredAgentsMock.mockReturnValue(Effect.succeed([]));

        const services = makeServices(axmDir, lockfileMcpServers, undefined, mockAgentRepo);

        const result = yield* uninstallMcpServer(makeOp()).pipe(Effect.provide(services.layer));

        expect(result.result).toBe("success");
        expect(result.message).toContain("agent-sync=green");
        expect(result.message).toContain("Skipping unknown configured agents: unknown-agent");
        expect(logsByTag(services.rendererState).warn).toEqual([]);
      }),
    );

    it.effect(
      "syncs chrome-devtools-mcp uninstall args to configured agents with deterministic mocks",
      () =>
        Effect.gen(function* () {
          const { axmDir, lockfileMcpServers } = setupWorkspace({
            serverName: "chrome-devtools-mcp",
          });
          const removeSpy = vi.fn(() => Effect.succeed({ _tag: "success" as const }));

          const chromeAgent: CodingAgent = makeCodingAgentStub("claude-code", {
            resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "supported", dir: "/tmp" }),
            addMcpServer: () => Effect.succeed({ _tag: "success" }),
            removeMcpServer: removeSpy,
          });

          getUnknownConfiguredAgentIdsMock.mockReturnValue(Effect.succeed([]));
          getConfiguredAgentsMock.mockReturnValue(Effect.succeed([chromeAgent]));

          const result = yield* uninstallMcpServer(
            makeOp({ serverName: "chrome-devtools-mcp" }),
          ).pipe(
            Effect.provide(withServices(axmDir, lockfileMcpServers, undefined, mockAgentRepo)),
          );

          expect(result.result).toBe("success");
          expect(result.message).toContain("Uninstalled chrome-devtools-mcp");
          expect(result.message).toContain("agent-sync=green");
          expect(removeSpy).toHaveBeenCalledOnce();
          expect(removeSpy).toHaveBeenCalledWith({
            workspaceRoot: path.join(tmpDir, "project"),
            scope: "project",
            serverName: "chrome-devtools-mcp",
          });
        }),
    );
  });
});
