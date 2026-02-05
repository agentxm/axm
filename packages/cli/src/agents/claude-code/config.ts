/**
 * Claude Code agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import * as Option from "effect/Option";
import type { AgentConfig } from "../types.js";
import { claudeHome } from "./constants.js";

/**
 * Claude Code agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "claude-code",
  name: "Claude Code",
  skills: {
    projectDir: ".claude/skills",
    globalDir: Option.some(path.join(claudeHome, "skills")),
  },
};
