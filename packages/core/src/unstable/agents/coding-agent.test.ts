import { rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "effect/FileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { claudeCodeMcpStrategy, claudeCodeCodingAgent } from "./claude-code/service.js";
import { codexMcpStrategy } from "./codex/service.js";
import { cursorMcpStrategy } from "./cursor/service.js";
import { geminiCliMcpStrategy, geminiCliCodingAgent } from "./gemini-cli/service.js";
import { githubCopilotMcpStrategy } from "./github-copilot/service.js";
import { opencodeMcpStrategy, opencodeCodingAgent } from "./opencode/service.js";
import { handle } from "../test-helpers.js";

const opencodeMcpSyncTimeoutMs = 20_000;

describe("coding-agent services", () => {
  const TestLayer = NodeServices.layer;
  const withNode = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provide(TestLayer));

  it.effect("claude-code resolves supported directory by default", () =>
    withNode(
      Effect.gen(function* () {
        const outcome = yield* claudeCodeCodingAgent.resolveEffectiveSkillsDir({
          workspaceRoot: "/workspace",
        });

        expect(outcome._tag).toBe("supported");
        if (outcome._tag === "supported") {
          expect(outcome.dir).toContain(".claude/skills");
        }
      }),
    ),
  );

  it.effect("gemini-cli resolves skills directory", () =>
    withNode(
      Effect.gen(function* () {
        const outcome = yield* geminiCliCodingAgent.resolveEffectiveSkillsDir({
          workspaceRoot: "/workspace",
        });

        expect(outcome._tag).toBe("supported");
      }),
    ),
  );

  it.effect(
    "opencode MCP add/remove uses success contract",
    () =>
      withNode(
        Effect.gen(function* () {
          const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-opencode-test-"));
          try {
            const addOutcome = yield* opencodeCodingAgent.addMcpServer({
              workspaceRoot,
              serverName: "chrome-devtools-mcp",
              canonicalPath: `${workspaceRoot}/.axm/mcp-servers/chrome-devtools-mcp`,
              owner: handle("@mcp"),
              resolvedVersion: "1.0.0",
            });
            expect(addOutcome._tag).toBe("success");

            const fs = yield* FileSystem.FileSystem;
            const addedConfig = yield* fs.readFileString(`${workspaceRoot}/.opencode/mcp.json`);
            expect(addedConfig).toContain('"chrome-devtools-mcp"');

            const removeOutcome = yield* opencodeCodingAgent.removeMcpServer({
              workspaceRoot,
              serverName: "chrome-devtools-mcp",
            });
            expect(removeOutcome._tag).toBe("success");

            const removedConfig = yield* fs.readFileString(`${workspaceRoot}/.opencode/mcp.json`);
            expect(removedConfig).not.toContain('"chrome-devtools-mcp"');
          } finally {
            rmSync(workspaceRoot, { recursive: true, force: true });
          }
        }),
      ),
    { timeout: opencodeMcpSyncTimeoutMs },
  );

  it("defines required agent MCP command/config contracts", () => {
    expect(claudeCodeMcpStrategy).toMatchObject({
      configPath: "{workspaceRoot}/.claude/mcp.json",
      cliAdd: ["claude", "mcp", "add", "{serverName}"],
      cliRemove: ["claude", "mcp", "remove", "{serverName}"],
    });
    expect(codexMcpStrategy).toMatchObject({
      configPath: "{workspaceRoot}/.codex/mcp.json",
      cliAdd: ["codex", "mcp", "add", "{serverName}"],
      cliRemove: ["codex", "mcp", "remove", "{serverName}"],
    });
    expect(geminiCliMcpStrategy).toMatchObject({
      configPath: "{workspaceRoot}/.gemini/mcp.json",
      cliAdd: ["gemini", "mcp", "add", "{serverName}"],
      cliRemove: ["gemini", "mcp", "remove", "{serverName}"],
    });
    expect(githubCopilotMcpStrategy).toMatchObject({
      configPath: "{workspaceRoot}/.github/mcp.json",
      cliAdd: ["gh", "copilot", "mcp", "add", "{serverName}"],
      cliRemove: ["gh", "copilot", "mcp", "remove", "{serverName}"],
    });
    expect(cursorMcpStrategy).toMatchObject({
      configPath: "{workspaceRoot}/.cursor/mcp.json",
      cliAdd: ["cursor", "mcp", "add", "{serverName}"],
      cliRemove: ["cursor", "mcp", "remove", "{serverName}"],
    });
    expect(opencodeMcpStrategy).toMatchObject({
      configPath: "{workspaceRoot}/.opencode/mcp.json",
      verifyCommand: ["opencode", "mcp", "list"],
    });
  });
});
