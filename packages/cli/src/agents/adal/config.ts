/**
 * AdaL agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * AdaL agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "adal",
  name: "AdaL",
  skills: {
    dir: ".adal/skills",
  },
};
