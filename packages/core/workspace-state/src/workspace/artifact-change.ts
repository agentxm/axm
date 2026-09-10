/**
 * Change classification for a workspace-managed artifact.
 *
 * Names how one on-disk artifact fared during an operation. Owned by the
 * workspace state vocabulary so plan presentation, agent projection, and
 * read-model consumers share one definition.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Schema from "effect/Schema";

export const ArtifactChangeSchema = Schema.Literals([
  "created",
  "updated",
  "unchanged",
  "removed",
] as const);

export type ArtifactChange = typeof ArtifactChangeSchema.Type;
