/**
 * Junie agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import * as Option from "effect/Option";
import { home } from "../constants.js";
import type { AgentConfig } from "../types.js";

/**
 * Junie agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "junie",
  name: "Junie",
  skills: {
    projectDir: ".junie/skills",
    globalDir: Option.some(path.join(home, ".junie/skills")),
  },
};
