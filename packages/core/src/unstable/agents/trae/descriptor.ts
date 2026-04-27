/**
 * Trae agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Trae agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "trae",
  name: "Trae",
  // TODO(workspace-context-v2): confirm native config root for trae.
  // First segment of skills.dir (`.trae`) collides with `trae-cn` (likely
  // localized variants of the same agent that genuinely share `.trae/`).
  // Opt out of native-config scanning until an authoritative answer
  // lands; the alternative is double-emitting one observation per agent
  // for the same physical file.
  rootDir: undefined,
  skills: {
    dir: ".trae/skills",
  },
};
