/**
 * Cursor agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";
import { detect } from "./detection.js";

/**
 * Cursor agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "cursor",
  name: "Cursor",
  skills: {
    dir: ".cursor/skills",
  },
  detect,
};
