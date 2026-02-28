/**
 * OpenCode coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import type { CodingAgent } from "../coding-agent.js";
import { addMcpServerConfigOnly, removeMcpServerConfigOnly } from "../mcp-sync.js";

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
  addMcpServer: (args) => addMcpServerConfigOnly("{workspaceRoot}/.opencode/mcp.json", args),
  removeMcpServer: (args) => removeMcpServerConfigOnly("{workspaceRoot}/.opencode/mcp.json", args),
};
