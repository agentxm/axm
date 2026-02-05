/**
 * iFlow CLI agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import * as Option from "effect/Option";
import { home } from "../constants.js";
import type { AgentConfig } from "../types.js";

/**
 * iFlow CLI agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "iflow-cli",
  name: "iFlow CLI",
  skills: {
    projectDir: ".iflow/skills",
    globalDir: Option.some(path.join(home, ".iflow/skills")),
  },
};
