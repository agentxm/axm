/**
 * Goose agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import * as Option from "effect/Option";
import { configHome } from "../constants.js";
import type { AgentConfig } from "../types.js";

/**
 * Goose agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "goose",
  name: "Goose",
  skills: {
    projectDir: ".goose/skills",
    globalDir: Option.some(path.join(configHome, "goose/skills")),
  },
};
