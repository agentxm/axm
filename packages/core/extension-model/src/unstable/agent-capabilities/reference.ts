import * as Schema from "effect/Schema";
import {
  AgentIdFromYamlSchema,
  AgentInterfaceSchema,
  AgentLifecycleSchema,
  AgentProfileSchema,
  AxmSupportSchema,
  AxmVerificationSchema,
  CatalogReviewSchema,
  DocLinkSchema,
  HookMechanismFamilySchema,
  LastVerifiedDateSchema,
  ScopeSchema,
  UrlSchema,
  VendorStatusSchema,
  type Agent,
  type AgentExtensionCapability,
} from "./schema.js";
import { agentCapabilityStatus, axmIntegrationStatus, isCapabilitySupported } from "./derive.js";

export const AgentInstallabilitySchema = Schema.Struct({
  status: Schema.Literals(["supported", "manual", "conditional", "unsupported", "unknown"]),
  conditions: Schema.Array(Schema.NonEmptyString),
  limitations: Schema.Array(Schema.NonEmptyString),
});

export type AgentInstallability = Schema.Schema.Type<typeof AgentInstallabilitySchema>;

const CatalogAvailabilitySchema = Schema.Union([
  Schema.Struct({ via: Schema.Literals(["native", "none", "unknown"]) }),
  Schema.Struct({
    via: Schema.Literal("plugin"),
    provider: Schema.Literals(["first-party", "third-party"]),
    plugin: Schema.Struct({ name: Schema.NonEmptyString, homepage: UrlSchema }),
  }),
]);

/** Public evidence projection; native paths and AXM writer mechanics stay private to the catalog. */
export const AgentCatalogCapabilitySchema = Schema.Struct({
  native: Schema.Struct({
    status: Schema.Literals([
      "native",
      "native-deprecated",
      "plugin",
      "plugin-deprecated",
      "none",
      "unknown",
    ]),
    availability: CatalogAvailabilitySchema,
    vendorStatus: VendorStatusSchema,
    notes: Schema.NullOr(Schema.NonEmptyString),
    docs: Schema.Array(DocLinkSchema),
    sources: Schema.Array(UrlSchema),
    review: Schema.NullOr(CatalogReviewSchema),
    scopes: Schema.Array(ScopeSchema),
    mechanisms: Schema.Array(HookMechanismFamilySchema),
  }),
  axm: Schema.Struct({
    status: Schema.Union([AxmSupportSchema, Schema.Literal("writer")]),
    legacyLastVerified: Schema.NullOr(LastVerifiedDateSchema),
    verification: Schema.NullOr(AxmVerificationSchema),
  }),
  installability: AgentInstallabilitySchema,
});

export type AgentCatalogCapability = Schema.Schema.Type<typeof AgentCatalogCapabilitySchema>;

export const AgentCatalogEntrySchema = Schema.Struct({
  id: AgentIdFromYamlSchema,
  name: Schema.NonEmptyString,
  vendor: Schema.NonEmptyString,
  homepage: UrlSchema,
  interfaces: Schema.NonEmptyArray(AgentInterfaceSchema),
  lifecycle: AgentLifecycleSchema,
  docs: Schema.Array(DocLinkSchema),
  profile: Schema.NullOr(AgentProfileSchema),
  capabilities: Schema.Struct({
    skill: AgentCatalogCapabilitySchema,
    "mcp-server": AgentCatalogCapabilitySchema,
    subagent: AgentCatalogCapabilitySchema,
    rule: AgentCatalogCapabilitySchema,
    hook: AgentCatalogCapabilitySchema,
  }),
});

export type AgentCatalogEntry = Schema.Schema.Type<typeof AgentCatalogEntrySchema>;

/** Versioned release asset consumed independently of CLI implementation details. */
export const AgentCatalogReferenceSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  entries: Schema.Array(AgentCatalogEntrySchema),
}).annotate({
  identifier: "AgentCatalogReference",
  description:
    "Version 1 coding-agent catalog with qualified installability and separate research and execution evidence.",
});

export type AgentCatalogReference = Schema.Schema.Type<typeof AgentCatalogReferenceSchema>;

const unique = (values: ReadonlyArray<string>): ReadonlyArray<string> => [...new Set(values)];

export const capabilityInstallability = (
  agent: Agent,
  capability: AgentExtensionCapability,
): AgentInstallability => {
  const native = capability.native;
  const review = native.review;
  const verification = capability.axm.verification;
  const locationConditions =
    "locations" in native
      ? native.locations.flatMap((location) =>
          location.applicability.kind === "conditional" ? [location.applicability.condition] : [],
        )
      : [];
  const conditions = unique([
    ...(agent.profile?.review.conditions ?? []),
    ...(review?.conditions ?? []),
    ...locationConditions,
    // Existing notes have not necessarily been classified as unconditional facts.
    ...(native.notes === null ? [] : [native.notes]),
    ...(native.availability.via === "plugin"
      ? [`Requires the ${native.availability.plugin.name} plugin.`]
      : []),
    ...(agent.lifecycle.state === "active" ? [] : [`${agent.name} is ${agent.lifecycle.state}.`]),
    ...(native.vendorStatus.state === "active"
      ? []
      : [`The native surface is ${native.vendorStatus.state}.`]),
    ...(agent.profile?.lifecycleQualifications
      .filter((qualification) => qualification.state !== "active")
      .map((qualification) => qualification.note) ?? []),
  ]);
  const limitations = unique([
    ...(agent.profile?.review.limitations ?? []),
    ...(review?.limitations ?? []),
    ...(verification?.limitations ?? []),
    ...(capability.axm.reason === undefined ? [] : [capability.axm.reason]),
    ...(review === undefined ? ["No scoped native capability review is recorded."] : []),
    ...(verification === undefined || verification === null
      ? [
          "No attributable AXM execution verification is recorded; a legacy date does not establish execution.",
        ]
      : verification.boundary === "configuration"
        ? [
            "Configuration output was verified; vendor runtime behavior was not established by that evidence.",
          ]
        : []),
  ]);
  if (native.availability.via === "unknown") return { status: "unknown", conditions, limitations };
  if (native.availability.via === "none" || native.vendorStatus.state === "removed") {
    return { status: "unsupported", conditions, limitations };
  }
  if (!isCapabilitySupported(capability)) {
    return {
      status: capability.axm.status === "unknown" ? "unknown" : "unsupported",
      conditions,
      limitations,
    };
  }
  if (agent.installTarget !== undefined) return { status: "manual", conditions, limitations };
  return {
    status: conditions.length > 0 || review === undefined ? "conditional" : "supported",
    conditions,
    limitations,
  };
};

export const makeAgentCatalogCapability = (
  agent: Agent,
  capability: AgentExtensionCapability,
): AgentCatalogCapability => ({
  native: {
    status: agentCapabilityStatus(capability),
    availability:
      capability.native.availability.via === "plugin"
        ? {
            via: "plugin",
            provider: capability.native.availability.provider,
            plugin: {
              name: capability.native.availability.plugin.name,
              homepage: capability.native.availability.plugin.homepage,
            },
          }
        : { via: capability.native.availability.via },
    vendorStatus: capability.native.vendorStatus,
    notes: capability.native.notes,
    docs: capability.native.docs,
    sources: capability.native.sources,
    review: capability.native.review ?? null,
    scopes: "scopes" in capability.native ? capability.native.scopes : [],
    mechanisms: "mechanism" in capability.native ? capability.native.mechanism : [],
  },
  axm: {
    status: axmIntegrationStatus(capability),
    legacyLastVerified: capability.axm.lastVerified,
    verification: capability.axm.verification ?? null,
  },
  installability: capabilityInstallability(agent, capability),
});

export const makeAgentCatalogEntry = (agent: Agent): AgentCatalogEntry => ({
  id: agent.id,
  name: agent.name,
  vendor: agent.vendor,
  homepage: agent.homepage,
  interfaces: agent.interfaces,
  lifecycle: agent.lifecycle,
  docs: agent.docs,
  profile: agent.profile ?? null,
  capabilities: {
    skill: makeAgentCatalogCapability(agent, agent.capabilities.skill),
    "mcp-server": makeAgentCatalogCapability(agent, agent.capabilities["mcp-server"]),
    subagent: makeAgentCatalogCapability(agent, agent.capabilities.subagent),
    rule: makeAgentCatalogCapability(agent, agent.instructions),
    hook: makeAgentCatalogCapability(agent, agent.capabilities.hook),
  },
});

export const makeAgentCatalogReference = (agents: ReadonlyArray<Agent>): AgentCatalogReference => ({
  schemaVersion: 1,
  entries: [...agents]
    .sort((left, right) => (left.id < right.id ? -1 : left.id === right.id ? 0 : 1))
    .map(makeAgentCatalogEntry),
});
