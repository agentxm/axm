import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { afterEach, beforeEach } from "vitest";

import { writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  makeWorkspaceHandlerTestContext,
  planResultUnits,
} from "../../test-helpers.js";
import { handleMcpsAdd } from "./add.js";
import { toAppError } from "@agentxm/extension-management/unstable/app-error/conversions";

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
            command: "node",
            args: ["server.js"],
            env: { CONTEXT_TOKEN: "${CONTEXT_TOKEN}" },
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
          name: "context",
          command: Option.some("node server.js"),
          url: Option.none(),
          env: ["CONTEXT_TOKEN"],
          header: [],
          yes: false,
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
          name: "demo",
          command: Option.none(),
          url: Option.some("https://example.test/mcp"),
          env: [],
          header: [],
          yes: true,
          force: false,
          preview: false,
        });

        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Add MCP server",
          totalSteps: 2,
          warningCount: 0,
        });
        const units = planResultUnits(result);
        expect(units[1]).toMatchObject({
          id: "Sync demo to configured agents",
          label: "Sync demo to configured agents",
          state: "committed",
          message: "Synced demo to 5 agents",
          artifact: {
            path: "agent MCP configs",
            scope: "project",
            agents: ["claude-code", "cursor", "codex", "gemini-cli", "antigravity"],
            change: "created",
            fileCount: 5,
            targets: [
              {
                path: ".mcp.json",
                change: "created",
                agentIds: ["claude-code"],
              },
              {
                path: ".cursor/mcp.json",
                change: "created",
                agentIds: ["cursor"],
              },
              {
                path: ".codex/config.toml",
                change: "created",
                agentIds: ["codex"],
              },
              {
                path: ".gemini/settings.json",
                change: "created",
                agentIds: ["gemini-cli"],
              },
              {
                path: ".agents/mcp_config.json",
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

  it.effect("persists and projects an explicit agent subset", () => {
    const { provide } = makeWorkspaceHandlerTestContext({ machine: true });
    writeMultiAgentSettings();

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsAdd({
          name: "demo",
          command: Option.some("node server.js"),
          url: Option.none(),
          env: [],
          header: [],
          yes: true,
          force: false,
          preview: false,
          agents: ["claude-code"],
        });

        const settings = JSON.parse(fs.readFileSync(path.join(tempDir, "axm.json"), "utf8"));
        expect(settings.mcpServers.demo.agents).toEqual(["claude-code"]);
        expect(fs.existsSync(path.join(tempDir, ".mcp.json"))).toBe(true);
        expect(fs.existsSync(path.join(tempDir, ".cursor", "mcp.json"))).toBe(false);
        expect(fs.existsSync(path.join(tempDir, ".codex", "config.toml"))).toBe(false);
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
            name: "demo",
            command: Option.some("node server.js"),
            url: Option.none(),
            env: ["API_TOKEN=literal-secret"],
            header: [],
            yes: true,
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
            name: "demo",
            command: Option.none(),
            url: Option.some("wss://example.test/mcp"),
            env: [],
            header: [],
            yes: true,
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
            name: "@acme/mcps/demo",
            command: Option.none(),
            url: Option.none(),
            env: [],
            header: [],
            yes: true,
            force: false,
            preview: false,
          }),
        );

        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result)) {
          const failure = toAppError(result.failure);
          expect(failure.code).toBe("usage");
          expect(failure.detail).toContain("axm mcps install @acme/mcps/demo");
        }
        const settings = JSON.parse(fs.readFileSync(path.join(tempDir, "axm.json"), "utf8"));
        expect(settings.mcpServers).toEqual({});
      }),
    );
  });

  it.effect("blocks agents that cannot represent environment defaults", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeEnvExpansionSettings();

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsAdd({
          name: "demo",
          command: Option.some("node server.js"),
          url: Option.none(),
          env: ["FOO=${BAR:-fallback}"],
          header: [],
          yes: true,
          force: false,
          preview: false,
        });

        // Closures settle independently: the workspace entry committed while
        // the incapable agent's projection failed — a truthful partial.
        expect(rendererState.results[0]?.data).toMatchObject({
          result: {
            planName: "Add MCP server",
            outcome: "partial",
          },
        });
        expect(JSON.stringify(rendererState.results[0]?.data)).toContain(
          "does not expand environment default",
        );
      }),
    );
  });
});
