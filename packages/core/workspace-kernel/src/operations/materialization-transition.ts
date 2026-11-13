/** Observed and proposed source facts; display labels are derived, never parsed. */
import * as Schema from "effect/Schema";
import { ExtensionTypeSchema } from "@agentxm/extension-model/unstable/extensions/common";

const MaterializationEndpointSchema = Schema.Struct({
  source: Schema.Struct({ kind: Schema.String, identity: Schema.String, locator: Schema.String }),
  version: Schema.NullOr(Schema.String).annotate({
    description: "Known package version, or null when this source has no observed package version.",
  }),
});

export const MaterializationTransitionSchema = Schema.Struct({
  type: ExtensionTypeSchema,
  name: Schema.String,
  previous: Schema.NullOr(MaterializationEndpointSchema).annotate({
    description:
      "Accepted source and version before this operation; null means no accepted resolution.",
  }),
  proposed: MaterializationEndpointSchema,
  observedReason: Schema.String,
  downgrade: Schema.NullOr(Schema.Boolean).annotate({
    description:
      "Whether the proposed version is below the accepted version; null when the versions are not comparable.",
  }),
}).annotate({ identifier: "MaterializationTransition" });
export type MaterializationTransition = typeof MaterializationTransitionSchema.Type;

export const materializationTransitionLabel = (transition: MaterializationTransition): string => {
  const source = (endpoint: typeof MaterializationEndpointSchema.Type) =>
    endpoint.source.kind === "workspace"
      ? "workspace"
      : `${endpoint.source.kind}:${endpoint.source.identity}`;
  return [
    transition.name,
    `previous source=${transition.previous === null ? "none" : source(transition.previous)}`,
    `proposed source=${source(transition.proposed)}`,
    `previous version=${transition.previous?.version ?? "none"}`,
    `proposed version=${transition.proposed.version ?? "unversioned"}`,
    `reason=${transition.observedReason}`,
    `downgrade=${transition.downgrade === null ? "unknown" : transition.downgrade ? "yes" : "no"}`,
  ].join("; ");
};
