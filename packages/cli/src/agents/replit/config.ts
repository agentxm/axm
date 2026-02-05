/**
 * Replit agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Option from "effect/Option";
import type { AgentConfig } from "../types.js";

/**
 * Replit agent configuration.
 *
 * Note: Replit does not support global installation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "replit",
  name: "Replit",
  skills: {
    projectDir: ".agents/skills",
    globalDir: Option.none(),
  },
};
