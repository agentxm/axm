import * as Option from "effect/Option";

import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";

import type { McpServerLockEntry, TreeIntegrity } from "../desired-state/index.js";
import {
  gitSourceLockFields,
  pathSourceLockFields,
} from "../desired-state/lockfile/entry-fields.js";

export const buildExternalMcpServerLockEntry = (args: {
  readonly ref: Exclude<McpServerExtensionRef, { readonly refType: "registry" | "workspace" }>;
  readonly treeIntegrity: TreeIntegrity;
  readonly contentIdentity: SourceHash;
  readonly localPath: Option.Option<string>;
}): McpServerLockEntry => {
  if (args.ref.refType === "local") {
    const localSourcePath = args.ref.source.path;
    return pathSourceLockFields(
      Option.getOrElse(args.localPath, () => localSourcePath),
      args.contentIdentity,
      args.ref.name,
      args.treeIntegrity,
      args.ref.owner,
    );
  }
  return gitSourceLockFields(
    args.ref.source,
    Option.fromUndefinedOr(args.ref.sourcePath),
    args.ref.gitCommitSha,
    args.ref.gitTreeSha,
    args.ref.owner,
    args.ref.name,
    args.treeIntegrity,
  );
};
