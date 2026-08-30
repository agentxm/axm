import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { AppError, makeAppError } from "@agentxm/extension-management/unstable/app-error";
import { afterEach, beforeEach } from "vitest";

import { writeWorkspaceFiles } from "../../test-stubs.js";
import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  makeWorkspaceHandlerTestContext,
} from "../../test-helpers.js";
import { handleMcpsImport } from "./import.js";

describe("mcps import output", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcps-import-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: Parameters<typeof makeWorkspaceHandlerTestContext>[0]) => {
    const ctx = makeWorkspaceHandlerTestContext(opts);
    return {
      ...ctx,
      provide: ctx.provide,
    };
  };

  const writeMcpConfig = () => {
    fs.writeFileSync(
      path.join(tempDir, ".mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            demo: {
              command: "node",
              args: ["server.js"],
              env: { DEMO_TOKEN: "secret-value" },
            },
          },
        },
        null,
        2,
      ),
    );
  };

  it.effect("reports no unmanaged MCP servers in human output", () => {
    const { provide, logs } = makeLayers();
    writeWorkspaceFiles(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsImport({ yes: true, preview: false });

        expect(logs.success).toEqual(["No unmanaged MCP servers imported."]);
      }),
    );
  });

  it.effect("reports no unmanaged MCP servers as JSON no-op", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsImport({ yes: true, preview: false });

        expect(logs.success).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Import MCP servers",
          message: "No unmanaged MCP servers imported.",
        });
      }),
    );
  });

  it.effect("reports imported MCP servers with config artifacts in machine output", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    writeMcpConfig();

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsImport({ yes: true, preview: false });

        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Import MCP servers",
        });
        expect(result).toMatchObject({
          imports: { imported: 1, skipped: 0, conflicting: 0 },
          units: [
            {
              id: "Import 1 MCP server",
              label: "Import 1 MCP server",
              state: "committed",
              message: "Imported 1 MCP server",
              artifact: {
                path: "axm.json",
                scope: "project",
                change: "updated",
                fileCount: 2,
                targets: [{ path: ".mcp.json", change: "updated" }],
              },
            },
          ],
        });
        const config = JSON.parse(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8"));
        expect(config.mcpServers.demo).toEqual({
          command: "node",
          args: ["server.js"],
          env: { DEMO_TOKEN: "secret-value" },
          "x-axm": {
            v: 1,
            managed: true,
            ext: "@workspace/mcps/demo",
            source: "inline",
          },
        });
        const settings = JSON.parse(fs.readFileSync(path.join(tempDir, "axm.json"), "utf8"));
        expect(settings.mcpServers.demo.env).toEqual({ DEMO_TOKEN: "${DEMO_TOKEN}" });
        expect(settings.mcpServers.demo.agents).toEqual(["claude-code"]);
        expect(JSON.stringify(settings)).not.toContain("secret-value");
      }),
    );
  });

  it.effect("produces a deterministic redacted preview without changing source files", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    const originalConfig = JSON.stringify({
      mcpServers: {
        zebra: { command: "node", args: ["zebra.js"] },
        alpha: { command: "node", args: ["alpha.js"], env: { TOKEN: "private-value" } },
      },
    });
    fs.writeFileSync(path.join(tempDir, ".mcp.json"), originalConfig);

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsImport({ yes: false, preview: true });

        expect(rendererState.results[0]?.data).toMatchObject({
          result: {
            outcome: "previewed",
            imports: { imported: 0, skipped: 0, conflicting: 0 },
            units: [{ label: "Import 2 MCP servers", message: "Candidates: alpha, zebra" }],
          },
        });
        expect(JSON.stringify(rendererState.results[0]?.data)).not.toContain("private-value");
        expect(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8")).toBe(originalConfig);
      }),
    );
  });

  it.effect("is idempotent and reports an already imported server as skipped", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    writeMcpConfig();

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsImport({ yes: true, preview: false });
        const settingsAfterImport = fs.readFileSync(path.join(tempDir, "axm.json"), "utf8");
        yield* handleMcpsImport({ yes: true, preview: false });

        expect(rendererState.results[1]?.data).toMatchObject({
          result: {
            outcome: "no-op",
            imports: { imported: 0, skipped: 1, conflicting: 0 },
          },
        });
        expect(fs.readFileSync(path.join(tempDir, "axm.json"), "utf8")).toBe(settingsAfterImport);
      }),
    );
  });

  it.effect("reports unsupported native config formats without parsing or exposing them", () => {
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    fs.writeFileSync(
      path.join(tempDir, "axm.json"),
      JSON.stringify({ agents: ["codex"], mcpServers: {} }),
    );
    fs.mkdirSync(path.join(tempDir, ".codex"), { recursive: true });
    const toml = '[mcp_servers.demo]\ncommand = "node"\nsecret = "private-value"\n';
    fs.writeFileSync(path.join(tempDir, ".codex", "config.toml"), toml);
    const { provide, rendererState } = makeLayers({ machine: true });

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsImport({ yes: true, preview: false });

        expect(rendererState.results[0]?.data).toMatchObject({
          result: {
            outcome: "no-op",
            imports: { imported: 0, skipped: 1, conflicting: 0 },
          },
        });
        expect(JSON.stringify(rendererState.results[0]?.data)).not.toContain("private-value");
        expect(fs.readFileSync(path.join(tempDir, ".codex", "config.toml"), "utf8")).toBe(toml);
      }),
    );
  });

  it.effect("reports imported MCP servers with explicit config artifact summary", () => {
    const { provide, logs, rendererState } = makeLayers();
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    writeMcpConfig();

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsImport({ yes: true, preview: false });

        expect(logs.success).toEqual(["Imported 1 MCP server"]);
        expect(rendererState.summaries).toEqual([
          "Import 1 MCP server   updated   2 files   axm.json, .mcp.json",
        ]);
        expect(rendererState.suggestions).toEqual([
          { description: "Inspect MCP servers", cmd: "axm mcps list" },
          { description: "Undo", cmd: "axm mcps uninstall demo" },
        ]);
      }),
    );
  });

  it.effect(
    "reports conflicts before confirmation without exposing secrets or mutating files",
    () => {
      writeWorkspaceFiles(path.join(tempDir, ".axm"));
      fs.writeFileSync(
        path.join(tempDir, "axm.json"),
        JSON.stringify({ agents: ["claude-code", "cursor"], mcpServers: {} }),
      );
      fs.mkdirSync(path.join(tempDir, ".cursor"), { recursive: true });
      const workspaceConfig = JSON.stringify({
        mcpServers: {
          demo: { command: "node", args: ["one.js"], env: { TOKEN: "first-secret" } },
        },
      });
      const cursorConfig = JSON.stringify({
        mcpServers: {
          demo: { command: "node", args: ["two.js"], env: { TOKEN: "second-secret" } },
        },
      });
      fs.writeFileSync(path.join(tempDir, ".mcp.json"), workspaceConfig);
      fs.writeFileSync(path.join(tempDir, ".cursor", "mcp.json"), cursorConfig);
      const { provide, promptState, rendererState } = makeLayers({ machine: true });

      return provide(
        Effect.gen(function* () {
          yield* handleMcpsImport({ yes: false, preview: false });

          expect(promptState.confirmCalls).toEqual([]);
          expect(rendererState.results[0]?.data).toMatchObject({
            result: {
              outcome: "blocked",
              blocking: { class: "precondition-unmet" },
              imports: { imported: 0, skipped: 0, conflicting: 1 },
            },
          });
          expect(JSON.stringify(rendererState.results[0]?.data)).not.toContain("first-secret");
          expect(JSON.stringify(rendererState.results[0]?.data)).not.toContain("second-secret");
          expect(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8")).toBe(workspaceConfig);
          expect(fs.readFileSync(path.join(tempDir, ".cursor", "mcp.json"), "utf8")).toBe(
            cursorConfig,
          );
        }),
      );
    },
  );

  it.effect("rolls back settings and prior native config writes when any adoption fails", () => {
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    const originalSettings = JSON.stringify({
      agents: ["claude-code", "cursor"],
      mcpServers: {},
    });
    fs.writeFileSync(path.join(tempDir, "axm.json"), originalSettings);
    fs.mkdirSync(path.join(tempDir, ".cursor"), { recursive: true });
    const workspaceConfig = JSON.stringify({
      mcpServers: { zebra: { command: "node", args: ["zebra.js"] } },
    });
    const cursorConfig = JSON.stringify({
      mcpServers: { alpha: { command: "node", args: ["alpha.js"] } },
    });
    fs.writeFileSync(path.join(tempDir, ".mcp.json"), workspaceConfig);
    fs.writeFileSync(path.join(tempDir, ".cursor", "mcp.json"), cursorConfig);
    const { provide, rendererState } = makeLayers({ machine: true });

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsImport(
          { yes: true, preview: false },
          {
            beforeAdoptionWrite: (adoption) =>
              adoption.name === "zebra"
                ? Effect.fail(
                    makeAppError({ code: "internal", detail: "Injected adoption failure" }),
                  )
                : Effect.void,
          },
        );

        expect(rendererState.results[0]?.data).toMatchObject({
          result: { outcome: "failed", imports: { imported: 0, conflicting: 0 } },
        });
        expect(fs.readFileSync(path.join(tempDir, "axm.json"), "utf8")).toBe(originalSettings);
        expect(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8")).toBe(workspaceConfig);
        expect(fs.readFileSync(path.join(tempDir, ".cursor", "mcp.json"), "utf8")).toBe(
          cursorConfig,
        );
      }),
    );
  });

  it.effect("applies an eligible explicit import without redundant confirmation", () => {
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    writeMcpConfig();
    const { provide, promptState, rendererState } = makeLayers({
      machine: true,
      prompt: { confirmResponses: [false] },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsImport({ yes: false, preview: false });

        expect(promptState.confirmCalls).toEqual([]);
        expect(rendererState.results[0]?.data).toMatchObject({
          result: { outcome: "applied", imports: { imported: 1 } },
        });
        const config = JSON.parse(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8"));
        expect(config.mcpServers.demo).toEqual({
          command: "node",
          args: ["server.js"],
          env: { DEMO_TOKEN: "secret-value" },
          "x-axm": {
            v: 1,
            managed: true,
            ext: "@workspace/mcps/demo",
            source: "inline",
          },
        });
      }),
    );
  });

  it.effect("rejects --enable when package conversion was not requested", () => {
    const { provide } = makeLayers();
    writeWorkspaceFiles(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          handleMcpsImport({ yes: true, preview: false, enable: true }),
        );
        if (!(error instanceof AppError)) throw new Error("Expected an AppError");

        expect(error.code).toBe("usage");
        expect(error.detail).toContain("--enable requires --as");
      }),
    );
  });
});
