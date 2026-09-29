import type { Agent } from "../../schema.js";
export const onaAgent = {
  id: "ona",
  name: "Ona",
  vendor: "Ona",
  homepage: "https://ona.com",
  interfaces: ["ide-extension"],
  family: null,
  rootDir: ".ona",
  lifecycle: { state: "active" },
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
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: { status: "unsupported", lastVerified: null, writer: null },
    },
    hook: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
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
} as const satisfies Agent;
