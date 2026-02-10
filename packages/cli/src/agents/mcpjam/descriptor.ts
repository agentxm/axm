/**
 * MCPJam agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * MCPJam agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "mcpjam",
  name: "MCPJam",
  skills: {
    dir: ".mcpjam/skills",
  },
};
