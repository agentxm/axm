/** Packs use the shared authored or source-address package placement. */
import type { AbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import { computeExtensionPathsForLayout, type ExtensionPathSource } from "./extension-paths.js";
import type { WorkspaceLayout } from "./layout.js";

export interface PackDirPath {
  readonly canonicalPath: AbsolutePath;
}

export const computePackPathsForLayout = (
  join: (...paths: string[]) => string,
  layout: WorkspaceLayout,
  source: ExtensionPathSource,
  name: string,
): PackDirPath => computeExtensionPathsForLayout(join, layout, source, "packs", name);
