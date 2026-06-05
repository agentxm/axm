import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
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
        yield* handleMcpsImport({ yes: false, force: false, preview: false });

        expect(logs.success).toEqual(["No unmanaged MCP servers imported."]);
      }),
    );
  });

  it.effect("reports no unmanaged MCP servers as JSON no-op", () => {
    const { provide, logs, rendererState } = makeLayers({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"));

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsImport({ yes: false, force: false, preview: false });

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
        yield* handleMcpsImport({ yes: false, force: false, preview: false });

        const result = expectAppliedPlanResult(rendererState.results[0]?.data, {
          planName: "Import MCP servers",
        });
        expect(result).toMatchObject({
          steps: [
            {
              label: "demo",
              status: "applied",
              message: "Imported demo",
              artifact: {
                path: ".axm/settings.json:mcpServers.demo",
                scope: "project",
                change: "created",
                fileCount: 2,
                targets: [{ path: ".axm (config/lockfile)", change: "updated" }],
              },
            },
          ],
        });
      }),
    );
  });

  it.effect("reports imported MCP servers with explicit config artifact summary", () => {
    const { provide, logs, rendererState } = makeLayers();
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    writeMcpConfig();

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsImport({ yes: false, force: false, preview: false });

        expect(logs.success).toEqual(["Imported 1 MCP server"]);
        expect(rendererState.summaries).toEqual([
          "demo   created   2 files   .axm (config/lockfile) (updated)",
        ]);
        expect(rendererState.suggestions).toEqual([
          { description: "Inspect MCP servers", cmd: "axm mcps list" },
          { description: "Undo", cmd: "axm mcps uninstall demo" },
        ]);
      }),
    );
  });
});
