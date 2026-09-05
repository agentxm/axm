import { rmSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import * as FileSystem from "effect/FileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { codingAgentForId } from "./repository.js";
import { handle } from "../test-helpers.js";

const mcpSyncTimeoutMs = 20_000;
const claudeCodeCodingAgent = codingAgentForId("claude-code");
const codexCodingAgent = codingAgentForId("codex");
const geminiCliCodingAgent = codingAgentForId("gemini-cli");

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
        if (outcome._tag === "supported") {
          expect(outcome.dir).toContain(".agents/skills");
        }
      }),
    ),
  );

  it.effect("codex resolves skills directory", () =>
    withNode(
      Effect.gen(function* () {
        const outcome = yield* codexCodingAgent.resolveEffectiveSkillsDir({
          workspaceRoot: "/workspace",
        });

        expect(outcome._tag).toBe("supported");
        if (outcome._tag === "supported") {
          expect(outcome.dir).toContain(".agents/skills");
        }
      }),
    ),
  );

  it.effect(
    "claude-code MCP add/remove uses success contract",
    () =>
      withNode(
        Effect.gen(function* () {
          const workspaceRoot = mkdtempSync(nodePath.join(tmpdir(), "axm-claude-code-test-"));
          try {
            const canonicalPath = `${workspaceRoot}/agent_extensions/mcp/mcps/chrome-devtools-mcp`;
            mkdirSync(canonicalPath, { recursive: true });
            writeFileSync(
              `${canonicalPath}/mcp.json`,
              JSON.stringify({
                owner: "@mcp",
                type: "mcp-server",
                name: "chrome-devtools-mcp",
                version: "1.0.0",
                server: {
                  name: "io.github.mcp/chrome-devtools-mcp",
                  description: "Chrome DevTools MCP server",
                  version: "1.0.0",
                  packages: [
                    {
                      registryType: "npm",
                      identifier: "chrome-devtools-mcp",
                      version: "1.0.0",
                      transport: { type: "stdio" },
                    },
                  ],
                },
              }),
            );
            const addOutcome = yield* claudeCodeCodingAgent.addMcpServer({
              workspaceRoot,
              serverName: "chrome-devtools-mcp",
              canonicalPath,
              owner: handle("@mcp"),
              resolvedVersion: "1.0.0",
            });
            expect(addOutcome._tag).toBe("success");

            const fs = yield* FileSystem.FileSystem;
            const addedConfig = yield* fs.readFileString(`${workspaceRoot}/.mcp.json`);
            expect(addedConfig).toContain('"chrome-devtools-mcp"');

            const removeOutcome = yield* claudeCodeCodingAgent.removeMcpServer({
              workspaceRoot,
              serverName: "chrome-devtools-mcp",
            });
            expect(removeOutcome._tag).toBe("success");

            const removedConfig = yield* fs.readFileString(`${workspaceRoot}/.mcp.json`);
            expect(removedConfig).not.toContain('"chrome-devtools-mcp"');
          } finally {
            rmSync(workspaceRoot, { recursive: true, force: true });
          }
        }),
      ),
    { timeout: mcpSyncTimeoutMs },
  );
});
