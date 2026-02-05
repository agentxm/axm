/**
 * Kimi Code CLI agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import * as Option from "effect/Option";
import { home } from "../constants.js";
import type { AgentConfig } from "../types.js";

/**
 * Kimi Code CLI agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "kimi-cli",
  name: "Kimi Code CLI",
  skills: {
    projectDir: ".agents/skills",
    globalDir: Option.some(path.join(home, ".config/agents/skills")),
  },
};
