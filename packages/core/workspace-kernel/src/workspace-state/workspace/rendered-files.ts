/**
 * Rendered files tracking utilities for extension-managed output files.
 *
 * Provides a path schema and hashing for extension-managed output files.
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
