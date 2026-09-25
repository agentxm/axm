/**
 * The one source authority a Pack's sourceless members inherit.
 *
 * A member a Pack declares by name alone is acquired from the Pack's own
 * source view: the Registry endpoint, the Git repository at one ref under one
 * subdirectory, or the local directory the locator named. Two Packs may hold
 * one member only when they inherit it from one authority, so the held side
 * (the desired-state graph, reading the accepted lock) and the requested side
 * (an install resolving a new Pack) must spell that authority identically.
 * This function is the only producer of a Pack member's inherited authority.
 *
 * Canonical spelling per source kind, as `formatDesiredSourceAuthority`
 * renders it:
 *
 * - Registry: `registry:<endpoint href>`.
 * - Git: `git:<repository url href>#<ref, or HEAD when none was named>`, then
 *   `//<subdirectory>` when the locator named one. The subdirectory is the
 *   source view root the Pack and its members were discovered under, never the
 *   Pack's own directory — convention discovery walks any depth beneath the
 *   view root, so the Pack's directory does not determine it. The accepted
 *   lock records it as `sourceRoot`.
 * - Local path: `path:<workspace-relative view root>`, normalized the way the
 *   lock records it (`.` for the workspace root itself).
 * - Workspace: `workspace:<pack fqn>`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import { toExtensionTypePlural } from "@agentxm/extension-model/unstable/extensions/common";
import { makeWorkspaceRelativeSourcePath } from "@agentxm/extension-model/unstable/path-types";
import type { Source } from "@agentxm/extension-model/unstable/sources/types";
import type { PackLockEntry } from "../lockfile/schema.js";
import type { DesiredSourceAuthority } from "./desired-identity.js";

/** The ref no Git locator named: the repository's default branch head. */
const DEFAULT_GIT_REVISION = "HEAD";

/** One Pack source view: the accepted lock row it is held under, or the resolved source it is requested from. */
export type PackMemberSourceView =
  | { readonly kind: "accepted"; readonly entry: PackLockEntry }
  | {
      readonly kind: "resolved";
      readonly source: Source;
      readonly path: Path.Path;
      /** The workspace root a local view root is spelled relative to. */
      readonly baseDir: string;
    };

type GitPackLockEntry = Extract<PackLockEntry, { readonly source: { readonly type: "git" } }>;
type PathPackLockEntry = Extract<PackLockEntry, { readonly source: { readonly type: "path" } }>;

const isGitPackLockEntry = (entry: PackLockEntry): entry is GitPackLockEntry =>
  entry.source.type === "git";
const isPathPackLockEntry = (entry: PackLockEntry): entry is PathPackLockEntry =>
  entry.source.type === "path";

/** The source authority the members of one Pack source view inherit. */
export const packMemberSourceAuthority = (view: PackMemberSourceView): DesiredSourceAuthority => {
  if (view.kind === "accepted") {
    const { entry } = view;
    if (isGitPackLockEntry(entry)) {
      return {
        authority: "git",
        url: entry.source.url,
        revision: entry.source.revision ?? DEFAULT_GIT_REVISION,
        root: Option.fromUndefinedOr(entry.sourceRoot),
      };
    }
    if (isPathPackLockEntry(entry)) return { authority: "path", root: entry.sourceRoot };
    return { authority: "registry", endpoint: entry.source.url };
  }
  const { source } = view;
  switch (source.type) {
    case "registry":
      return { authority: "registry", endpoint: source.location };
    case "git":
      return {
        authority: "git",
        url: source.url,
        revision: Option.getOrElse(source.ref, () => DEFAULT_GIT_REVISION),
        root: source.subPath,
      };
    case "local":
      return {
        authority: "path",
        // A view root the workspace cannot address relatively (another drive)
        // is spelled as resolved; the Pack manager refuses to record such a
        // Pack, so no accepted row ever has to agree with it.
        root: Option.getOrElse(
          makeWorkspaceRelativeSourcePath(view.path, view.baseDir, source.path),
          () => source.path,
        ),
      };
    case "workspace":
      return {
        authority: "workspace",
        fqn: `${source.owner}/${toExtensionTypePlural(source.extensionType)}/${source.name}`,
      };
  }
};
