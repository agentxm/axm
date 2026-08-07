/**
 * Augment coding-agent service implementation.
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
export const AUGMENT_SUBAGENTS_PROJECT_DIR = agentSubagentsProjectDir("augment");

export const augmentCodingAgent: CodingAgent = {
  id: "augment",
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, agentSkillsProjectDir("augment")),
      } as const;
    }),
  addMcpServer: (args) => addMcpServerFromManifest("augment", args),
  removeMcpServer: (args) => removeMcpServerFromManifest("augment", args),
  resolveEffectiveSubagentsDir: ({ workspaceRoot, scope }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (scope === "user") {
        return {
          _tag: "unsupported",
          reason: userScopeRefusal({ agentId: "augment", agentName: "Augment", type: "subagents" }),
        } as const;
      }
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, AUGMENT_SUBAGENTS_PROJECT_DIR),
        warnings: [],
      } as const;
    }),
  addSubagent: (args) =>
    addSubagentViaResolve(augmentCodingAgent.resolveEffectiveSubagentsDir(args), args),
  removeSubagent: (args) =>
    removeSubagentViaResolve(augmentCodingAgent.resolveEffectiveSubagentsDir(args), args),
};
