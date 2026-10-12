/**
 * Read-only discovery primitives for agent-native surfaces and the
 * ownership-issue vocabulary. The destructive sweep that consumes these facts
 * lives in `reconciliation/rendered-file-cleanup.ts`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";

export interface WorkspaceOwnershipIssue {
  readonly kind: "managed-file-unowned";
  readonly path: string;
  readonly detail: string;
}

/** Extension name encoded in a rendered file name (everything before the first dot). */
export const extensionNameFromFilename = (fileName: string): string => {
  const dotIndex = fileName.indexOf(".");
  return dotIndex === -1 ? fileName : fileName.slice(0, dotIndex);
};

/** Read a directory, treating an unreadable or missing directory as empty. */
export const safeReadDirectory = (fs: FileSystem.FileSystem, dir: string) =>
  fs.readDirectory(dir).pipe(Effect.catch(() => Effect.succeed<ReadonlyArray<string>>([])));

/** Read a file as a string, treating an unreadable or missing file as empty. */
export const safeReadFileString = (fs: FileSystem.FileSystem, filePath: string) =>
  fs.readFileString(filePath).pipe(Effect.catch(() => Effect.succeed("")));
