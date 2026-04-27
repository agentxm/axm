/**
 * CodeBuddy agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * CodeBuddy agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "codebuddy",
  name: "CodeBuddy",
  rootDir: ".codebuddy",
  skills: {
    dir: ".codebuddy/skills",
  },
};
