import type { Agent } from "../../schema.js";
export const onaAgent = {
  id: "ona",
  name: "Ona",
  vendor: "Ona",
  homepage: "https://ona.com",
  interfaces: ["workspace-agent"],
  family: null,
  rootDir: ".ona",
  lifecycle: {
    state: "deprecated",
    since: null,
    note: "The original Ona Agent is deprecated. Ona Cloud migrated to Codex; Enterprise customer-managed Anthropic remains temporarily available.",
    supersededBy: null,
  },
  detection: {
    project: { markers: [{ kind: "dir", path: ".ona", signal: "definitive", note: null }] },
    user: { markers: [] },
  },
  docs: [{ label: "Ona Agent documentation", url: "https://ona.com/docs/ona/agents" }],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://ona.com/docs/ona/agents/skills"],
        scopes: ["project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".ona/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "project",
            root: "project",
            path: ".claude/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
        ],
      },
      axm: { status: "supported", lastVerified: "2026-08-05", writer: null },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Ona reads repository MCP definitions from .ona/mcp-config.json and also offers organization-managed HTTP integrations.",
        docs: [],
        sources: ["https://ona.com/docs/ona/mcp"],
        scopes: ["project"],
        standardsCompliance: "full",
        convention: "vendor",
        transports: ["stdio", "http"],

        locations: [],

        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason:
          "AXM has not implemented Ona's mcp-config.json dialect or hosted integration delivery.",
      },
    },
    subagent: {
      native: {
        availability: { via: "unknown" },
        vendorStatus: { state: "active" },
        notes:
          "Native availability is not established by this review; absence of a modeled AXM installation target does not establish vendor absence.",
        docs: [],
        sources: [],
      },
      axm: { status: "unsupported", lastVerified: null, writer: null },
    },
    hook: {
      native: {
        availability: { via: "unknown" },
        vendorStatus: { state: "active" },
        notes:
          "Native availability is not established by this review; absence of a modeled AXM installation target does not establish vendor absence.",
        docs: [],
        sources: [],
      },
      axm: { status: "unsupported", writer: null, lastVerified: null },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://ona.com/docs/ona/agents/overview"],
      scopes: ["project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      locations: [
        {
          scope: "project",
          root: "project",
          path: "AGENTS.md",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: { kind: "always" },
          provenance: { kind: "capability-sources" },
        },
      ],
      nestedDiscovery: true,
      importSyntax: null,
    },
    axm: { status: "supported", lastVerified: "2026-08-05", writer: null },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Ona administrators configure command and executable deny lists as organization guardrails; the vendor does not document a repository permission file.",
      docs: [],
      sources: ["https://ona.com/docs/ona/agents/overview"],
      scopes: ["user"],
      mechanism: ["ui-only"],
      locations: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason: "Ona guardrails are managed through the organization administration surface.",
    },
  },

  profile: {
    identity: {
      product: "Ona",
      surface:
        "Original Ona Agent harness in isolated development environments; not the whole Ona platform",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: ["https://ona.com/docs/ona/agents/overview"],
      conditions: [
        "Continued use requires Enterprise with customer-managed Anthropic model access on a supported AWS or GCP runner.",
      ],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: skill, mcp-server, subagent, hook, instructions, permissions.",
      ],
      claimScope: "Harness deprecation with cloud and Enterprise qualifications",
    },
    lifecycleQualifications: [
      {
        scope: "surface",
        subject: "Original Ona Agent on Ona Cloud",
        state: "retired",
        since: null,
        note: "No longer available; affected projects move to Codex Agent.",
        sources: ["https://ona.com/docs/ona/agents/overview"],
      },
      {
        scope: "edition",
        subject: "Enterprise customer-managed Anthropic Ona Agent",
        state: "deprecated",
        since: null,
        note: "Remains available temporarily on supported AWS/GCP Enterprise deployments. This does not retire the Ona platform.",
        sources: ["https://ona.com/docs/ona/agents/overview"],
      },
    ],
  },
} as const satisfies Agent;
