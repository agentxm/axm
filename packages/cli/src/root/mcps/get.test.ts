import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach, beforeEach } from "vitest";

import {
  expectNoPlanEnvelope,
  expectRecord,
  makeWorkspaceHandlerTestContext,
  property,
} from "../../test-helpers.js";
import { writeWorkspaceFiles } from "../../test-stubs.js";
import { handleGetMcpServer } from "./get.js";

const writeJson = (filePath: string, value: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const writeSettings = (baseDir: string, value: unknown) => {
  writeJson(path.join(baseDir, ".axm", "settings.json"), value);
};

describe("mcps get output", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcps-get-test-"));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.effect("reports per-agent MCP materialization state as JSON", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    writeSettings(tempDir, {
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
          command: "node",
          args: ["server.js"],
        },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleGetMcpServer({ name: "demo" });

        const payload = expectRecord(rendererState.results[0]?.data);
        expectNoPlanEnvelope(payload);
        const mcpServer = expectRecord(property(payload, "mcpServer"));
        expect(mcpServer["name"]).toBe("demo");
        expect(mcpServer["transport"]).toBe("stdio");
        expect(mcpServer["agents"]).toEqual([
          {
            agent: "claude-code",
            status: "match",
            path: ".mcp.json",
            fields: [],
            warnings: [],
          },
        ]);
      }),
    );
  });
});
