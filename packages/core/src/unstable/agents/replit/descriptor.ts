/**
 * Replit agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Replit agent descriptor.
 *
 * Note: Replit does not support user-scope installation.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "replit",
  name: "Replit",
  // TODO(workspace-context-v2): confirm native config root for replit.
  // First segment of skills.dir (`.agents`) collides with `amp` and
  // `kimi-cli`, so the heuristic cannot pick a unique rootDir. Opt out of
  // native-config scanning until an authoritative answer lands.
  rootDir: undefined,
  skills: {
    dir: ".agents/skills",
  },
};
