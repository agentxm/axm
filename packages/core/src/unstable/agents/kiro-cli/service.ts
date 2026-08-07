/**
 * Kiro CLI coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import type { CodingAgent } from "../coding-agent.js";
import { userScopeRefusal } from "../scope-refusal.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "../mcp-sync.js";
import { addSubagentViaResolve, removeSubagentViaResolve } from "../subagent-sync.js";
import { agentSkillsProjectDir, agentSubagentsProjectDir } from "../descriptor-paths.js";

/** @experimental */
export const KIRO_SUBAGENTS_PROJECT_DIR = agentSubagentsProjectDir("kiro-cli");

/**
 * Kiro CLI coding-agent. Subagents use the rendering engine which handles
 * dual-format output (IDE .md + CLI .json).
 */
export const kiroCliCodingAgent: CodingAgent = {
  id: "kiro-cli",
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, agentSkillsProjectDir("kiro-cli")),
      } as const;
    }),
  addMcpServer: (args) => addMcpServerFromManifest("kiro-cli", args),
  removeMcpServer: (args) => removeMcpServerFromManifest("kiro-cli", args),
  resolveEffectiveSubagentsDir: ({ workspaceRoot, scope }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (scope === "user") {
        return {
          _tag: "unsupported",
          reason: userScopeRefusal({ agentId: "kiro-cli", agentName: "Kiro", type: "subagents" }),
        } as const;
      }
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, KIRO_SUBAGENTS_PROJECT_DIR),
        warnings: [],
      } as const;
    }),
  addSubagent: (args) =>
    addSubagentViaResolve(
      kiroCliCodingAgent.resolveEffectiveSubagentsDir(args),
      // Remap agentId to "kiro" so the rendering engine selects dual-format (IDE .md + CLI .json)
      { ...args, input: { ...args.input, agentId: "kiro" } },
    ),
  removeSubagent: (args) =>
    removeSubagentViaResolve(kiroCliCodingAgent.resolveEffectiveSubagentsDir(args), args),
};
