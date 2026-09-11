/**
 * Shared preview-purity evidence.
 *
 * A command's preview leaves its protected persistent state unchanged. Each
 * command's `preview-is-pure` specification declares that state, builds a
 * scenario that would change it on apply, runs the preview, and asserts two
 * independent observations: the declared state is byte-for-byte unchanged,
 * and the recorded file system observed no attempted write beneath it. A
 * preview may still read the network and write scratch or runtime state, so
 * the protected roots are always explicit.
 */

import * as path from "node:path";
import { expect } from "vitest";

import { type FileSystemWriteEvent } from "./test-helpers.js";

import {
  resolveSpecWorkspaceStorage,
  type SpecFileStore,
  type SpecWorkspaceInput,
} from "./install-harness.js";

/** Exact content of one protected path: a directory tree, a single file, or nothing. */
const encodeBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

const snapshotDirectory = (
  files: SpecFileStore,
  root: string,
): Readonly<Record<string, string>> => {
  const entries: Array<readonly [string, string]> = [];
  const walk = (directory: string, relativeDirectory: string): void => {
    for (const entry of [...files.readDirectory(directory)].sort((left, right) =>
      left.name.localeCompare(right.name, "en"),
    )) {
      const relative =
        relativeDirectory.length === 0 ? entry.name : `${relativeDirectory}/${entry.name}`;
      const target = path.join(directory, entry.name);
      if (entry.type === "directory") {
        entries.push([relative, "directory"]);
        walk(target, relative);
      } else if (entry.type === "symlink") {
        entries.push([relative, `symlink:${files.readLink(target)}`]);
      } else {
        entries.push([relative, `file:${encodeBase64(files.readFile(target))}`]);
      }
    }
  };
  walk(root, "");
  return Object.fromEntries(entries);
};

const snapshotPath = (files: SpecFileStore, absolute: string): Readonly<Record<string, string>> => {
  const type = files.type(absolute);
  if (type === undefined) return {};
  if (type === "symlink") return { ".": `symlink:${files.readLink(absolute)}` };
  if (type === "directory") return snapshotDirectory(files, absolute);
  return { ".": `file:${encodeBase64(files.readFile(absolute))}` };
};

/** The workspace state a preview of a workspace-changing command must not touch. */
export const WORKSPACE_PROTECTED_STATE: ReadonlyArray<string> = [
  "axm.json",
  "axm-lock.yaml",
  "agent_extensions",
  "skills",
  "subagents",
  "mcps",
  "rules",
  "hooks",
  "knowledge",
  "packs",
  ".claude",
  ".agents",
  ".cursor",
  ".codex",
  ".gemini",
  ".github",
  ".mcp.json",
  "AGENTS.md",
  "CLAUDE.md",
  ".gitignore",
];

export type ProtectedStateSnapshot = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** Exact content of every declared protected path, missing paths included as empty. */
export const snapshotProtectedState = (
  workspace: SpecWorkspaceInput,
  protectedPaths: ReadonlyArray<string> = WORKSPACE_PROTECTED_STATE,
): ProtectedStateSnapshot => {
  const { root, files } = resolveSpecWorkspaceStorage(workspace);
  return Object.fromEntries(
    protectedPaths.map((relative) => [relative, snapshotPath(files, path.join(root, relative))]),
  );
};

const isWithin = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

/** Every recorded write whose target lies beneath a protected path. */
export const protectedWrites = (
  root: string,
  writes: ReadonlyArray<FileSystemWriteEvent>,
  protectedPaths: ReadonlyArray<string> = WORKSPACE_PROTECTED_STATE,
): ReadonlyArray<FileSystemWriteEvent> =>
  writes.filter((event) =>
    event.paths.some((target) =>
      protectedPaths.some((relative) => isWithin(path.join(root, relative), path.resolve(target))),
    ),
  );

/**
 * Assert both purity observations: the protected snapshot is unchanged and
 * no write reached a protected path.
 */
export const expectProtectedStateUntouched = (args: {
  readonly root?: string;
  readonly workspace?: SpecWorkspaceInput;
  readonly before: ProtectedStateSnapshot;
  readonly writes: ReadonlyArray<FileSystemWriteEvent>;
  readonly protectedPaths?: ReadonlyArray<string>;
}): void => {
  const workspace = args.workspace ?? args.root;
  if (workspace === undefined) throw new Error("Expected a workspace or root for purity evidence");
  const { root } = resolveSpecWorkspaceStorage(workspace);
  const protectedPaths = args.protectedPaths ?? WORKSPACE_PROTECTED_STATE;
  expect(snapshotProtectedState(workspace, protectedPaths)).toEqual(args.before);
  expect(protectedWrites(root, args.writes, protectedPaths)).toEqual([]);
};
