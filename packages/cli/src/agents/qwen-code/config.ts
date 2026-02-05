/**
 * Qwen Code agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import * as Option from "effect/Option";
import { home } from "../constants.js";
import type { AgentConfig } from "../types.js";

/**
 * Qwen Code agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "qwen-code",
  name: "Qwen Code",
  skills: {
    projectDir: ".qwen/skills",
    globalDir: Option.some(path.join(home, ".qwen/skills")),
  },
};
