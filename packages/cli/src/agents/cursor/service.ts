/**
 * Cursor coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import type { CodingAgent } from "../coding-agent.js";
import { addMcpServerMixed, type MixedStrategyConfig, removeMcpServerMixed } from "../mcp-sync.js";

export const cursorMcpStrategy: MixedStrategyConfig = {
  configPath: "{workspaceRoot}/.cursor/mcp.json",
  cliAdd: ["cursor", "mcp", "add", "{serverName}"],
  cliRemove: ["cursor", "mcp", "remove", "{serverName}"],
};

export const cursorCodingAgent: CodingAgent = {
  id: "cursor",
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, ".cursor/skills"),
      } as const;
    }),
  addMcpServer: (args) => addMcpServerMixed(cursorMcpStrategy, args),
  removeMcpServer: (args) => removeMcpServerMixed(cursorMcpStrategy, args),
};
