import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { afterEach, beforeEach, vi } from "vitest";
import { CodingAgentRepository, type CodingAgentRepositoryService } from "../../agents/index.js";
import type { CodingAgent } from "../../agents/coding-agent.js";
import { TestRenderer, logsByTag } from "../../cli-renderer/index.js";
import type { McpServerLockEntry } from "../../lockfile/index.js";
import type { McpServerEntry } from "../../settings/index.js";
import {
  computeMaterializedTreeIntegritySync,
  handle,
  makeCodingAgentStub,
} from "../../test-helpers.js";
import { WorkspaceMutations } from "../../workspace/service-interface.js";
import type { WorkspaceMutationsService } from "../../workspace/service-interface.js";
import {
  makeBaseWorkspaceMock,
  makeRegistryMcpServerLockEntry,
} from "../../workspace/test-stubs.js";
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
    path.join(projectRoot, "agent_extensions", "@community", "mcps", serverName),
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
  wsOverrides: Partial<WorkspaceMutationsService>,
  agentRepo: CodingAgentRepositoryService,
) => {
  const renderer = TestRenderer.make();
  const workspace = makeBaseWorkspaceMock(axmDir, wsOverrides);

  return {
    layer: Layer.mergeAll(
      NodeServices.layer,
      WorkspaceMutations.layer(workspace),
      renderer.layer,
      Layer.succeed(CodingAgentRepository, agentRepo),
    ),
    rendererState: renderer.state,
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
    fs.mkdirSync(path.join(projectDir, "agent_extensions", "@community", "mcps", serverName), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(projectDir, "agent_extensions", "@community", "mcps", serverName, "mcp.json"),
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

  it.effect("returns enable sync warnings in result without raw warning logs", () =>
    Effect.gen(function* () {
      const entry = makeEntry(false);
      const addSpy = vi.fn(() =>
        Effect.succeed({
          _tag: "fallback" as const,
          fallbackFrom: "unsupported" as const,
          reason: "agent used fallback config path",
          targets: [{ path: ".mcp.json", change: "updated" as const }],
        }),
      );
      const agent = makeCodingAgentStub("claude-code", {
        resolveEffectiveSkillsDir: () => Effect.succeed({ _tag: "supported", dir: "/tmp" }),
        addMcpServer: addSpy,
        removeMcpServer: () => Effect.succeed({ _tag: "success" }),
      });
      const services = makeServices(
        axmDir,
        {
          getConfiguredMcpServerEntries: () => Effect.succeed({ [serverName]: entry }),
          getLockedMcpServers: () => Effect.succeed({ [serverName]: makeLockEntry(projectDir) }),
          getLockedMcpServer: () => Effect.succeed(Option.some(makeLockEntry(projectDir))),
          updateMcpServerEntry: () => Effect.void,
        },
        makeAgentRepo(agent),
      );

      const result = yield* enableMcpServer({
        name: "enable-mcp-server",
        args: { serverName },
      }).pipe(Effect.provide(services.layer));

      expect(result.result).toBe("success");
      if (result.result !== "success") {
        throw new Error("Expected successful enable result");
      }
      expect(result.message).toContain("Enabled my-server");
      expect(result.message).toContain("agent used fallback config path");
      expect(result.artifact).toMatchObject({
        path: "agent_extensions/@community/mcps/my-server",
        scope: "project",
        change: "updated",
        targets: [
          { path: "axm.json", change: "updated" },
          { path: ".mcp.json", change: "updated", agentIds: ["claude-code"] },
        ],
      });
      expect(logsByTag(services.rendererState).warn).toEqual([]);
      expect(addSpy).toHaveBeenCalledOnce();
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
      const updateSpy = vi.fn(() => Effect.void);
      const services = makeServices(
        axmDir,
        {
          getConfiguredMcpServerEntries: () => Effect.succeed({ [serverName]: entry }),
          getLockedMcpServers: () => Effect.succeed({ [serverName]: makeLockEntry(projectDir) }),
          getLockedMcpServer: () => Effect.succeed(Option.some(makeLockEntry(projectDir))),
          updateMcpServerEntry: updateSpy,
        },
        makeAgentRepo(agent),
      );

      const error = yield* disableMcpServer({
        name: "disable-mcp-server",
        args: { serverName },
      }).pipe(Effect.provide(services.layer), Effect.flip);

      expect(error.code).toBe("conflict");
      expect(error.detail).toContain("agent disabled MCP writes");
      expect(logsByTag(services.rendererState).warn).toEqual([]);
      expect(removeSpy).toHaveBeenCalledOnce();
      expect(updateSpy).not.toHaveBeenCalled();
    }),
  );
});
