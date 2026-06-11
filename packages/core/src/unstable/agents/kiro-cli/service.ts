/**
 * Kiro CLI coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import type { CodingAgent } from "../coding-agent.js";
import {
  addCommandViaResolve,
  removeCommandViaResolve,
  type CommandSyncConfig,
} from "../command-sync.js";
import { addMcpServerFromManifest, removeMcpServerFromManifest } from "../mcp-sync.js";
import { addSubagentViaResolve, removeSubagentViaResolve } from "../subagent-sync.js";
import {
  agentSkillsDir,
  requiredAgentCommandsDir,
  requiredAgentSubagentsDir,
} from "../descriptor-paths.js";

/** @experimental */
export const KIRO_COMMANDS_PROJECT_DIR = requiredAgentCommandsDir("kiro-cli");

/** @experimental */
export const KIRO_SUBAGENTS_PROJECT_DIR = requiredAgentSubagentsDir("kiro-cli");

const kiroCommandConfig: CommandSyncConfig = {
  agentId: "kiro-cli",
};

/**
 * Kiro CLI coding-agent — project-only for commands, but subagents
 * use the rendering engine which handles dual-format (IDE .md + CLI .json).
 */
export const kiroCliCodingAgent: CodingAgent = {
  id: "kiro-cli",
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, agentSkillsDir("kiro-cli")),
      } as const;
    }),
  addMcpServer: (args) => addMcpServerFromManifest("kiro-cli", args),
  removeMcpServer: (args) => removeMcpServerFromManifest("kiro-cli", args),
  resolveEffectiveCommandsDir: ({ workspaceRoot, scope }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (scope === "user") {
        return {
          _tag: "unsupported",
          reason: "Kiro does not support user-scope commands",
        } as const;
      }
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, KIRO_COMMANDS_PROJECT_DIR),
        warnings: [],
      } as const;
    }),
  addCommand: (args) =>
    addCommandViaResolve(
      kiroCliCodingAgent.resolveEffectiveCommandsDir(args),
      args,
      kiroCommandConfig,
    ),
  removeCommand: (args) =>
    removeCommandViaResolve(
      kiroCliCodingAgent.resolveEffectiveCommandsDir(args),
      args,
      kiroCommandConfig,
    ),
  resolveEffectiveSubagentsDir: ({ workspaceRoot, scope }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (scope === "user") {
        return {
          _tag: "unsupported",
          reason: "Kiro does not support user-scope subagents",
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
