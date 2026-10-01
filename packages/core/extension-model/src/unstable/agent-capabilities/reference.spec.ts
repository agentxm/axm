import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  AGENTS_BY_ID,
  AgentSchema,
  AgentCatalogReferenceSchema,
  capabilityVerificationAgeReport,
  deriveHookPortability,
  isCapabilitySupported,
  makeAgentCatalogReference,
  type Agent,
} from "./index.js";

export const specification = defineSpecification({
  requirement: "agents/catalog/preserves-qualified-support-and-evidence",
  title: "Agent catalog claims preserve uncertainty, conditions, and evidence boundaries",
  statement:
    "When publishing agent capability claims, AXM shall distinguish unknown native availability from documented absence, qualify conditional and manual installation, preserve the scope of product and edition research, and report source review separately from attributable execution verification without treating historical record dates as execution evidence.",
  class: "functional",
  role: "interface",
  goals: ["agent-interoperability", "actionable-diagnostics"],
  boundary: "memory",
  methods: ["example", "contract"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "Controlled catalog claims establish reporting semantics, not current vendor behavior or actual vendor execution.",
      retirementCondition:
        "Attach separately attributable source and vendor runtime evidence to the claims being published.",
    },
  ],
});

const review = {
  reviewedAt: "2026-09-30",
  sources: ["https://example.com/skills"],
  conditions: [],
  limitations: [],
  claimScope: "Skill discovery in the project workspace.",
};

const unavailable = {
  native: {
    availability: { via: "none" },
    vendorStatus: { state: "active" },
    notes: null,
    docs: [],
    sources: [],
  },
  axm: { status: "unsupported", lastVerified: null, writer: null },
};

const baseAgent: Agent = Schema.decodeUnknownSync(AgentSchema)({
  id: "sample-agent",
  name: "Sample agent",
  vendor: "Example",
  homepage: "https://example.com",
  interfaces: ["cli"],
  family: null,
  rootDir: null,
  lifecycle: { state: "active" },
  detection: { project: { markers: [] }, user: { markers: [] } },
  docs: [],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://example.com/skills"],
        scopes: ["project"],
        standardsCompliance: "full",
        convention: "universal",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".agents/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
        ],
      },
      axm: { status: "supported", lastVerified: "2026-08-05", writer: null },
    },
    "mcp-server": unavailable,
    subagent: unavailable,
    hook: unavailable,
  },
  instructions: unavailable,
  permissions: unavailable,
});

const agentWithSkill = (native: unknown, axm: unknown): Agent =>
  Schema.decodeUnknownSync(AgentSchema)({
    ...baseAgent,
    capabilities: {
      ...baseAgent.capabilities,
      skill: { native, axm },
    },
  });

const knownNative = {
  ...baseAgent.capabilities.skill.native,
  notes: null,
  review,
};

const supportedAxm = {
  status: "supported",
  lastVerified: "2026-08-05",
  writer: null,
};

const skillReport = (agent: Agent) => {
  const catalog = makeAgentCatalogReference([agent]);
  const decoded = Schema.decodeUnknownSync(AgentCatalogReferenceSchema, {
    onExcessProperty: "error",
  })(catalog);
  expect(decoded.schemaVersion).toBe(1);
  const entry = decoded.entries[0];
  expect(entry).toBeDefined();
  if (entry === undefined) throw new Error("Expected one catalog entry");
  return entry.capabilities.skill;
};

describe("qualified agent catalog claims", () => {
  it("preserves documented built-in delegation without turning it into a custom-subagent writer", () => {
    const agent = Schema.decodeUnknownSync(AgentSchema)({
      ...baseAgent,
      capabilities: {
        ...baseAgent.capabilities,
        subagent: {
          native: {
            ...unavailable.native,
            availability: { via: "native" },
            sources: ["https://example.com/delegation"],
            modeling: "native-unmodeled",
            scopes: [],
            locations: [],
          },
          axm: { status: "supported", lastVerified: null, writer: null },
        },
      },
    });
    expect(isCapabilitySupported(agent.capabilities.subagent)).toBe(false);
    expect(makeAgentCatalogReference([agent]).entries[0]?.capabilities.subagent).toMatchObject({
      native: { status: "native", scopes: [] },
      installability: { status: "unsupported" },
    });
  });

  it("keeps unknown distinct from absence and refuses a positive installability claim", () => {
    const absentNative = {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: [],
    };
    const inactive = { status: "unknown", lastVerified: null, writer: null };
    const unknown = agentWithSkill({ ...absentNative, availability: { via: "unknown" } }, inactive);
    const absent = agentWithSkill(absentNative, { ...inactive, status: "unsupported" });
    expect(isCapabilitySupported(unknown.capabilities.skill)).toBe(false);
    expect(
      isCapabilitySupported({
        ...unknown.capabilities.skill,
        axm: { status: "supported", lastVerified: "2026-09-30", writer: null },
      }),
    ).toBe(false);
    expect(skillReport(unknown).native.status).toBe("unknown");
    expect(skillReport(unknown).installability.status).toBe("unknown");
    expect(skillReport(absent).installability.status).toBe("unsupported");
  });

  it("does not turn a source review or historical date into execution evidence", () => {
    const agent = agentWithSkill(knownNative, supportedAxm);
    const report = skillReport(agent);
    expect(report.native.review?.reviewedAt).toBe("2026-09-30");
    expect(report.axm.legacyLastVerified).toBe("2026-08-05");
    expect(report.axm.verification).toBeNull();
    const age = capabilityVerificationAgeReport([agent], "2026-09-30").find(
      (entry) => entry.capability === "skill",
    );
    expect(age).toMatchObject({
      reviewAgeDays: 0,
      verifiedAt: null,
      verificationAgeDays: null,
      verificationOverdue: true,
    });
  });

  it("keeps configuration evidence distinct from vendor runtime execution", () => {
    const agent = agentWithSkill(knownNative, {
      ...supportedAxm,
      verification: {
        verifiedAt: "2026-09-29",
        boundary: "configuration",
        evidence: ["specification:agents/skills/writes-project-content"],
        limitations: [],
      },
    });
    expect(skillReport(agent).axm.verification?.boundary).toBe("configuration");
    expect(skillReport(agent).installability.limitations).toContain(
      "Configuration output was verified; vendor runtime behavior was not established by that evidence.",
    );
    expect(
      capabilityVerificationAgeReport([agent], "2026-09-30").find(
        (entry) => entry.capability === "skill",
      ),
    ).toMatchObject({
      reviewAgeDays: 0,
      verificationAgeDays: 1,
      verificationBoundary: "configuration",
    });
  });

  it("reports quarterly source freshness and missing verification independently for every slot", () => {
    const sourceOnly = {
      native: { ...unavailable.native, review: { ...review, reviewedAt: "2026-07-01" } },
      axm: unavailable.axm,
    };
    const agent = Schema.decodeUnknownSync(AgentSchema)({
      ...baseAgent,
      capabilities: {
        skill: sourceOnly,
        "mcp-server": sourceOnly,
        subagent: sourceOnly,
        hook: sourceOnly,
      },
      instructions: sourceOnly,
      permissions: sourceOnly,
    });
    const onBudget = capabilityVerificationAgeReport([agent], "2026-09-29");
    const overdue = capabilityVerificationAgeReport([agent], "2026-09-30");
    expect(onBudget).toHaveLength(6);
    expect(onBudget.every((entry) => entry.budgetDays === 90 && !entry.reviewOverdue)).toBe(true);
    expect(overdue.every((entry) => entry.reviewAgeDays === 91 && entry.reviewOverdue)).toBe(true);
    expect(
      overdue.every(
        (entry) => !entry.reviewMissing && entry.verificationMissing && !entry.verificationOverdue,
      ),
    ).toBe(true);
    expect(
      capabilityVerificationAgeReport([baseAgent], "2026-09-30").every(
        (entry) => entry.reviewMissing,
      ),
    ).toBe(true);
  });

  it("preserves existing notes and explicit conditions instead of advertising unconditional support", () => {
    const agent = agentWithSkill(
      {
        ...knownNative,
        notes: "Only available inside the attached workspace.",
        review: { ...review, conditions: ["The workspace administrator must enable extensions."] },
      },
      supportedAxm,
    );
    expect(skillReport(agent).installability).toMatchObject({
      status: "conditional",
      conditions: [
        "The workspace administrator must enable extensions.",
        "Only available inside the attached workspace.",
      ],
    });
  });

  it("does not promote a profile review into a review of an individual capability", () => {
    const agent = Schema.decodeUnknownSync(AgentSchema)({
      ...baseAgent,
      profile: {
        identity: {
          product: "Example",
          surface: "CLI",
          edition: null,
          ownership: null,
          modelProviders: null,
        },
        review: { ...review, claimScope: "Product identity only." },
        lifecycleQualifications: [
          {
            scope: "edition",
            subject: "Personal edition",
            state: "retired",
            since: "2026-09-01",
            note: "Personal edition retired; enterprise remains active.",
            sources: ["https://example.com/lifecycle"],
          },
        ],
      },
    });
    const report = skillReport(agent);
    expect(report.native.review).toBeNull();
    expect(report.installability.status).toBe("conditional");
    expect(report.installability.conditions).toContain(
      "Personal edition retired; enterprise remains active.",
    );
    expect(makeAgentCatalogReference([agent]).entries[0]?.lifecycle.state).toBe("active");
  });

  it("reports hosted delivery as manual and excludes writer mechanics from the versioned artifact", () => {
    const hosted = skillReport(AGENTS_BY_ID.chatgpt);
    expect(hosted.installability.status).toBe("manual");
    const encoded = JSON.stringify(
      makeAgentCatalogReference([AGENTS_BY_ID.codex, AGENTS_BY_ID.chatgpt]),
    );
    expect(encoded).not.toMatch(/"(?:writer|entryDialect|detection|rootDir)":/u);
    expect(() =>
      Schema.decodeUnknownSync(AgentCatalogReferenceSchema)({ schemaVersion: 2, entries: [] }),
    ).toThrow();
  });

  it("records non-command hook mechanisms without claiming AXM can execute them", () => {
    const agent = Schema.decodeUnknownSync(AgentSchema)({
      ...AGENTS_BY_ID["claude-code"],
      capabilities: {
        ...AGENTS_BY_ID["claude-code"].capabilities,
        hook: {
          ...AGENTS_BY_ID["claude-code"].capabilities.hook,
          native: {
            ...AGENTS_BY_ID["claude-code"].capabilities.hook.native,
            mechanism: ["command-stdin", "http", "prompt", "mcp"],
          },
        },
      },
    });
    expect(
      makeAgentCatalogReference([agent]).entries[0]?.capabilities.hook.native.mechanisms,
    ).toContain("http");
    expect(
      deriveHookPortability(agent, {
        events: ["tool.pre"],
        mechanisms: ["http"],
        decisions: ["observe"],
      }),
    ).toMatchObject({
      standardsCompliance: "partial",
      reason: expect.stringContaining("command-stdin"),
    });
  });
});
