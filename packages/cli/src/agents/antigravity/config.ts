/**
 * Antigravity agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import * as Option from "effect/Option";
import { home } from "../constants.js";
import type { AgentConfig } from "../types.js";

/**
 * Antigravity agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "antigravity",
  name: "Antigravity",
  skills: {
    projectDir: ".agent/skills",
    globalDir: Option.some(path.join(home, ".gemini/antigravity/skills")),
  },
};
