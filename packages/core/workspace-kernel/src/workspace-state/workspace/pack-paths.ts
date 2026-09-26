/**
 * Centralized pack path computation.
 *
 * Provides types and a pure function for computing pack directory paths.
 * Packs use the same identity-based canonical layout as every other extension
 * type.
 *
 * @experimental This API is unstable and may change without notice.
 */

import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  decodeAbsolutePathSync,
  type AbsolutePath,
} from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceLayout } from "./layout.js";

/**
 * Computed path for an installed pack directory.
 *
 * `canonicalPath` = `<base>/agent_extensions/<family>/<owner>/packs/<name>/`
 *
 * No `src/` subdirectory for packs.
 */
export interface PackDirPath {
  readonly canonicalPath: AbsolutePath;
}

export const computePackPathsForLayout = (
  join: (...paths: string[]) => string,
  layout: WorkspaceLayout,
  sourceFamily: "git" | "path" | "registry" | "workspace",
  owner: Handle,
  name: string,
): PackDirPath => ({
  canonicalPath: decodeAbsolutePathSync(
    sourceFamily === "workspace"
      ? layout.scope === "project"
        ? join(layout.authoredRoot("pack"), name)
        : join(layout.acquiredRoot, owner, "packs", name)
      : join(layout.acquiredRoot, sourceFamily, owner, "packs", name),
  ),
});
