import * as Option from "effect/Option";
import type { McpServerExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/mcp-server";
import type { SourceHash } from "@agentxm/extension-model/unstable/sources/source-hash";
import {
  type McpServerLockEntry,
  type TreeIntegrity,
  gitSourceLockFields,
  portableGitSourceLockFields,
  pathSourceLockFields,
  isPathLockEntry,
  isGitLockEntry,
} from "@agentxm/workspace-kernel/workspace-state";

export const buildExternalMcpServerLockEntry = (args: {
  readonly ref: Exclude<McpServerExtensionRef, { readonly refType: "registry" | "workspace" }>;
  readonly treeIntegrity: TreeIntegrity;
  readonly contentIdentity: SourceHash;
  readonly localPath: Option.Option<string>;
}): McpServerLockEntry => {
  const { ref } = args;
  const sourcePath = Option.fromUndefinedOr(ref.sourcePath).pipe(
    Option.filter((value) => value !== "" && value !== "."),
  );
  const entry: McpServerLockEntry =
    ref.refType === "local"
      ? ref.owner === undefined
        ? {
            source: { type: "path", path: Option.getOrElse(args.localPath, () => ref.source.path) },
            identity: { name: ref.name },
            resolved: { tree: args.contentIdentity },
            treeIntegrity: args.treeIntegrity,
          }
        : pathSourceLockFields(
            Option.getOrElse(args.localPath, () => ref.source.path),
            args.contentIdentity,
            ref.name,
            args.treeIntegrity,
            ref.owner,
          )
      : ref.owner === undefined
        ? portableGitSourceLockFields(
            ref.source,
            sourcePath,
            ref.gitCommitSha,
            ref.gitTreeSha,
            ref.name,
            args.treeIntegrity,
          )
        : gitSourceLockFields(
            ref.source,
            sourcePath,
            ref.gitCommitSha,
            ref.gitTreeSha,
            ref.owner,
            ref.name,
            args.treeIntegrity,
          );
  if (isPathLockEntry(entry))
    return {
      ...entry,
      source: {
        ...entry.source,
        ...(ref.distribution === undefined ? {} : { distribution: ref.distribution }),
      },
    };
  if (isGitLockEntry(entry))
    return {
      ...entry,
      source: {
        ...entry.source,
        ...(ref.distribution === undefined ? {} : { distribution: ref.distribution }),
      },
    };
  return entry;
};
