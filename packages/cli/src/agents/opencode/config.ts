/**
 * OpenCode agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import * as Option from "effect/Option";
import { configHome } from "../constants.js";
import type { AgentConfig } from "../types.js";

/**
 * OpenCode agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "opencode",
  name: "OpenCode",
  skills: {
    projectDir: ".opencode/skills",
    globalDir: Option.some(path.join(configHome, "opencode/skills")),
  },
};
