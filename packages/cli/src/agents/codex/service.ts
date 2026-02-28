/**
 * Codex coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import type { CodingAgent } from "../coding-agent.js";
import { addMcpServerMixed, removeMcpServerMixed } from "../mcp-sync.js";

export const codexCodingAgent: CodingAgent = {
  id: "codex",
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, ".codex/skills"),
      } as const;
    }),
  addMcpServer: (args) =>
    addMcpServerMixed(
      {
        configPath: "{workspaceRoot}/.codex/mcp.json",
        cliAdd: ["codex", "mcp", "add", "{serverName}"],
        cliRemove: ["codex", "mcp", "remove", "{serverName}"],
      },
      args,
    ),
  removeMcpServer: (args) =>
    removeMcpServerMixed(
      {
        configPath: "{workspaceRoot}/.codex/mcp.json",
        cliAdd: ["codex", "mcp", "add", "{serverName}"],
        cliRemove: ["codex", "mcp", "remove", "{serverName}"],
      },
      args,
    ),
};
