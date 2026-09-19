import * as Option from "effect/Option";

import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";

import type { McpServerLockEntry, TreeIntegrity } from "../desired-state/index.js";
import { gitSourceLockFields } from "../desired-state/lockfile/entry-fields.js";

export const buildExternalMcpServerLockEntry = (args: {
  readonly ref: Exclude<McpServerExtensionRef, { readonly refType: "registry" | "workspace" }>;
  readonly treeIntegrity: TreeIntegrity;
  readonly contentIdentity: SourceHash;
  readonly localPath: Option.Option<string>;
}): McpServerLockEntry => {
  if (args.ref.refType === "local") {
    const localSourcePath = args.ref.source.path;
    return {
      type: "local",
      sourceType: "local",
      sourceName: "local",
      extensionType: "mcp-server",
      workspaceName: args.ref.server.name,
      packageFormat: "agentxm",
      packageOwner: args.ref.owner,
      packageName: args.ref.name,
      path: Option.getOrElse(args.localPath, () => localSourcePath),
      contentIdentity: args.contentIdentity,
      treeIntegrity: args.treeIntegrity,
    };
  }
  return gitSourceLockFields(
    args.ref.source,
    "mcp-server",
    args.ref.server.name,
    Option.fromUndefinedOr(args.ref.sourcePath),
    args.ref.gitCommitSha,
    args.ref.gitTreeSha,
    args.contentIdentity,
    args.ref.owner,
    args.ref.name,
    args.treeIntegrity,
  );
};
