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

import * as fs from "node:fs";
import * as path from "node:path";
import { expect } from "vitest";

import type { FileSystemWriteEvent } from "axm.sh/specification-harness";

import { snapshotWorkspaceContent } from "./workspace-fixtures.js";

/** Exact content of one protected path: a directory tree, a single file, or nothing. */
const snapshotPath = (absolute: string): Readonly<Record<string, string>> => {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(absolute);
  } catch {
    return {};
  }
  if (stat.isSymbolicLink()) return { ".": `symlink:${fs.readlinkSync(absolute)}` };
  if (stat.isDirectory()) return snapshotWorkspaceContent(absolute);
  return { ".": `file:${fs.readFileSync(absolute).toString("base64")}` };
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
  root: string,
  protectedPaths: ReadonlyArray<string> = WORKSPACE_PROTECTED_STATE,
): ProtectedStateSnapshot =>
  Object.fromEntries(
    protectedPaths.map((relative) => [relative, snapshotPath(path.join(root, relative))]),
  );

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
  readonly root: string;
  readonly before: ProtectedStateSnapshot;
  readonly writes: ReadonlyArray<FileSystemWriteEvent>;
  readonly protectedPaths?: ReadonlyArray<string>;
}): void => {
  const protectedPaths = args.protectedPaths ?? WORKSPACE_PROTECTED_STATE;
  expect(snapshotProtectedState(args.root, protectedPaths)).toEqual(args.before);
  expect(protectedWrites(args.root, args.writes, protectedPaths)).toEqual([]);
};
