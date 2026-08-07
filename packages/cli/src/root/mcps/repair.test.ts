import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";

import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  planResultSteps,
} from "../../test-helpers.js";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import { handleRepairMcpServer } from "./repair.js";

const writeJson = (filePath: string, value: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

describe("mcps repair", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcps-repair-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeContext = () => {
    const context = makeWorkspaceHandlerTestContext({ machine: true });
    return {
      ...context,
      provide: makeEffectProvide(context.fullLayer),
    };
  };

  const writeDriftedInlineServer = () => {
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    writeJson(path.join(tempDir, ".axm", "settings.json"), {
      agents: ["claude-code"],
      mcpServers: {
        demo: {
          enabled: true,
          command: "node",
          args: ["server.js"],
          env: {},
        },
      },
    });
    writeJson(path.join(tempDir, ".mcp.json"), {
      mcpServers: {
        demo: {
          "x-axm": { managed: true, source: "inline" },
          type: "stdio",
          command: "python",
        },
      },
    });
  };

  it.effect("previews the exact drifted native target without mutating it", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeContext();
      writeDriftedInlineServer();

      yield* provide(handleRepairMcpServer({ name: "demo", yes: false, preview: true }));

      const result = expectPreviewedPlanResult(rendererState.results[0]?.data, {
        planName: "Repair MCP server native config",
        totalSteps: 1,
      });
      expect(planResultSteps(result)).toMatchObject([
        {
          label: "Repair MCP server demo",
          status: "ready",
          artifact: {
            path: "native MCP config targets",
            targets: [{ path: ".mcp.json", agentIds: ["claude-code"] }],
          },
        },
      ]);
      expect(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8")).toContain('"python"');
    }),
  );

  it.effect("repairs only the selected inline server and becomes a no-op", () =>
    Effect.gen(function* () {
      const { provide, rendererState } = makeContext();
      writeDriftedInlineServer();

      yield* provide(handleRepairMcpServer({ name: "demo", yes: true, preview: false }));

      expectAppliedPlanResult(rendererState.results[0]?.data, {
        planName: "Repair MCP server native config",
        totalSteps: 1,
      });
      const repaired = JSON.parse(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8"));
      expect(repaired.mcpServers.demo.command).toBe("node");

      yield* provide(handleRepairMcpServer({ name: "demo", yes: true, preview: false }));
      expectNoOpPlanResult(rendererState.results[1]?.data, {
        planName: "Repair MCP server native config",
        message: 'MCP server "demo" native config is already current',
      });
    }),
  );
});
