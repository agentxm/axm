/**
 * Gemini CLI coding-agent service implementation.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Path from "@effect/platform/Path";
import * as Effect from "effect/Effect";
import type { CodingAgent } from "../coding-agent.js";

const GEMINI_DOCS_DEFAULT_DIR = ".gemini/skills";
const GEMINI_ENV_OVERRIDE = "AXM_GEMINI_CLI_SKILLS_DIR";

const resolveRuntimeOverride = (): Effect.Effect<string | undefined, never> =>
  Effect.sync(() => process.env[GEMINI_ENV_OVERRIDE]);

export const geminiCliCodingAgent: CodingAgent = {
  id: "gemini-cli",
  resolveEffectiveSkillsDir: ({ workspaceRoot }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const runtimeOverride = yield* resolveRuntimeOverride();
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
};
