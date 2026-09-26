import * as path from "node:path";

import type { FileStore } from "./memory-file-system.js";
import { makeNativeFileStore } from "./native-file-store.js";
import { snapshotPath } from "./tree-snapshot.js";

/** Persistent paths a workspace-changing preview must leave untouched. */
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

/** One snapshot for every declared path, including absent paths. */
export const snapshotProtectedState = (
  root: string,
  protectedPaths: ReadonlyArray<string> = WORKSPACE_PROTECTED_STATE,
  files: FileStore = makeNativeFileStore(),
): ProtectedStateSnapshot =>
  Object.fromEntries(
    protectedPaths.map((relative) => [relative, snapshotPath(path.join(root, relative), files)]),
  );
