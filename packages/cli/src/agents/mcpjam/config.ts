/**
 * MCPJam agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentConfig } from "../types.js";

/**
 * MCPJam agent configuration.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const config: AgentConfig = {
  id: "mcpjam",
  name: "MCPJam",
  skills: {
    dir: ".mcpjam/skills",
  },
};
