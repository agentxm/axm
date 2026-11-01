/**
 * Read-only discovery primitives for agent-native surfaces and the
 * ownership-issue vocabulary. The destructive sweep that consumes these facts
 * lives in `reconciliation/rendered-file-cleanup.ts`.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

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
