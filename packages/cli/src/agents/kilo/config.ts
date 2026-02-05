/**
 * Kilo Code agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import * as Option from "effect/Option";
import { home } from "../constants.js";
import type { AgentConfig } from "../types.js";

/**
 * Kilo Code agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "kilo",
  name: "Kilo Code",
  skills: {
    projectDir: ".kilocode/skills",
    globalDir: Option.some(path.join(home, ".kilocode/skills")),
  },
};
