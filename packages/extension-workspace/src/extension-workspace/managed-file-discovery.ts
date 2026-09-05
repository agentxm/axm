/**
 * Read-only discovery of AXM-managed files on agent surfaces: banner
 * detection, managed-file scanning primitives, and the ownership-issue
 * vocabulary. The destructive sweep that consumes these facts lives in
 * `workspace-sync/rendered-file-cleanup.ts`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { hasManagedFileBanner } from "../extensions/managed-file-banner.js";

export interface WorkspaceOwnershipIssue {
  readonly kind: "hook-ownership-ambiguous" | "managed-file-unowned";
  readonly path: string;
  readonly detail: string;
}

export const hasAxmManagedMarker = hasManagedFileBanner;

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

/** Discover one subagent's AXM-managed files without mutating the workspace. */
export const findManagedSubagentFiles = (subagentsDir: string, subagentName: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const managedPaths: Array<string> = [];
    const entries = yield* safeReadDirectory(fs, subagentsDir);

    for (const entry of entries) {
      if (extensionNameFromFilename(entry) !== subagentName) continue;
      const filePath = path.join(subagentsDir, entry);
      const stat = yield* fs.stat(filePath).pipe(Effect.option);
      if (stat._tag === "None" || stat.value.type !== "File") continue;
      const content = yield* safeReadFileString(fs, filePath);
      if (hasAxmManagedMarker(content)) managedPaths.push(filePath);
    }

    return managedPaths;
  });
