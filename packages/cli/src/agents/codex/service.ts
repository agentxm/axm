/**
 * Codex coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import type { CodingAgent } from "../coding-agent.js";
import { addMcpServerMixed, type MixedStrategyConfig, removeMcpServerMixed } from "../mcp-sync.js";

export const codexMcpStrategy: MixedStrategyConfig = {
  configPath: "{workspaceRoot}/.codex/mcp.json",
  cliAdd: ["codex", "mcp", "add", "{serverName}"],
  cliRemove: ["codex", "mcp", "remove", "{serverName}"],
};

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
  addMcpServer: (args) => addMcpServerMixed(codexMcpStrategy, args),
  removeMcpServer: (args) => removeMcpServerMixed(codexMcpStrategy, args),
};
