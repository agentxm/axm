import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { afterEach, beforeEach } from "vitest";

import { SourceHostProvidersLive } from "@agentxm/workspace-kernel/sources/live";
import {
  AllExtensionManagersLive,
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  makeWorkspaceHandlerTestContext,
} from "../../test-support/test-helpers.js";

import { handleDisable, handleEnable } from "../activation-handler.js";

const mcpEntry = (enabled: boolean) => ({
  connection: { transport: "streamable-http", url: "https://example.test/mcp", headers: {} },
  enabled,
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
    const workspaceServiceLayer = Layer.mergeAll(
      ctx.fullLayer,
      Layer.provide(SourceHostProvidersLive, ctx.fullLayer),
    );
    const fullLayer = Layer.provideMerge(AllExtensionManagersLive, workspaceServiceLayer);
    return {
      ...ctx,
      fullLayer,
      provide: Effect.provide(fullLayer),
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

  it.effect("rechecks native projection when an MCP server is already enabled", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeMcpSettings(false);

    return provide(
      Effect.gen(function* () {
        yield* handleEnable("mcp-server", {
          name: "context",
          preview: false,
        });
        rendererState.logs.length = 0;
        rendererState.results.length = 0;

        yield* handleEnable("mcp-server", {
          name: "context",
          preview: false,
        });

        expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Enable MCP server",
        });
      }),
    );
  });

  it.effect("emits a settings artifact when enabling an MCP server", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeMcpSettings(false);

    return provide(
      Effect.gen(function* () {
        yield* handleEnable("mcp-server", {
          name: "context",
          preview: false,
        });

        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Enable MCP server",
        });
        expect(result).toMatchObject({
          units: [
            {
              id: "mcp-server:context",
              label: "context",
              state: "committed",
              artifact: {
                path: "axm.json",
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
        yield* handleEnable("mcp-server", {
          name: "context",
          preview: false,
        });

        expect(logs.success).toEqual(["Enabled 1 MCP server"]);
        expect(rendererState.summaries).toEqual(["context   updated   2 files, axm.json"]);
        expect(rendererState.suggestions).toEqual([
          { description: "Inspect installed MCP servers", cmd: "axm mcps list" },
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
        yield* handleDisable("mcp-server", {
          name: "context",
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
        yield* handleDisable("mcp-server", {
          name: "context",
          preview: false,
        });

        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Disable MCP server",
        });
        expect(result).toMatchObject({
          units: [
            {
              id: "mcp-server:context",
              label: "context",
              state: "committed",
              artifact: {
                path: "axm.json",
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
