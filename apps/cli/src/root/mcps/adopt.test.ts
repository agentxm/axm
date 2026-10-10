import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { readNativeMcpServers } from "@agentxm/workspace-kernel/agent-adapters";
import { afterEach, beforeEach } from "vitest";

import { writeWorkspaceFiles } from "../../test-support/test-stubs.js";
import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  makeWorkspaceLifecycleTestContext,
} from "../../test-support/test-helpers.js";
import { handleMcpsAdopt } from "./adopt.js";

describe("mcps adopt output", () => {
  let tempDir: string;
  let originalCwd: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    originalHome = process.env["HOME"];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcps-import-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalHome === undefined) {
      delete process.env["HOME"];
    } else {
      process.env["HOME"] = originalHome;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeLayers = (opts?: Parameters<typeof makeWorkspaceLifecycleTestContext>[0]) => {
    const ctx = makeWorkspaceLifecycleTestContext(opts);
    return {
      ...ctx,
      provide: ctx.provide,
    };
  };

  const writeMcpConfig = () => {
    writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: ["gemini-cli"] });
    fs.mkdirSync(path.join(tempDir, ".gemini"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, ".gemini", "settings.json"),
      JSON.stringify(
        {
          mcpServers: {
            demo: {
              command: "node",
              args: ["server.js"],
              env: { DEMO_TOKEN: "${DEMO_TOKEN}" },
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
        yield* handleMcpsAdopt({ preview: false });

        expect(logs.success).toEqual(["No unmanaged MCP servers adopted."]);
      }),
    );
  });

  it.effect("reports no unmanaged MCP servers as JSON no-op", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsAdopt({ preview: false });

        expect(logs.success).toEqual([]);
        expectNoOpPlanResult(rendererState.results[0]?.data, {
          planName: "Adopt MCP servers",
          message: "No unmanaged MCP servers adopted.",
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
        yield* handleMcpsAdopt({ preview: false });

        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Adopt MCP servers",
        });
        expect(result).toMatchObject({
          adoptions: { adopted: 1, skipped: 0, conflicting: 0 },
          units: [
            {
              id: "Adopt 1 MCP server",
              label: "Adopt 1 MCP server",
              state: "committed",
              message: "Adopted 1 MCP server",
              artifact: {
                path: "axm.json",
                scope: "project",
                change: "updated",
                fileCount: 2,
                targets: [{ path: ".gemini/settings.json", change: "updated" }],
              },
            },
          ],
        });
        const config = JSON.parse(
          fs.readFileSync(path.join(tempDir, ".gemini/settings.json"), "utf8"),
        );
        expect(config.mcpServers.demo).toEqual({
          command: "node",
          args: ["server.js"],
          env: { DEMO_TOKEN: "${DEMO_TOKEN}" },
        });
        const settings = JSON.parse(fs.readFileSync(path.join(tempDir, "axm.json"), "utf8"));
        expect(settings.mcpServers.demo.connection.env).toEqual({
          DEMO_TOKEN: { env: "DEMO_TOKEN" },
        });
        expect(settings.mcpServers.demo).not.toHaveProperty("agents");
        expect(JSON.stringify(settings)).not.toContain("secret-value");
      }),
    );
  });

  it.effect("adopts a JSONC entry without discarding nearby comments", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    fs.writeFileSync(
      path.join(tempDir, "axm.json"),
      JSON.stringify({ agents: ["pochi"], mcpServers: {} }),
    );
    fs.mkdirSync(path.join(tempDir, ".pochi"), { recursive: true });
    const configPath = path.join(tempDir, ".pochi", "config.jsonc");
    fs.writeFileSync(
      configPath,
      '{\n  // Keep this user comment\n  "mcp": {\n    "demo": { "command": "node", "args": ["server.js"] }\n  }\n}\n',
    );

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsAdopt({ preview: false });

        expect(rendererState.results[0]?.data).toMatchObject({
          result: { adoptions: { adopted: 1, skipped: 0, conflicting: 0 } },
        });
        const updated = fs.readFileSync(configPath, "utf8");
        expect(updated).toContain("// Keep this user comment");
        expect(updated).not.toContain('"x-axm"');
        const servers = yield* readNativeMcpServers({
          format: "jsonc",
          configPath,
          raw: updated,
          serversPath: ["mcp"] as const,
        });
        expect(servers).toMatchObject({ demo: { command: "node", args: ["server.js"] } });
      }),
    );
  });

  it.effect("imports a symbolic secret accepted by every shared native reader", () => {
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    const configBefore = JSON.stringify({
      mcpServers: {
        demo: { command: "node", args: ["server.js"], env: { TOKEN: "${TOKEN}" } },
      },
    });
    fs.writeFileSync(path.join(tempDir, ".mcp.json"), configBefore);
    const { provide, rendererState } = makeLayers({ machine: true });
    return provide(
      Effect.gen(function* () {
        yield* handleMcpsAdopt({ preview: false });
        expect(rendererState.results[0]?.data).toMatchObject({
          result: { adoptions: { adopted: 1, skipped: 0, conflicting: 0 } },
        });
        const settings = fs.readFileSync(path.join(tempDir, "axm.json"), "utf8");
        const native = fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8");
        expect(settings).toContain('"env": "TOKEN"');
        expect(native).toContain("${TOKEN}");
        for (const output of [settings, native, JSON.stringify(rendererState.results)])
          expect(output).not.toContain("private-value");
      }),
    );
  });

  it.effect("adopts a home-relative YAML target in user scope", () => {
    const homeDir = path.join(tempDir, "home");
    process.env["HOME"] = homeDir;
    writeWorkspaceFiles(path.join(homeDir, ".axm"), { scope: "user", agents: ["hermes"] });
    fs.mkdirSync(path.join(homeDir, ".hermes"), { recursive: true });
    const configPath = path.join(homeDir, ".hermes", "config.yaml");
    fs.writeFileSync(
      configPath,
      "# Keep this user comment\nmcp_servers:\n  demo:\n    enabled: true\n    command: node\n    args: [server.js]\n",
    );
    const { provide, rendererState } = makeLayers({
      machine: true,
      wsOptions: { scope: "user", projectRoot: tempDir },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsAdopt({ preview: false });

        expect(rendererState.results[0]?.data).toMatchObject({
          result: { adoptions: { adopted: 1, skipped: 0, conflicting: 0 } },
        });
        const updated = fs.readFileSync(configPath, "utf8");
        expect(updated).toContain("# Keep this user comment");
        expect(updated).not.toContain("x-axm:");
        expect(fs.existsSync(path.join(tempDir, ".hermes", "config.yaml"))).toBe(false);
      }),
    );
  });

  it.effect("produces a deterministic redacted preview without changing source files", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"), { agents: ["gemini-cli"] });
    fs.mkdirSync(path.join(tempDir, ".gemini"), { recursive: true });
    const originalConfig = JSON.stringify({
      mcpServers: {
        zebra: { command: "node", args: ["zebra.js"] },
        alpha: { command: "node", args: ["alpha.js"], env: { TOKEN: "${TOKEN}" } },
      },
    });
    fs.writeFileSync(path.join(tempDir, ".gemini/settings.json"), originalConfig);

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsAdopt({ preview: true });

        expect(rendererState.results[0]?.data).toMatchObject({
          result: {
            outcome: "previewed",
            adoptions: { adopted: 0, skipped: 0, conflicting: 0 },
            units: [{ label: "Adopt 2 MCP servers", message: "Candidates: alpha, zebra" }],
          },
        });
        expect(JSON.stringify(rendererState.results[0]?.data)).not.toContain("private-value");
        expect(fs.readFileSync(path.join(tempDir, ".gemini/settings.json"), "utf8")).toBe(
          originalConfig,
        );
      }),
    );
  });

  it.effect("is idempotent and reports an already imported server as skipped", () => {
    const { provide, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    writeMcpConfig();

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsAdopt({ preview: false });
        const settingsAfterImport = fs.readFileSync(path.join(tempDir, "axm.json"), "utf8");
        yield* handleMcpsAdopt({ preview: false });

        expect(rendererState.results[1]?.data).toMatchObject({
          result: {
            outcome: "no-op",
            adoptions: { adopted: 0, skipped: 1, conflicting: 0 },
          },
        });
        expect(fs.readFileSync(path.join(tempDir, "axm.json"), "utf8")).toBe(settingsAfterImport);
      }),
    );
  });

  it.effect("refuses unsupported native fields without exposing their values", () => {
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
        yield* handleMcpsAdopt({ preview: false });

        expect(rendererState.results[0]?.data).toMatchObject({
          result: {
            outcome: "blocked",
            adoptions: { adopted: 0, skipped: 0, conflicting: 1 },
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
        yield* handleMcpsAdopt({ preview: false });

        expect(logs.success).toEqual(["Adopted 1 MCP server"]);
        expect(rendererState.summaries).toEqual([
          "Adopt 1 MCP server   updated   2 files, axm.json",
        ]);
        expect(rendererState.suggestions).toEqual([
          { description: "Inspect installed MCP servers", cmd: "axm mcps list" },
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
          yield* handleMcpsAdopt({ preview: false });

          expect(promptState.confirmCalls).toEqual([]);
          expect(rendererState.results[0]?.data).toMatchObject({
            result: {
              outcome: "blocked",
              blocking: { class: "precondition-unmet" },
              adoptions: { adopted: 0, skipped: 0, conflicting: 1 },
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
        // The Cursor MCP configuration is read-only, so the adoption write it
        // must make cannot land: a real failure of the import transaction.
        fs.chmodSync(path.join(tempDir, ".cursor", "mcp.json"), 0o444);

        yield* handleMcpsAdopt({ preview: false });

        expect(rendererState.results[0]?.data).toMatchObject({
          result: { outcome: "failed", adoptions: { adopted: 0, conflicting: 0 } },
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
        yield* handleMcpsAdopt({ preview: false });

        expect(promptState.confirmCalls).toEqual([]);
        expect(rendererState.results[0]?.data).toMatchObject({
          result: { outcome: "applied", adoptions: { adopted: 1 } },
        });
        const config = JSON.parse(
          fs.readFileSync(path.join(tempDir, ".gemini/settings.json"), "utf8"),
        );
        expect(config.mcpServers.demo).toEqual({
          command: "node",
          args: ["server.js"],
          env: { DEMO_TOKEN: "${DEMO_TOKEN}" },
        });
      }),
    );
  });
});
