import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { afterEach, beforeEach } from "vitest";

import { writeWorkspaceFiles } from "../../test-support/test-stubs.js";
import {
  getAppError,
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  makeWorkspaceHandlerTestContext,
  planResultUnits,
} from "../../test-support/test-helpers.js";
import { handleMcpsAdd } from "./add.js";

describe("mcps add output", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcps-add-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const writeInlineMcpSettings = () => {
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    fs.writeFileSync(
      path.join(tempDir, "axm.json"),
      JSON.stringify({
        agents: ["claude-code"],
        mcpServers: {
          context: {
            enabled: true,
            connection: {
              transport: "stdio",
              command: "node",
              args: ["server.js"],
              env: { CONTEXT_TOKEN: { env: "CONTEXT_TOKEN" } },
            },
          },
        },
      }),
    );
  };

  const writeMultiAgentSettings = () => {
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    fs.writeFileSync(
      path.join(tempDir, "axm.json"),
      JSON.stringify({
        agents: ["claude-code", "cursor", "codex", "gemini-cli", "antigravity"],
        mcpServers: {},
      }),
    );
  };

  const writeEnvExpansionSettings = () => {
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    fs.writeFileSync(
      path.join(tempDir, "axm.json"),
      JSON.stringify({
        agents: ["claude-code", "cursor", "codex"],
        mcpServers: {},
      }),
    );
  };

  it.effect("reports an already-configured inline MCP server as JSON no-op", () => {
    const { provide, logs, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeInlineMcpSettings();

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsAdd({
          connection: Option.none(),
          transport: Option.none(),
          cwd: Option.none(),
          headerEnv: [],
          nativeOauth: false,
          name: "context",
          command: Option.some("node"),
          arg: ["server.js"],
          url: Option.none(),
          env: ["CONTEXT_TOKEN"],
          header: [],
          force: false,
          preview: false,
        });

        expect(logs.success).toEqual([]);
        const result = expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Add MCP server",
          message: "MCP server context is already configured",
        });
        expect(result).toMatchObject({
          planDescription: "Configure context and sync agent MCP configs",
        });
      }),
    );
  });

  it.effect("reports each synced agent MCP config target in JSON output", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeMultiAgentSettings();

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsAdd({
          connection: Option.none(),
          transport: Option.none(),
          cwd: Option.none(),
          headerEnv: [],
          nativeOauth: false,
          name: "demo",
          command: Option.some("node"),
          arg: ["server.js"],
          url: Option.none(),
          env: [],
          header: [],
          force: false,
          preview: false,
        });

        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Add MCP server",
          totalSteps: 1,
          warningCount: 5,
        });
        const units = planResultUnits(result);
        expect(units[0]).toMatchObject({
          id: "Configure and project demo",
          label: "Configure and project demo",
          state: "committed",
          message: "Synced demo to 5 agents with 5 warnings",
          artifact: {
            path: "axm.json",
            scope: "project",
            change: "created",
            targets: [
              {
                path: path.join(tempDir, ".mcp.json"),
                change: "created",
                agentIds: ["claude-code"],
              },
              {
                path: path.join(tempDir, ".cursor/mcp.json"),
                change: "created",
                agentIds: ["cursor"],
              },
              {
                path: path.join(tempDir, ".codex/config.toml"),
                change: "created",
                agentIds: ["codex"],
              },
              {
                path: path.join(tempDir, ".gemini/settings.json"),
                change: "created",
                agentIds: ["gemini-cli"],
              },
              {
                path: path.join(tempDir, ".agents/mcp_config.json"),
                change: "created",
                agentIds: ["antigravity"],
              },
            ],
          },
        });
        expect(fs.existsSync(path.join(tempDir, ".mcp.json"))).toBe(true);
        expect(fs.existsSync(path.join(tempDir, ".cursor", "mcp.json"))).toBe(true);
        expect(fs.existsSync(path.join(tempDir, ".codex", "config.toml"))).toBe(true);
        expect(fs.existsSync(path.join(tempDir, ".gemini", "settings.json"))).toBe(true);
        expect(fs.existsSync(path.join(tempDir, ".agents", "mcp_config.json"))).toBe(true);
      }),
    );
  });

  it.effect("rejects sensitive environment literals before mutation", () => {
    const { provide } = makeWorkspaceHandlerTestContext({ machine: true });
    writeMultiAgentSettings();

    return provide(
      Effect.gen(function* () {
        const result = yield* Effect.result(
          handleMcpsAdd({
            connection: Option.none(),
            transport: Option.none(),
            cwd: Option.none(),
            headerEnv: [],
            nativeOauth: false,
            name: "demo",
            command: Option.some("node"),
            arg: ["server.js"],
            url: Option.none(),
            env: ["API_TOKEN=literal-secret"],
            header: [],
            force: false,
            preview: false,
          }),
        );

        expect(Result.isFailure(result)).toBe(true);
        expect(fs.existsSync(path.join(tempDir, ".mcp.json"))).toBe(false);
        const settings = JSON.parse(fs.readFileSync(path.join(tempDir, "axm.json"), "utf8"));
        expect(settings.mcpServers).toEqual({});
      }),
    );
  });

  it.effect("rejects WebSocket remote URLs before writing workspace or agent files", () => {
    const { provide } = makeWorkspaceHandlerTestContext({ machine: true });
    writeMultiAgentSettings();

    return provide(
      Effect.gen(function* () {
        const result = yield* Effect.result(
          handleMcpsAdd({
            connection: Option.none(),
            transport: Option.none(),
            cwd: Option.none(),
            headerEnv: [],
            nativeOauth: false,
            name: "demo",
            command: Option.none(),
            arg: [],
            url: Option.some("wss://example.test/mcp"),
            env: [],
            header: [],
            force: false,
            preview: false,
          }),
        );

        expect(Result.isFailure(result)).toBe(true);
        expect(fs.existsSync(path.join(tempDir, ".mcp.json"))).toBe(false);
        expect(fs.existsSync(path.join(tempDir, ".cursor", "mcp.json"))).toBe(false);
        expect(fs.existsSync(path.join(tempDir, ".codex", "config.toml"))).toBe(false);
        const settings = JSON.parse(fs.readFileSync(path.join(tempDir, "axm.json"), "utf8"));
        expect(settings.mcpServers).toEqual({});
      }),
    );
  });

  it.effect("rejects source locators with mcps install guidance before mutation", () => {
    const { provide } = makeWorkspaceHandlerTestContext({ machine: true });
    writeMultiAgentSettings();

    return provide(
      Effect.gen(function* () {
        const result = yield* Effect.result(
          handleMcpsAdd({
            connection: Option.none(),
            transport: Option.none(),
            cwd: Option.none(),
            headerEnv: [],
            nativeOauth: false,
            name: "@acme/mcps/demo",
            command: Option.none(),
            arg: [],
            url: Option.none(),
            env: [],
            header: [],
            force: false,
            preview: false,
          }),
        );

        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result)) {
          const failure = getAppError(result.failure);
          expect(failure.code).toBe("usage");
          expect(failure.detail).toContain("axm mcps install @acme/mcps/demo");
        }
        const settings = JSON.parse(fs.readFileSync(path.join(tempDir, "axm.json"), "utf8"));
        expect(settings.mcpServers).toEqual({});
      }),
    );
  });

  it.effect("blocks native expansion of authored literal metasyntax", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeEnvExpansionSettings();
    const settingsBefore = fs.readFileSync(path.join(tempDir, "axm.json"), "utf8");

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsAdd({
          connection: Option.none(),
          transport: Option.none(),
          cwd: Option.none(),
          headerEnv: [],
          nativeOauth: false,
          name: "demo",
          command: Option.some("node"),
          arg: ["server.js"],
          url: Option.none(),
          env: ["FOO=${BAR:-fallback}"],
          header: [],
          force: false,
          preview: false,
        });

        // Every native co-reader is checked before accepting workspace intent.
        expect(rendererState.results[0]?.data).toMatchObject({
          result: {
            planName: "Add MCP server",
            outcome: "blocked",
          },
        });
        expect(JSON.stringify(rendererState.results[0]?.data)).toContain(
          "literal native metasyntax",
        );
        expect(fs.readFileSync(path.join(tempDir, "axm.json"), "utf8")).toBe(settingsBefore);
        for (const config of [".mcp.json", ".cursor/mcp.json", ".codex/config.toml"]) {
          expect(fs.existsSync(path.join(tempDir, config))).toBe(false);
        }
      }),
    );
  });
});
