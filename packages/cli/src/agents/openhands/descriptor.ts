/**
 * OpenHands agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * OpenHands agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "openhands",
  name: "OpenHands",
  skills: {
    dir: ".openhands/skills",
  },
};
