/**
 * Codex agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import * as Option from "effect/Option";
import type { AgentConfig } from "../types.js";
import { codexHome } from "./constants.js";

/**
 * Codex agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "codex",
  name: "Codex",
  skills: {
    projectDir: ".codex/skills",
    globalDir: Option.some(path.join(codexHome, "skills")),
  },
};
