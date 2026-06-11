/**
 * Rendered files tracking utilities for extension-managed output files.
 *
 * Provides schemas and hashing for tracking which files an extension has
 * rendered, keyed by agent ID. Used as a lockfile mixin.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as crypto from "node:crypto";
import * as Option from "effect/Option";
import type { Path } from "effect/Path";
import * as Schema from "effect/Schema";
import { makeWorkspaceRelativePath, RelativePathSchema } from "../utils/path-types.js";

/**
 * Branded string for content source hashes.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const SourceHashSchema = Schema.String.pipe(Schema.brand("SourceHash"));

/**
 * Branded SourceHash type.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type SourceHash = Schema.Schema.Type<typeof SourceHashSchema>;

/**
 * Branded string for rendered file paths tracked in lockfiles.
 *
 * These are workspace-root-relative managed-output paths. Lockfiles must not
 * persist host-specific absolute paths.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RenderedFilePathSchema = RelativePathSchema.pipe(Schema.brand("RenderedFilePath"));

/**
 * Branded RenderedFilePath type.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type RenderedFilePath = Schema.Schema.Type<typeof RenderedFilePathSchema>;

/**
 * Schema for a single rendered file entry.
 *
 * @experimental This API is unstable and may change without notice.
 */
const RenderedFileEntrySchema = Schema.Struct({
  path: RenderedFilePathSchema,
});

/**
 * Schema for the rendered files map — a record keyed by agent ID,
 * where each value is an array of rendered file entries.
 *
 * Used as a lockfile mixin to track which files have been rendered
 * per agent.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const RenderedFilesMapSchema = Schema.Record(
  Schema.String,
  Schema.Array(RenderedFileEntrySchema),
);

/**
 * Inferred type for the rendered files map.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type RenderedFilesMap = Schema.Schema.Type<typeof RenderedFilesMapSchema>;

export interface RenderedFilePathOutcome {
  readonly agentId: string;
  readonly renderedFilePaths: ReadonlyArray<string>;
}

export interface WorkspaceRenderedFilesResult {
  readonly successfulAgents: ReadonlyArray<string>;
  readonly rawRenderedFiles: Record<string, Array<{ path: string }>>;
  readonly escapedPaths: ReadonlyArray<string>;
}

export const collectWorkspaceRenderedFiles = (
  path: Path,
  workspaceRoot: string,
  outcomes: ReadonlyArray<RenderedFilePathOutcome>,
): WorkspaceRenderedFilesResult => {
  const successfulAgents: Array<string> = [];
  const escapedPaths: Array<string> = [];
  const renderedFiles: Record<string, Array<{ path: string }>> = {};

  for (const outcome of outcomes) {
    successfulAgents.push(outcome.agentId);
    const entries: Array<{ path: string }> = [];
    for (const renderedFilePath of outcome.renderedFilePaths) {
      const relativePath = makeWorkspaceRelativePath(path, workspaceRoot, renderedFilePath);
      if (Option.isNone(relativePath)) {
        escapedPaths.push(renderedFilePath);
        continue;
      }
      entries.push({ path: relativePath.value });
    }
    if (entries.length > 0) {
      renderedFiles[outcome.agentId] = entries;
    }
  }

  return { successfulAgents, rawRenderedFiles: renderedFiles, escapedPaths };
};

const decodeSourceHash = Schema.decodeUnknownSync(SourceHashSchema);

/**
 * Compute a SHA-256 hash of arbitrary content.
 *
 * Callers determine what to hash — this function accepts any string content
 * and returns a branded SourceHash.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const computeSourceHash = (content: string): SourceHash =>
  decodeSourceHash(crypto.createHash("sha256").update(content).digest("hex"));
