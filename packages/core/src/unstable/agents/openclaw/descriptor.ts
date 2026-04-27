/**
 * OpenClaw agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import type { AgentDescriptor } from "../types.js";

/**
 * OpenClaw agent descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "openclaw",
  name: "OpenClaw",
  // TODO(workspace-context-v2): confirm native config root for openclaw.
  // First segment of skills.dir is the bare `skills` (no leading dot, no
  // distinct agent root), so the heuristic produces a collision-prone or
  // wrong rootDir. Opt out of native-config scanning until an
  // authoritative answer lands.
  rootDir: undefined,
  skills: {
    dir: "skills",
  },
};
