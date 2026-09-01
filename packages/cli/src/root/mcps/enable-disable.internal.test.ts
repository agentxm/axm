import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";

import { CodingAgentRepository } from "@agentxm/extension-workspace";
import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { handleDisableMcpServer } from "./disable.js";
import { handleEnableMcpServer } from "./enable.js";

const mcpEntry = (enabled: boolean) => ({
  url: "https://example.test/mcp",
  headers: {},
  enabled,
  env: {},
});

describe("mcps enable/disable output", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcps-enable-disable-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: Parameters<typeof makeWorkspaceHandlerTestContext>[0]) => {
    const ctx = makeWorkspaceHandlerTestContext(opts);
    const agentRepoLayer = Layer.succeed(CodingAgentRepository, {
      get: () => Effect.die(new Error("not implemented in test")),
      all: Effect.succeed([]),
      getConfiguredAgents: () => Effect.succeed([]),
      getMaterializationAgents: () => Effect.succeed([]),
      getUnknownConfiguredAgentIds: () => Effect.succeed([]),
    });
    const fullLayer = Layer.mergeAll(ctx.fullLayer, agentRepoLayer);
    return {
      ...ctx,
      fullLayer,
      provide: makeEffectProvide(fullLayer),
    };
  };

  const writeMcpSettings = (enabled: boolean) => {
    fs.writeFileSync(
      path.join(tempDir, "axm.json"),
      JSON.stringify({
        agents: ["claude-code"],
        mcpServers: {
          context: mcpEntry(enabled),
        },
      }),
    );
  };

  it.effect("reports an already-enabled MCP server as JSON no-op", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    writeMcpSettings(true);

    return provide(
      Effect.gen(function* () {
        yield* handleEnableMcpServer({
          name: "context",
          yes: false,
          preview: false,
        });

        expect(logs.success).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Enable MCP server",
          message: 'MCP server "context" is already enabled',
        });
      }),
    );
  });

  it.effect("emits a settings artifact when enabling an MCP server", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeMcpSettings(false);

    return provide(
      Effect.gen(function* () {
        yield* handleEnableMcpServer({
          name: "context",
          yes: true,
          preview: false,
        });

        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Enable MCP server",
        });
        expect(result).toMatchObject({
          units: [
            {
              id: "context",
              label: "context",
              state: "committed",
              artifact: {
                path: "axm.json / axm-lock.yaml",
                scope: "project",
                change: "updated",
              },
            },
          ],
        });
      }),
    );
  });

  it.effect("reports enabled MCP server artifacts in human summary", () => {
    const { provide, logs, rendererState } = makeLayers();
    writeMcpSettings(false);

    return provide(
      Effect.gen(function* () {
        yield* handleEnableMcpServer({
          name: "context",
          yes: true,
          preview: false,
        });

        expect(logs.success).toEqual(["Enabled 1 MCP server"]);
        expect(rendererState.summaries).toEqual([
          "context   updated   2 files   axm.json, .mcp.json",
        ]);
        expect(rendererState.suggestions).toEqual([
          { description: "Inspect MCP servers", cmd: "axm mcps list" },
          { description: "Undo", cmd: "axm mcps disable context" },
        ]);
      }),
    );
  });

  it.effect("reports an already-disabled MCP server as JSON no-op", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    writeMcpSettings(false);

    return provide(
      Effect.gen(function* () {
        yield* handleDisableMcpServer({
          name: "context",
          yes: false,
          preview: false,
        });

        expect(logs.success).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Disable MCP server",
          message: 'MCP server "context" is already disabled',
        });
      }),
    );
  });

  it.effect("emits a settings artifact when disabling an MCP server", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeMcpSettings(true);

    return provide(
      Effect.gen(function* () {
        yield* handleDisableMcpServer({
          name: "context",
          yes: true,
          preview: false,
        });

        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Disable MCP server",
        });
        expect(result).toMatchObject({
          units: [
            {
              id: "context",
              label: "context",
              state: "committed",
              artifact: {
                path: "axm.json / axm-lock.yaml",
                scope: "project",
                change: "updated",
              },
            },
          ],
        });
      }),
    );
  });
});
