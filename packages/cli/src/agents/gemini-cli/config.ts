/**
 * Gemini CLI agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import * as Option from "effect/Option";
import { home } from "../constants.js";
import type { AgentConfig } from "../types.js";

/**
 * Gemini CLI agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "gemini-cli",
  name: "Gemini CLI",
  skills: {
    projectDir: ".gemini/skills",
    globalDir: Option.some(path.join(home, ".gemini/skills")),
  },
};
