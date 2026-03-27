/**
 * Gemini CLI coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Effect from "effect/Effect";
import { envOption } from "../../utils/index.js";
import type { CodingAgent } from "../coding-agent.js";
import { addMcpServerMixed, type MixedStrategyConfig, removeMcpServerMixed } from "../mcp-sync.js";

const GEMINI_DOCS_DEFAULT_DIR = ".gemini/skills";
const GEMINI_ENV_OVERRIDE = "AXM_GEMINI_CLI_SKILLS_DIR";

export const geminiCliMcpStrategy: MixedStrategyConfig = {
  configPath: "{workspaceRoot}/.gemini/mcp.json",
  cliAdd: ["gemini", "mcp", "add", "{serverName}"],
  cliRemove: ["gemini", "mcp", "remove", "{serverName}"],
};

export const geminiCliCodingAgent: CodingAgent = {
  id: "gemini-cli",
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const runtimeOverrideOpt = yield* envOption(GEMINI_ENV_OVERRIDE);
      const runtimeOverride = Option.getOrUndefined(runtimeOverrideOpt);
      if (runtimeOverride !== undefined && runtimeOverride.trim().length === 0) {
        return {
          _tag: "misconfigured",
          reason: `${GEMINI_ENV_OVERRIDE} is set but empty`,
        } as const;
      }

      const configuredDir = runtimeOverride ?? GEMINI_DOCS_DEFAULT_DIR;
      return {
        _tag: "supported",
        dir: path.resolve(workspaceRoot, configuredDir),
      } as const;
    }),
  addMcpServer: (args) => addMcpServerMixed(geminiCliMcpStrategy, args),
  removeMcpServer: (args) => removeMcpServerMixed(geminiCliMcpStrategy, args),
};
