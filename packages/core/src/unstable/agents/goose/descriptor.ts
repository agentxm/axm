/**
 * Goose agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Goose agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "goose",
  name: "Goose",
  rootDir: ".goose",
  skills: {
    dir: ".goose/skills",
  },
};
