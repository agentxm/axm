import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { PackDefinitionInvalid } from "./errors.js";
import { ExtensionFqnSchema } from "@agentxm/extension-model/unstable/extensions";
import { SourceHashSchema } from "../workspace/rendered-files.js";
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

export const validateExactPackDependencyVersions = (
  field: string,
  resolved: ResolvedPackDependencyMap,
) =>
  Effect.forEach(
    Object.entries(resolved),
    ([fqn, value]) =>
      Schema.decodeUnknownEffect(VersionSchema)(value.version).pipe(
        Effect.mapError(
          (cause) =>
            new PackDefinitionInvalid({
              detail: `Pack dependency ${field}.${fqn}.version must be an exact semver value`,
              cause,
            }),
        ),
      ),
    { concurrency: "unbounded", discard: true },
  );
