/**
 * Qoder agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * Qoder agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "qoder",
  name: "Qoder",
  skills: {
    dir: ".qoder/skills",
  },
};
