/**
 * Registry discovery results as AXM consumes them.
 *
 * The generated transport decodes the response structure. This module refines
 * only the fields that carry domain identity: each result's source, the
 * resolved extension's owner, type, name, and resolution, and the rule that
 * only a Registry source can be official. The local Registry produces the same
 * result shape directly.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  ExtensionNameSchema,
  extensionTypePluralSegments,
  extensionTypes,
} from "@agentxm/extension-model/unstable/extensions/common";
import { HandleSchema, SlugSchema } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  AgentExtensionGitSourceSchema,
  AgentExtensionPathSourceSchema,
  AgentExtensionRegistrySourceSchema,
} from "@agentxm/extension-model/unstable/recommendations/agent-extensions";
import { VersionSchema } from "@agentxm/extension-model/unstable/version-constraints";
import type { DiscoveryPostDiscovery200 } from "./__generated__/registry-client.js";

const resolvedExtension = <TResolution extends Schema.Top>(resolution: TResolution) =>
  Schema.Struct({
    owner: Schema.Union([HandleSchema, SlugSchema]),
    type: Schema.Literals([...extensionTypes, ...extensionTypePluralSegments]),
    name: ExtensionNameSchema,
    resolution,
  });

const RegistryResolvedExtensionSchema = resolvedExtension(
  Schema.Struct({ type: Schema.Literal("registry"), version: VersionSchema }),
);
const GitResolvedExtensionSchema = resolvedExtension(AgentExtensionGitSourceSchema);
const PathResolvedExtensionSchema = resolvedExtension(AgentExtensionPathSourceSchema);

/** An extension the Registry matched to a recommendation, resolved through its source. */
export const DiscoveryResolvedExtensionSchema = Schema.Union([
  RegistryResolvedExtensionSchema,
  GitResolvedExtensionSchema,
  PathResolvedExtensionSchema,
]);

export type DiscoveryResolvedExtension = typeof DiscoveryResolvedExtensionSchema.Type;

/** The source-correlated identity of one result; only a Registry source can be official. */
const DiscoveryAttestationSchema = Schema.Union([
  Schema.Struct({
    source: AgentExtensionRegistrySourceSchema,
    extension: Schema.optionalKey(RegistryResolvedExtensionSchema),
    official: Schema.Boolean,
  }),
  Schema.Struct({
    source: AgentExtensionGitSourceSchema,
    extension: Schema.optionalKey(GitResolvedExtensionSchema),
    official: Schema.Literal(false),
  }),
  Schema.Struct({
    source: AgentExtensionPathSourceSchema,
    extension: Schema.optionalKey(PathResolvedExtensionSchema),
    official: Schema.Literal(false),
  }),
]);

type WirePackageResult = DiscoveryPostDiscovery200["results"][number];
type WireExtensionResult = WirePackageResult["extensions"][number];

export type DiscoveryExtensionResult = Pick<
  WireExtensionResult,
  "ref" | "resolved" | "attestedBy" | "packageVersionInRange"
> &
  typeof DiscoveryAttestationSchema.Type;

export interface DiscoveryPackageResult extends Omit<WirePackageResult, "extensions"> {
  readonly extensions: ReadonlyArray<DiscoveryExtensionResult>;
}

export interface DiscoverPackagesResponse {
  readonly results: ReadonlyArray<DiscoveryPackageResult>;
}

const decodeAttestation = Schema.decodeUnknownEffect(DiscoveryAttestationSchema);

const refineExtensionResult = ({
  source,
  extension,
  official,
  ...facts
}: WireExtensionResult): Effect.Effect<DiscoveryExtensionResult, Schema.SchemaError> =>
  Effect.map(
    decodeAttestation({
      source,
      official,
      ...(extension === undefined || extension === null ? {} : { extension }),
    }),
    (attestation) => ({ ...facts, ...attestation }),
  );

/** Refine a structurally decoded discovery response into AXM's domain identities. */
export const refineDiscoveryResponse = (
  response: DiscoveryPostDiscovery200,
): Effect.Effect<DiscoverPackagesResponse, Schema.SchemaError> =>
  Effect.forEach(response.results, (result) =>
    Effect.map(Effect.forEach(result.extensions, refineExtensionResult), (extensions) => ({
      ...result,
      extensions,
    })),
  ).pipe(Effect.map((results) => ({ results })));
