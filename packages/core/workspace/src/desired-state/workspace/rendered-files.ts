/**
 * Rendered files tracking utilities for extension-managed output files.
 *
 * Provides schemas and hashing for tracking which files an extension has
 * rendered, keyed by agent ID. Used as a lockfile mixin.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as crypto from "node:crypto";
import * as Schema from "effect/Schema";
import { RelativePathSchema } from "@agentxm/extension-model/unstable/path-types";
import {
  SourceHashSchema,
  type SourceHash,
} from "@agentxm/extension-model/unstable/sources/source-hash";

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
