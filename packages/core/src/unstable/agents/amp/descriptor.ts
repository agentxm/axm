/**
 * Amp agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Amp agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "amp",
  name: "Amp",
  // First segment of skills.dir (`.agents`) collides with `kimi-cli` and
  // `replit`, so the heuristic cannot pick a unique rootDir. Opt out of
  // native-config scanning until an authoritative answer lands.
  rootDir: undefined,
  skills: {
    dir: ".agents/skills",
  },
};
