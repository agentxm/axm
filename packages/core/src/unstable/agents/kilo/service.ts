/**
 * Kilo Code coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import type { CodingAgent } from "../coding-agent.js";
import { userScopeRefusal } from "../scope-refusal.js";
import { addSubagentViaResolve, removeSubagentViaResolve } from "../subagent-sync.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "../mcp-sync.js";
import { agentSkillsProjectDir, agentSubagentsProjectDir } from "../descriptor-paths.js";

/** @experimental */
export const KILO_SUBAGENTS_PROJECT_DIR = agentSubagentsProjectDir("kilo");

export const kiloCodingAgent: CodingAgent = {
  id: "kilo",
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, agentSkillsProjectDir("kilo")),
      } as const;
    }),
  addMcpServer: (args) => addMcpServerFromManifest("kilo", args),
  removeMcpServer: (args) => removeMcpServerFromManifest("kilo", args),
  resolveEffectiveSubagentsDir: ({ workspaceRoot, scope }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (scope === "user") {
        return {
          _tag: "unsupported",
          reason: userScopeRefusal({ agentId: "kilo", agentName: "Kilo Code", type: "subagents" }),
        } as const;
      }
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, KILO_SUBAGENTS_PROJECT_DIR),
        warnings: [],
      } as const;
    }),
  addSubagent: (args) =>
    addSubagentViaResolve(kiloCodingAgent.resolveEffectiveSubagentsDir(args), args),
  removeSubagent: (args) =>
    removeSubagentViaResolve(kiloCodingAgent.resolveEffectiveSubagentsDir(args), args),
};
