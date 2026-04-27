/**
 * Kimi Code CLI agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Kimi Code CLI agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "kimi-cli",
  name: "Kimi Code CLI",
  // TODO(workspace-context-v2): confirm native config root for kimi-cli.
  // First segment of skills.dir (`.agents`) collides with `amp` and
  // `replit`, so the heuristic cannot pick a unique rootDir. Opt out of
  // native-config scanning until an authoritative answer lands.
  rootDir: undefined,
  skills: {
    dir: ".agents/skills",
  },
};
