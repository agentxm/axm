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
import { handleMcpsDoctor } from "./doctor.js";
import { handleGetMcpServer } from "./get.js";

const writeJson = (filePath: string, value: unknown) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
};

const writeSettings = (baseDir: string, value: unknown) => {
  writeJson(path.join(baseDir, ".axm", "settings.json"), value);
};

describe("mcps get/doctor output", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcps-get-doctor-test-"));
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
          managedBy: "axm",
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

  it.effect("reports and fixes orphaned managed MCP entries", () => {
    const { provide, rendererState } = makeWorkspaceHandlerTestContext({ machine: true });
    writeWorkspaceFiles(path.join(tempDir, ".axm"));
    writeSettings(tempDir, {
      agents: ["claude-code"],
    });
    writeJson(path.join(tempDir, ".mcp.json"), {
      mcpServers: {
        demo: {
          managedBy: "axm",
          type: "stdio",
          command: "node",
        },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsDoctor({ fix: false, preview: false });
        let payload = expectRecord(rendererState.results[0]?.data);
        let doctor = expectRecord(property(payload, "doctor"));
        expect(property(doctor, "orphanCount")).toBe(1);
        const entries = property(doctor, "entries");
        if (!Array.isArray(entries)) throw new Error("Expected doctor.entries array");
        expect(entries).toEqual([
          {
            server: "demo",
            agent: "claude-code",
            status: "orphaned",
            path: ".mcp.json",
            action: "report",
            detail: "not declared in workspace settings",
          },
        ]);

        yield* handleMcpsDoctor({ fix: true, preview: false });
        payload = expectRecord(rendererState.results[1]?.data);
        doctor = expectRecord(property(payload, "doctor"));
        expect(property(doctor, "status")).toBe("fixed");
        const config = JSON.parse(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8"));
        expect(config.mcpServers).toEqual({});
      }),
    );
  });

  it.effect("reports live and drifted MCP entries and rewrites drifted inline entries", () => {
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
          managedBy: "axm",
          type: "stdio",
          command: "python",
        },
      },
    });

    return provide(
      Effect.gen(function* () {
        yield* handleMcpsDoctor({ fix: false, preview: false });

        let payload = expectRecord(rendererState.results[0]?.data);
        let doctor = expectRecord(property(payload, "doctor"));
        expect(property(doctor, "status")).toBe("issues");
        expect(property(doctor, "liveCount")).toBe(0);
        expect(property(doctor, "driftCount")).toBe(1);
        const reportedEntries = property(doctor, "entries");
        if (!Array.isArray(reportedEntries)) throw new Error("Expected doctor.entries array");
        expect(reportedEntries).toEqual([
          {
            server: "demo",
            agent: "claude-code",
            status: "drifted",
            path: ".mcp.json",
            action: "report",
            detail: "fields differ: args, command",
          },
        ]);

        yield* handleMcpsDoctor({ fix: true, preview: false });

        payload = expectRecord(rendererState.results[1]?.data);
        doctor = expectRecord(property(payload, "doctor"));
        expect(property(doctor, "status")).toBe("fixed");
        expect(property(doctor, "driftCount")).toBe(1);
        const fixedEntries = property(doctor, "entries");
        if (!Array.isArray(fixedEntries)) throw new Error("Expected doctor.entries array");
        expect(fixedEntries).toEqual([
          {
            server: "demo",
            agent: "claude-code",
            status: "drifted",
            path: ".mcp.json",
            action: "rewritten",
            detail: "fields differ: args, command",
          },
        ]);
        const config = JSON.parse(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8"));
        expect(config.mcpServers.demo).toEqual({
          managedBy: "axm",
          type: "stdio",
          command: "node",
          args: ["server.js"],
        });

        yield* handleMcpsDoctor({ fix: false, preview: false });

        payload = expectRecord(rendererState.results[2]?.data);
        doctor = expectRecord(property(payload, "doctor"));
        expect(property(doctor, "status")).toBe("clean");
        expect(property(doctor, "liveCount")).toBe(1);
        expect(property(doctor, "driftCount")).toBe(0);
        const liveEntries = property(doctor, "entries");
        if (!Array.isArray(liveEntries)) throw new Error("Expected doctor.entries array");
        expect(liveEntries).toEqual([
          {
            server: "demo",
            agent: "claude-code",
            status: "live",
            path: ".mcp.json",
            action: "none",
            detail: "matches expected",
          },
        ]);
      }),
    );
  });
});
