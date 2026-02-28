/**
 * OpenCode coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import type { CodingAgent } from "../coding-agent.js";
import {
  addMcpServerConfigFirst,
  type ConfigFirstStrategy,
  removeMcpServerConfigFirst,
} from "../mcp-sync.js";

export const opencodeMcpStrategy: ConfigFirstStrategy = {
  configPath: "{workspaceRoot}/.opencode/mcp.json",
  verifyCommand: ["opencode", "mcp", "list"],
};

export const opencodeCodingAgent: CodingAgent = {
  id: "opencode",
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, ".opencode/skills"),
      } as const;
    }),
  addMcpServer: (args) => addMcpServerConfigFirst(opencodeMcpStrategy, args),
  removeMcpServer: (args) => removeMcpServerConfigFirst(opencodeMcpStrategy, args),
};
