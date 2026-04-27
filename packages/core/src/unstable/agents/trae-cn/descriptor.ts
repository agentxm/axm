/**
 * Trae CN agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * Trae CN agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "trae-cn",
  name: "Trae CN",
  // TODO(workspace-context-v2): confirm native config root for trae-cn.
  // First segment of skills.dir (`.trae`) collides with `trae` (likely
  // localized variants of the same agent that genuinely share `.trae/`).
  // Opt out of native-config scanning until an authoritative answer
  // lands; the alternative is double-emitting one observation per agent
  // for the same physical file.
  rootDir: undefined,
  skills: {
    dir: ".trae/skills",
  },
};
