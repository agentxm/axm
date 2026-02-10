/**
 * iFlow CLI agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

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
    dir: ".iflow/skills",
  },
};
