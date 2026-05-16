/**
 * Universal skills target descriptor.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { UNIVERSAL_SKILLS_DIR } from "../../extensions/universal-skills-dir.js";
import type { AgentDescriptor } from "../types.js";

/**
 * Synthetic always-on skills materialization target.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const descriptor: AgentDescriptor = {
  id: "universal",
  name: "Universal",
  rootDir: undefined,
  skills: {
    dir: UNIVERSAL_SKILLS_DIR,
  },
};
