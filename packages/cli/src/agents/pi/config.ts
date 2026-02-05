/**
 * Pi agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import * as Option from "effect/Option";
import { home } from "../constants.js";
import type { AgentConfig } from "../types.js";

/**
 * Pi agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "pi",
  name: "Pi",
  skills: {
    projectDir: ".pi/skills",
    globalDir: Option.some(path.join(home, ".pi/agent/skills")),
  },
};
