import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { makeAppError } from "../app-error/index.js";
import { ExtensionFqnSchema, SourceHashSchema } from "../extensions/index.js";
import { VersionSchema } from "../version-constraints/version-constraints.js";

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

export const validateExactPackDependencyVersions = (
  field: string,
  resolved: ResolvedPackDependencyMap,
) =>
  Effect.forEach(
    Object.entries(resolved),
    ([fqn, value]) =>
      Schema.decodeUnknownEffect(VersionSchema)(value.version).pipe(
        Effect.mapError((cause) =>
          makeAppError({
            code: "validation",
            detail: `Pack dependency ${field}.${fqn}.version must be an exact semver value`,
            cause,
          }),
        ),
      ),
    { concurrency: "unbounded", discard: true },
  );
