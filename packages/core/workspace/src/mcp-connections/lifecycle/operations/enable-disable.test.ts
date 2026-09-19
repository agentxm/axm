import * as fs from "node:fs";
import { NativeWriteAuthorityPermissive } from "../../../projection/agent-adapters/testing.js";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach, vi } from "vitest";
import {
  CodingAgentRepository,
  type CodingAgentRepositoryService,
} from "../../../projection/index.js";
import type { CodingAgent } from "../../../projection/agent-adapters/index.js";
import type { McpServerLockEntry } from "../../../desired-state/index.js";
import type { McpServerEntry } from "../../../desired-state/index.js";
import {
  TestStepFailureConversion,
  computeMaterializedTreeIntegritySync,
  handle,
  makeCodingAgentStub,
} from "../../../lifecycle/test-helpers.js";
import { SettingsWriter } from "../../../desired-state/index.js";
import {
  makeRegistryMcpServerLockEntry,
  MockWorkspaceTransactionScope,
  WorkspaceReadTest,
  type WorkspaceReadTestFacts,
} from "../../../desired-state/testing.js";
import { mcpResolutionKey } from "../../../desired-state/index.js";
import { disableMcpServer } from "./disable.js";
import { enableMcpServer } from "./enable.js";

const serverName = "my-server";

const makeEntry = (enabled: boolean): McpServerEntry => ({
  source: "@community/mcps/my-server",
  enabled,
  env: {},
});

const makeLockEntry = (projectRoot: string): McpServerLockEntry => ({
  ...makeRegistryMcpServerLockEntry({
    owner: handle("@community"),
    name: serverName,
  }),
  treeIntegrity: computeMaterializedTreeIntegritySync(
    path.join(projectRoot, "agent_extensions", "registry", "@community", "mcps", serverName),
  ),
});

const makeAgentRepo = (agent: CodingAgent): CodingAgentRepositoryService => ({
  get: () => Effect.die(new Error("not implemented in test")),
  all: Effect.succeed([]),
  getConfiguredAgents: () => Effect.succeed([agent]),
  getMaterializationAgents: () => Effect.succeed([]),
  getUnknownConfiguredAgentIds: () => Effect.succeed([]),
});

const makeServices = (
  axmDir: string,
  facts: {
    readonly entry: McpServerEntry;
    readonly onUpdateEntry?: (type: string, name: string) => void;
  },
  agentRepo: CodingAgentRepositoryService,
  read: Omit<WorkspaceReadTestFacts, "baseDir" | "runtimeDir"> = {},
) => {
  return {
    layer: Layer.mergeAll(
      NativeWriteAuthorityPermissive,
      WorkspaceReadTest({
        baseDir: path.dirname(axmDir),
        runtimeDir: axmDir,
        ...read,
        settings: {
          ...read.settings,
          agents: read.settings?.agents ?? ["claude-code"],
          mcpServers: { [serverName]: facts.entry },
        },
      }),
      Layer.mock(SettingsWriter, {
        updateEntry: (type, name, _update) => Effect.sync(() => facts.onUpdateEntry?.(type, name)),
      }),
      MockWorkspaceTransactionScope(axmDir),
      TestStepFailureConversion,
      Layer.succeed(CodingAgentRepository, agentRepo),
    ).pipe(Layer.provideMerge(NodeServices.layer)),
  };
};

describe("enableMcpServer and disableMcpServer", () => {
  let tmpDir: string;
  let projectDir: string;
  let axmDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "mcp-enable-disable-")));
    projectDir = path.join(tmpDir, "project");
    axmDir = path.join(projectDir, ".axm");
    fs.mkdirSync(axmDir, { recursive: true });
    fs.mkdirSync(
      path.join(projectDir, "agent_extensions", "registry", "@community", "mcps", serverName),
      { recursive: true },
    );
    fs.writeFileSync(
      path.join(
        projectDir,
        "agent_extensions",
        "registry",
        "@community",
        "mcps",
        serverName,
        "mcp.json",
      ),
      JSON.stringify({
        owner: "@community",
        type: "mcp-server",
        name: serverName,
        version: "1.0.0",
        server: {
          name: `io.github.community/${serverName}`,
          description: "Test MCP server",
          version: "1.0.0",
          packages: [
            {
              registryType: "npm",
              identifier: "@community/my-server",
              version: "1.0.0",
              transport: { type: "stdio" },
            },
          ],
        },
      }),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it.effect("projects a sourced server through the manifest target decision", () =>
    Effect.gen(function* () {
      const entry = makeEntry(false);
      const agent = makeCodingAgentStub("claude-code", {
        resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "supported", dir: "/tmp" }),
        addMcpServer: () => Effect.succeed({ _tag: "unsupported", reason: "not called" }),
        removeMcpServer: () => Effect.succeed({ _tag: "success" }),
      });
      const lockEntry = makeLockEntry(projectDir);
      const identity = mcpResolutionKey(lockEntry);
      const graph = {
        complete: true as const,
        nodes: [
          {
            type: "mcp-server" as const,
            name: serverName,
            identity,
            authority: "sourced" as const,
            source: "@community/mcps/my-server",
            enabled: false,
            constraints: [],
            origins: [
              {
                type: "settings" as const,
                localName: serverName,
                source: "@community/mcps/my-server",
                enabled: false,
              },
            ],
          },
        ],
        mcpSourceClosures: [
          {
            identity,
            localNames: [serverName],
            constraints: [],
            origins: [],
          },
        ],
        problems: [],
      };
      const services = makeServices(axmDir, { entry }, makeAgentRepo(agent), {
        lockfile: { lockfileVersion: 8, skills: {}, mcpServers: { [identity]: lockEntry } },
        graph,
      });

      const result = yield* enableMcpServer({
        name: "enable-mcp-server",
        args: { serverName },
      }).pipe(Effect.provide(services.layer));

      expect(result.result).toBe("success");
      if (result.result !== "success") {
        throw new Error("Expected successful enable result");
      }
      expect(result.message).toContain("Enabled my-server");
      expect(result.artifact).toMatchObject({
        path: "agent_extensions/registry/@community/mcps/my-server",
        scope: "project",
        change: "updated",
        targets: [
          { path: "axm.json", change: "updated" },
          { path: ".mcp.json", change: "created", agentIds: ["claude-code"] },
        ],
      });
      expect(
        JSON.parse(fs.readFileSync(path.join(axmDir, "..", ".mcp.json"), "utf8")),
      ).toMatchObject({
        mcpServers: { [serverName]: expect.objectContaining({ command: "npx" }) },
      });
    }),
  );

  it.effect("fails disable when a configured agent refuses the required write", () =>
    Effect.gen(function* () {
      const entry = makeEntry(true);
      const removeSpy = vi.fn(() =>
        Effect.succeed({ _tag: "disabled" as const, reason: "agent disabled MCP writes" }),
      );
      const agent = makeCodingAgentStub("claude-code", {
        resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "supported", dir: "/tmp" }),
        addMcpServer: () => Effect.succeed({ _tag: "success" }),
        removeMcpServer: removeSpy,
      });
      const updateSpy = vi.fn();
      const services = makeServices(
        axmDir,
        { entry, onUpdateEntry: updateSpy },
        makeAgentRepo(agent),
      );

      const error = yield* disableMcpServer({
        name: "disable-mcp-server",
        args: { serverName },
      }).pipe(Effect.provide(services.layer), Effect.flip);

      expect(error.category).toBe("conflict");
      expect(error.detail).toContain("agent disabled MCP writes");
      expect(removeSpy).toHaveBeenCalledOnce();
      expect(updateSpy).not.toHaveBeenCalled();
    }),
  );
});
