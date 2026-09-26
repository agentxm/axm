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
import {
  WORKSPACE_PROTECTED_STATE,
  snapshotProtectedState as snapshotProtectedStateAtRoot,
  type ProtectedStateSnapshot,
} from "@agentxm/test-support";

import { type FileSystemWriteEvent } from "./test-helpers.js";

import { resolveSpecWorkspaceStorage, type SpecWorkspaceInput } from "./install-harness.js";

/** Resolve the CLI fixture's memory or disk store before taking the shared snapshot. */
export const snapshotProtectedState = (
  workspace: SpecWorkspaceInput,
  protectedPaths: ReadonlyArray<string> = WORKSPACE_PROTECTED_STATE,
): ProtectedStateSnapshot => {
  const { root, files } = resolveSpecWorkspaceStorage(workspace);
  return snapshotProtectedStateAtRoot(root, protectedPaths, files);
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
