/**
 * Roo Code coding-agent service implementation.
 *
 * Roo Code uses read-modify-write on `.roomodes` for subagents.
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
import { addRooSubagent, removeRooSubagent } from "../subagent-sync.js";
import {
  agentCommandsProjectDir,
  agentSkillsProjectDir,
  agentSubagentsProjectDir,
} from "../descriptor-paths.js";

/** @experimental */
export const ROO_COMMANDS_PROJECT_DIR = agentCommandsProjectDir("roo");

/** @experimental */
export const ROO_ROOMODES_FILE = agentSubagentsProjectDir("roo");

const rooCommandConfig: CommandSyncConfig = {
  agentId: "roo",
};

export const rooCodingAgent: CodingAgent = {
  id: "roo",
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, agentSkillsProjectDir("roo")),
      } as const;
    }),
  addMcpServer: () =>
    Effect.succeed({
      _tag: "unsupported",
      reason: "MCP add is not supported for roo",
    } as const),
  removeMcpServer: () =>
    Effect.succeed({
      _tag: "unsupported",
      reason: "MCP remove is not supported for roo",
    } as const),
  resolveEffectiveCommandsDir: ({ workspaceRoot, scope }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (scope === "user") {
        return {
          _tag: "unsupported",
          reason: "Roo Code does not support user-scope commands",
        } as const;
      }
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, ROO_COMMANDS_PROJECT_DIR),
        warnings: [],
      } as const;
    }),
  addCommand: (args) =>
    addCommandViaResolve(rooCodingAgent.resolveEffectiveCommandsDir(args), args, rooCommandConfig),
  removeCommand: (args) =>
    removeCommandViaResolve(
      rooCodingAgent.resolveEffectiveCommandsDir(args),
      args,
      rooCommandConfig,
    ),
  resolveEffectiveSubagentsDir: ({ workspaceRoot, scope }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (scope === "user") {
        return {
          _tag: "unsupported",
          reason: "Roo Code does not support user-scope subagents",
        } as const;
      }
      // Roo Code uses .roomodes file, not a directory
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, ROO_ROOMODES_FILE),
        warnings: [],
      } as const;
    }),
  addSubagent: (args) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (args.scope === "user") {
        return {
          _tag: "unsupported",
          reason: "Roo Code does not support user-scope subagents",
        } as const;
      }
      const roomodesPath = path.resolve(args.workspaceRoot, ROO_ROOMODES_FILE);
      return yield* addRooSubagent(roomodesPath, args);
    }),
  removeSubagent: (args) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      if (args.scope === "user") {
        return {
          _tag: "unsupported",
          reason: "Roo Code does not support user-scope subagents",
        } as const;
      }
      const roomodesPath = path.resolve(args.workspaceRoot, ROO_ROOMODES_FILE);
      return yield* removeRooSubagent(roomodesPath, args.subagentName);
    }),
};
