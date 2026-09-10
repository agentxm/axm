/**
 * The resolved pack dependency map: the exact identity and version resolution
 * chose for every declared pack member, in the shape the lockfile records.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { ExtensionFqnSchema } from "@agentxm/extension-model/unstable/extensions";
import { SourceHashSchema } from "@agentxm/extension-model/unstable/sources/source-hash";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";

const ResolvedRegistryDependencySchema = Schema.Struct({
  source: Schema.Literal("registry"),
  version: VersionSchema,
  publisherBindingId: Schema.NonEmptyString,
  integrity: Schema.String,
});

const ResolvedWorkspaceDependencySchema = Schema.Struct({
  source: Schema.Literal("workspace"),
  version: VersionSchema,
  sourceIdentity: Schema.String,
  contentIdentity: SourceHashSchema,
});

export const ResolvedPackDependencySchema = Schema.Union([
  ResolvedRegistryDependencySchema,
  ResolvedWorkspaceDependencySchema,
]);

export type ResolvedPackDependency = typeof ResolvedPackDependencySchema.Type;

export const ResolvedPackDependencyMapSchema = Schema.Record(
  ExtensionFqnSchema,
  ResolvedPackDependencySchema,
);

export type ResolvedPackDependencyMap = typeof ResolvedPackDependencyMapSchema.Type;
