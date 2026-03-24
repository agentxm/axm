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
import { makeOutputTestLayer } from "../../../output/index.js";
import type { McpServerLockEntry } from "../../../lockfile/index.js";
import { makeAppError } from "../../../app-error/index.js";
import { Workspace, type WorkspaceContextService } from "../../../workspace/service.js";
import { taxonomyStubs } from "../../../workspace/test-stubs.js";
import type { UninstallMcpServerOperation } from "./uninstall.js";
import { uninstallMcpServer } from "./uninstall.js";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const makeWorkspaceMock = (
  axmDir: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper uses simplified mock data
  lockfileMcpServers: Record<string, any> = {},
  overrides?: {
    removeMcpServerFn?: ReturnType<typeof vi.fn>;
  },
): WorkspaceContextService => {
  let mcpServers = { ...lockfileMcpServers };

  const writeToDisk = () => {
    const lockfile = { lockfileVersion: 1, mcpServers: {} as Record<string, unknown> };
    for (const [k, v] of Object.entries(mcpServers)) {
      lockfile.mcpServers[k] = {
        ...(v as Record<string, unknown>),
        installedAt:
          (v as { installedAt: Date }).installedAt instanceof Date
            ? (v as { installedAt: Date }).installedAt.toISOString()
            : (v as { installedAt: string }).installedAt,
        updatedAt:
          (v as { updatedAt: Date }).updatedAt instanceof Date
            ? (v as { updatedAt: Date }).updatedAt.toISOString()
            : (v as { updatedAt: string }).updatedAt,
      };
    }
    fs.writeFileSync(path.join(axmDir, "axm-lock.yaml"), YAML.stringify(lockfile));
  };

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
    getLockedMcpServers: () => Effect.succeed(mcpServers),
    getLockedMcpServer: (name: string) =>
      Effect.succeed(Option.fromUndefinedOr(mcpServers[name] as McpServerLockEntry | undefined)),
    setMcpServer: () => Effect.void,
    setMcpServerLock: () => Effect.void,
    removeMcpServer: overrides?.removeMcpServerFn
      ? (name: string) => overrides.removeMcpServerFn!(name)
      : (name: string) =>
          Effect.sync(() => {
            const { [name]: _, ...rest } = mcpServers;
            void _;
            mcpServers = rest;
            writeToDisk();
          }),
    getConfiguredCommands: () => Effect.succeed({}),
    getConfiguredMcpServers: () => Effect.succeed({}),
    removeSkillLock: () => Effect.void,
    removeCommandSettings: () => Effect.void,
    removeCommandLock: () => Effect.void,
    removeMcpServerSettings: () => Effect.void,
    removeMcpServerLock: () => Effect.void,
    removePackSettings: () => Effect.void,
    removePackLock: () => Effect.void,
    isExtensionRequiredByInstalledPack: () => Effect.succeed(false),
    markDependencyRetainedInLockfile: () => Effect.void,
  };
};

const withServices = (
  axmDir: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper uses simplified mock data
  lockfileMcpServers: Record<string, any> = {},
  wsOverrides?: {
    removeMcpServerFn?: ReturnType<typeof vi.fn>;
  },
) =>
  Layer.mergeAll(
    NodeServices.layer,
    Workspace.layer(makeWorkspaceMock(axmDir, lockfileMcpServers, wsOverrides)),
    makeOutputTestLayer()[0],
  );

const makeOp = (
  overrides: { serverName?: string; strictAgentSync?: boolean } = {},
): UninstallMcpServerOperation => ({
  name: "uninstall-mcp-server",
  args: {
    serverName: overrides.serverName ?? "my-server",
    strictAgentSync: Option.fromUndefinedOr(overrides.strictAgentSync),
  },
});

const makeRegistryLockEntry = (name = "my-server") => ({
  type: "registry" as const,
  profile: "@community",
  name,
  resolvedVersion: "1.0.0",
  integrity: "sha512-AAAA==",
  sourceName: "default",
  installedAt: new Date(),
  updatedAt: new Date(),
});

const makeRegistryLockEntryYaml = (name = "my-server") => ({
  type: "registry",
  profile: "@community",
  name,
  resolvedVersion: "1.0.0",
  integrity: "sha512-AAAA==",
  sourceName: "default",
  installedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const writeLockfileYaml = (
  axmDir: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper uses simplified mock data
  mcpServers: Record<string, any>,
) => {
  const lockfile = { lockfileVersion: 1, mcpServers };
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
      profile?: string;
    } = {},
  ) => {
    const serverName = opts.serverName ?? "my-server";
    const profile = opts.profile ?? "@community";
    const base = path.join(tmpDir, "project");
    const axmDir = path.join(base, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });

    const canonicalPath = path.join(base, ".axm", "extensions", profile, "mcp-servers", serverName);
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
        expect(result.message).toContain("Uninstalled my-server");
        expect(fs.existsSync(canonicalPath)).toBe(false);
      }),
    );

    it.effect("calls Workspace.removeMcpServer", () =>
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
    it.effect("returns no-op when not in lockfile and no files on disk", () =>
      Effect.gen(function* () {
        const base = path.join(tmpDir, "project");
        const axmDir = path.join(base, ".axm");
        fs.mkdirSync(axmDir, { recursive: true });
        writeLockfileYaml(axmDir, {});

        const result = yield* uninstallMcpServer(makeOp()).pipe(
          Effect.provide(withServices(axmDir, {})),
        );

        expect(result.result).toBe("no-op");
        expect(result.message).toBe("not installed");
      }),
    );
  });

  describe("canonical directory already missing", () => {
    it.effect("still removes lockfile entry when canonical dir is missing", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace({ createCanonical: false });
        const removeMcpServerFn = vi.fn((_name: string) => Effect.void);

        const result = yield* uninstallMcpServer(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers, { removeMcpServerFn })),
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("Uninstalled my-server");
        expect(removeMcpServerFn).toHaveBeenCalledOnce();
      }),
    );
  });

  describe("settings removal failure", () => {
    it.effect("swallows removeMcpServer failure (warning, not error)", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace();
        const removeMcpServerFn = vi.fn(() =>
          Effect.fail(
            makeAppError({
              code: "SETTINGS_WRITE_FAILED",
              what: "write failed",
              cause: new Error("write failed"),
            }),
          ),
        );

        const result = yield* uninstallMcpServer(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers, { removeMcpServerFn })),
        );

        expect(result.result).toBe("success");
      }),
    );
  });

  describe("agent sync policy", () => {
    const stubAgent = (
      id: CodingAgent["id"],
      outcome: ReturnType<CodingAgent["removeMcpServer"]>,
    ): CodingAgent => ({
      id,
      resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "supported", dir: "/tmp" }),
      addMcpServer: () => Effect.succeed({ _tag: "success" }),
      removeMcpServer: () => outcome,
    });

    it.effect("fails in strict mode when unknown configured agents exist", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace();

        vi.spyOn(DefaultCodingAgentRepository, "getUnknownConfiguredAgentIds").mockReturnValue(
          Effect.succeed(["unknown-agent"]),
        );
        vi.spyOn(DefaultCodingAgentRepository, "getConfiguredAgents").mockReturnValue(
          Effect.succeed([]),
        );

        const result = yield* uninstallMcpServer(makeOp({ strictAgentSync: true })).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers)),
          Effect.catch((error) => Effect.succeed({ result: "error" as const, error })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("CODING_AGENT_UNKNOWN_CONFIGURED");
        }
      }),
    );

    it.effect("returns degraded sync status when an agent remove fails in best-effort mode", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace();

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

        const result = yield* uninstallMcpServer(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers)),
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("agent-sync=degraded");
      }),
    );

    it.effect("fails in strict mode when an agent remove fails", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace();

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

        const result = yield* uninstallMcpServer(makeOp({ strictAgentSync: true })).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers)),
          Effect.catch((error) => Effect.succeed({ result: "error" as const, error })),
        );

        expect(result.result).toBe("error");
        if (result.result === "error") {
          expect(result.error.code).toBe("MCP_SERVER_AGENT_SYNC_FAILED");
        }
      }),
    );

    it.effect("keeps green sync when agent remove is unsupported in best-effort mode", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace();

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

        const result = yield* uninstallMcpServer(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers)),
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("canonical=success");
        expect(result.message).toContain("agent-sync=green");
      }),
    );

    it.effect("keeps green sync when required agent is disabled in best-effort mode", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace();

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

        const result = yield* uninstallMcpServer(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers)),
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("agent-sync=green");
      }),
    );

    it.effect("fails in strict mode when required support-set agent is disabled", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace();

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

        const result = yield* uninstallMcpServer(makeOp({ strictAgentSync: true })).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers)),
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
        const { axmDir, lockfileMcpServers } = setupWorkspace();

        vi.spyOn(DefaultCodingAgentRepository, "getUnknownConfiguredAgentIds").mockReturnValue(
          Effect.succeed([]),
        );
        vi.spyOn(DefaultCodingAgentRepository, "getConfiguredAgents").mockReturnValue(
          Effect.succeed([
            stubAgent("adal", Effect.succeed({ _tag: "disabled", reason: "disabled by config" })),
          ]),
        );

        const result = yield* uninstallMcpServer(makeOp({ strictAgentSync: true })).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers)),
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("agent-sync=green");
      }),
    );

    it.effect("fails when an agent remove is misconfigured", () =>
      Effect.gen(function* () {
        const { axmDir, lockfileMcpServers } = setupWorkspace();

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

        const result = yield* uninstallMcpServer(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers)),
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
        const { axmDir, lockfileMcpServers } = setupWorkspace();

        vi.spyOn(DefaultCodingAgentRepository, "getUnknownConfiguredAgentIds").mockReturnValue(
          Effect.succeed(["unknown-agent"]),
        );
        vi.spyOn(DefaultCodingAgentRepository, "getConfiguredAgents").mockReturnValue(
          Effect.succeed([]),
        );

        const result = yield* uninstallMcpServer(makeOp()).pipe(
          Effect.provide(withServices(axmDir, lockfileMcpServers)),
        );

        expect(result.result).toBe("success");
        expect(result.message).toContain("agent-sync=green");
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

          const chromeAgent: CodingAgent = {
            id: "claude-code",
            resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "supported", dir: "/tmp" }),
            addMcpServer: () => Effect.succeed({ _tag: "success" }),
            removeMcpServer: removeSpy,
          };

          vi.spyOn(DefaultCodingAgentRepository, "getUnknownConfiguredAgentIds").mockReturnValue(
            Effect.succeed([]),
          );
          vi.spyOn(DefaultCodingAgentRepository, "getConfiguredAgents").mockReturnValue(
            Effect.succeed([chromeAgent]),
          );

          const result = yield* uninstallMcpServer(
            makeOp({ serverName: "chrome-devtools-mcp" }),
          ).pipe(Effect.provide(withServices(axmDir, lockfileMcpServers)));

          expect(result.result).toBe("success");
          expect(result.message).toContain("Uninstalled chrome-devtools-mcp");
          expect(result.message).toContain("agent-sync=green");
          expect(removeSpy).toHaveBeenCalledOnce();
          expect(removeSpy).toHaveBeenCalledWith({
            workspaceRoot: path.join(tmpDir, "project"),
            serverName: "chrome-devtools-mcp",
          });
        }),
    );
  });
});
