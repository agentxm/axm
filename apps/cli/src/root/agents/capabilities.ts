import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Schema from "effect/Schema";
import { Argument, Command } from "effect/unstable/cli";
import {
  agentById,
  agentCapabilityStatus,
  axmIntegrationStatus,
  getSupportedExtensionTypesForAgent,
  listCapabilities,
  AgentCatalogCapabilitySchema,
  AgentProfileSchema,
  makeAgentCatalogCapability,
  capabilityVerificationAgeReport,
  CapabilityVerificationAgeSchema,
  type CapabilityVerificationAge,
  NativeReadLocationSchema,
  type NativeReadLocation,
  type Agent,
  type AgentCatalogCapability,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { makeAppError } from "../../app-error/index.js";
import { emitResult, count, tableDoc, type ViewColumn } from "../../screen/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import { withRuntime } from "../../runtime.js";
import { readOnlyCapabilities, withCommandCapabilities } from "../shared/command-capabilities.js";
import { lifecycleCell } from "./lifecycle-cell.js";
import {
  agentLifecycle,
  isCatalogAgentId,
  validateAgentIds,
} from "@agentxm/workspace-features/configuration";
import { failureToAppError } from "../../app-error/conversions.js";

const NONE = "-";

interface AgentCapabilityItem {
  readonly type: string;
  /** Canonical extension capability identifier. */
  readonly capabilityKey: string;
  /** Vendor surface: native, plugin, either `-deprecated`, or none. */
  readonly native: string;
  /** AXM integration: supported, planned, unsupported, unknown, or writer. */
  readonly axm: string;
  readonly locations: ReadonlyArray<NativeReadLocation>;
  readonly scopes: string;
  readonly assessment: AgentCatalogCapability;
  readonly freshness: CapabilityVerificationAge | null;
}

const AgentCapabilityItemSchema = Schema.Struct({
  type: Schema.String,
  capabilityKey: Schema.String,
  native: Schema.String,
  axm: Schema.String,
  locations: Schema.Array(NativeReadLocationSchema),
  scopes: Schema.String,
  assessment: AgentCatalogCapabilitySchema,
  freshness: Schema.NullOr(CapabilityVerificationAgeSchema),
});

export const AgentCapabilitiesOutputSchema = Schema.Struct({
  agent: Schema.String,
  name: Schema.String,
  lifecycle: Schema.String,
  asOf: Schema.String,
  freshness: Schema.Array(CapabilityVerificationAgeSchema),
  profile: Schema.NullOr(AgentProfileSchema),
  supported: Schema.Array(Schema.String),
  items: Schema.Array(AgentCapabilityItemSchema),
  count: Schema.Number,
});
export type AgentCapabilitiesOutput = typeof AgentCapabilitiesOutputSchema.Type;

const AgentCapabilityColumns = [
  { header: "Type", priority: "required", value: (row: AgentCapabilityItem) => row.type },
  {
    header: "Capability",
    priority: "required",
    value: (row: AgentCapabilityItem) => row.capabilityKey,
  },
  { header: "Native", value: (row: AgentCapabilityItem) => row.native },
  { header: "AXM", value: (row: AgentCapabilityItem) => row.axm },
  {
    header: "Installability",
    value: (row: AgentCapabilityItem) => row.assessment.installability.status,
  },
  {
    header: "Evidence",
    value: (row: AgentCapabilityItem) => {
      const review = row.assessment.native.review;
      const verification = row.assessment.axm.verification;
      const legacy = row.assessment.axm.legacyLastVerified;
      const age = row.freshness;
      return [
        review === null
          ? "Source review missing"
          : `Sources reviewed ${review.reviewedAt} (${age?.reviewAgeDays ?? "?"} days${age?.reviewOverdue === true ? ", overdue" : ""})`,
        verification === null
          ? "Execution verification missing"
          : `${verification.boundary} verified ${verification.verifiedAt} (${age?.verificationAgeDays ?? "?"} days${age?.verificationOverdue === true ? ", overdue" : ""})`,
        ...(legacy === null ? [] : [`Legacy record ${legacy} (method unrecorded)`]),
      ].join("; ");
    },
  },
  {
    header: "Qualifications",
    priority: "optional",
    value: (row: AgentCapabilityItem) =>
      [
        ...row.assessment.installability.conditions,
        ...row.assessment.installability.limitations,
      ].join("; ") || NONE,
  },
  {
    header: "Locations",
    priority: "optional",
    value: (row: AgentCapabilityItem) =>
      row.locations
        .map((location) => {
          const anchor =
            location.root === "home"
              ? "~/"
              : location.root === "xdg-config"
                ? "$XDG_CONFIG_HOME/"
                : "";
          return `${location.scope}: ${anchor}${location.path}${location.applicability.kind === "conditional" ? " (conditional)" : ""}`;
        })
        .join("; ") || NONE,
  },
  { header: "Scopes", priority: "optional", value: (row: AgentCapabilityItem) => row.scopes },
] satisfies ReadonlyArray<ViewColumn<AgentCapabilityItem>>;

const capabilityRows = (
  agent: Agent,
  freshness: ReadonlyArray<CapabilityVerificationAge>,
): ReadonlyArray<AgentCapabilityItem> =>
  listCapabilities(agent).map(({ type, capability }) => {
    const native = capability.native;
    return {
      type,
      capabilityKey: type,
      native: agentCapabilityStatus(capability),
      axm: axmIntegrationStatus(capability),
      locations: "locations" in native ? native.locations : [],
      scopes: "scopes" in native ? [...native.scopes].sort().join(", ") : NONE,
      assessment: makeAgentCatalogCapability(agent, capability),
      freshness: freshness.find((entry) => entry.capability === type) ?? null,
    };
  });

export const handleAgentsCapabilities = Effect.fn("Agents.capabilities")(function* (
  agentId: string,
) {
  // Reuses the shared validator for its "did you mean" suggestions; the guard
  // below is what narrows the id for the catalog lookup.
  yield* validateAgentIds([agentId]).pipe(Effect.mapError(failureToAppError));
  if (!isCatalogAgentId(agentId)) {
    return yield* makeAppError({
      code: "validation",
      detail: `Unknown agent ID: ${agentId}`,
      suggestions: [
        { description: "Inspect supported agent IDs.", cmd: "axm agents list --available" },
      ],
    });
  }

  const agent = agentById(agentId);
  const asOf = DateTime.formatIsoDate(yield* DateTime.now);
  const freshness = capabilityVerificationAgeReport([agent], asOf);
  const items = capabilityRows(agent, freshness);
  const output = {
    agent: agent.id,
    name: agent.name,
    lifecycle: agentLifecycle(agent.id).state,
    asOf,
    freshness,
    profile: agent.profile ?? null,
    supported: [...getSupportedExtensionTypesForAgent(agent)],
    items,
    count: items.length,
  };

  yield* emitResult(output, AgentCapabilitiesOutputSchema, () => {
    const lifecycle = lifecycleCell(agent.id);
    return tableDoc(items, AgentCapabilityColumns, {
      caption: `${agent.name}${lifecycle === "" ? "" : ` (${lifecycle})`}   ${count(items.length, "capability")}`,
    });
  });
});

const capabilitiesConfig = {
  id: Argument.String("id").pipe(
    Argument.withDescription("Coding-agent ID, such as claude-code or cursor"),
  ),
} as const;

export const capabilitiesCommand = Command.make("capabilities", capabilitiesConfig, ({ id }) =>
  handleAgentsCapabilities(id).pipe(withRuntime("agents capabilities")),
).pipe(
  withArgvTracking(capabilitiesConfig),
  withCommandCapabilities(readOnlyCapabilities()),
  Command.withDescription(
    "Show what one coding agent supports, and how far AXM integrates with it",
  ),
  Command.withExamples([
    {
      command: "axm agents capabilities claude-code",
      description: "Show Claude Code's modeled extension capabilities",
    },
    {
      command: "axm agents capabilities cursor --json",
      description: "Emit one agent's capability matrix as JSON",
    },
  ]),
);
