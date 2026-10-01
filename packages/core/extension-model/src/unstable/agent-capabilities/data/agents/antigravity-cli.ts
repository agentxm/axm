import type { Agent } from "../../schema.js";
export const antigravityCliAgent = {
  id: "antigravity-cli",
  name: "Antigravity CLI",
  vendor: "Google",
  homepage: "https://antigravity.google/product/antigravity-cli",
  interfaces: ["cli"],
  family: "google",
  profile: {
    identity: {
      product: "Antigravity",
      surface: "CLI",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      claimScope:
        "Product identity and the specific capability or lifecycle changes described in this review; other capability evidence is retained separately.",
      reviewedAt: "2026-10-01",
      sources: [
        "https://antigravity.google/docs/subagents/",
        "https://antigravity.google/docs/cli/overview/",
      ],
      conditions: [],
      limitations: [
        "Custom subagents and CLI surface reviewed; other native mechanics retain their separate evidence.",
        "This review does not renew historical AXM runtime verification.",
      ],
    },
    lifecycleQualifications: [],
  },
  rootDir: null,
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [{ kind: "dir", path: ".agents", signal: "supporting", note: null }] },
    user: {
      markers: [
        { kind: "dir", path: "~/.gemini/antigravity-cli", signal: "definitive", note: null },
      ],
    },
  },
  docs: [
    { label: "Antigravity CLI documentation", url: "https://antigravity.google/docs/cli-overview" },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Because the CLI's project Skill directory is .agents/skills, --agent universal already wrote to the correct location; this entry adds CLI-specific detection and naming.",
        docs: [],
        sources: ["https://antigravity.google/docs/skills"],
        scopes: ["user", "project"],
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
          {
            scope: "project",
            root: "project",
            path: ".agent/skills",
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
        notes: null,
        docs: [],
        sources: ["https://antigravity.google/docs/mcp"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],

        locations: [],

        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason:
          "The Antigravity CLI shares product configuration with the desktop surface; AXM avoids a second writer until shared-target ownership is explicit.",
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Custom Markdown subagents are read by Antigravity 2.0 and the CLI. Authors supply native frontmatter; AXM preserves it and applies explicit agent overrides without translating tool names or changing execution-policy defaults.",
        docs: [{ label: "Custom subagents", url: "https://antigravity.google/docs/subagents/" }],
        sources: ["https://antigravity.google/docs/subagents/"],
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://antigravity.google/docs/subagents/"],
          conditions: [
            "Use Antigravity 2.0 or the Antigravity CLI with native name and description frontmatter; tool names, model, skills, plugins, and execution-policy settings must match the target harness.",
          ],
          limitations: [
            "Vendor execution of the generated subagent was not tested.",
            "AXM workspace setup currently supports project-scope Subagents; isolated user-scope adapter projection is checked but user-scope workspace installation remains unavailable.",
          ],
          claimScope: "Custom-subagent file discovery and native frontmatter contract.",
        },
        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".agents/agents",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "user",
            root: "home",
            path: ".gemini/config/agents",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
        ],
      },
      axm: {
        status: "supported",
        lastVerified: null,
        writer: null,
        verification: {
          verifiedAt: "2026-10-01",
          boundary: "configuration",
          evidence: ["specification:workspace/subagents/native-locations-respect-shape-and-proof"],
          limitations: [
            "Checks cover project and isolated user-scope file projection, shared ownership metadata, repetition, removal, and preservation of unowned files. They do not execute Antigravity.",
          ],
        },
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "The CLI reads command hooks from the workspace or global customization directory.",
        docs: [],
        sources: ["https://antigravity.google/docs/hooks"],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",

        locations: [],

        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason: "Antigravity's named hook bundles require a serializer AXM does not implement.",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://antigravity.google/docs/rules-workflows"],
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
        {
          scope: "project",
          root: "project",
          path: ".agents/rules",
          shape: "directory",
          role: "additional",
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
      notes: null,
      docs: [],
      sources: ["https://antigravity.google/docs/cli-permissions"],
      scopes: ["user"],
      mechanism: ["config-file"],
      locations: [
        {
          id: "user",
          scope: "user",
          root: "home",
          path: ".gemini/antigravity-cli/settings.json",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
          format: "json",
          gitignored: false,
        },
      ],
      grammar: {
        style: "regex",
        example: "command(axm)",
        notes: "Conflicting rules are evaluated Deny > Ask > Allow.",
      },
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason: "AXM does not yet implement Antigravity CLI permission-rule patches.",
    },
  },
} as const satisfies Agent;
