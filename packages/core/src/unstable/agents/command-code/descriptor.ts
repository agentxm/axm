/**
 * Command Code agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Command Code agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "command-code",
  name: "Command Code",
  rootDir: ".commandcode",
  skills: {
    dir: ".commandcode/skills",
  },
};
