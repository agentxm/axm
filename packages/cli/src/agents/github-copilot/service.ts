/**
 * GitHub Copilot coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import type { CodingAgent } from "../coding-agent.js";
import { addMcpServerMixed, type MixedStrategyConfig, removeMcpServerMixed } from "../mcp-sync.js";

export const githubCopilotMcpStrategy: MixedStrategyConfig = {
  configPath: "{workspaceRoot}/.github/mcp.json",
  cliAdd: ["gh", "copilot", "mcp", "add", "{serverName}"],
  cliRemove: ["gh", "copilot", "mcp", "remove", "{serverName}"],
};

export const githubCopilotCodingAgent: CodingAgent = {
  id: "github-copilot",
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, ".github/skills"),
      } as const;
    }),
  addMcpServer: (args) => addMcpServerMixed(githubCopilotMcpStrategy, args),
  removeMcpServer: (args) => removeMcpServerMixed(githubCopilotMcpStrategy, args),
};
