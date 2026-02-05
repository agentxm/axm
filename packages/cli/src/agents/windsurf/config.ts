/**
 * Windsurf agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as path from "node:path";
import * as Option from "effect/Option";
import { home } from "../constants.js";
import type { AgentConfig } from "../types.js";
import { detect } from "./detection.js";

/**
 * Windsurf agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "windsurf",
  name: "Windsurf",
  skills: {
    projectDir: ".windsurf/skills",
    globalDir: Option.some(path.join(home, ".codeium/windsurf/skills")),
  },
  detect,
};
