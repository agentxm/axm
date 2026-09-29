import type { Agent } from "../../schema.js";
export const antigravityCliAgent = {
  id: "antigravity-cli",
  name: "Antigravity CLI",
  vendor: "Google",
  homepage: "https://antigravity.google/product/antigravity-cli",
  interfaces: ["cli"],
  family: "google",
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
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes:
          "The CLI manages background subagents in its Agent Manager, but the vendor docs do not define a custom-subagent file directory.",
        docs: [],
        sources: ["https://antigravity.google/product/antigravity-cli"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason: "No vendor-documented custom-subagent file target is available.",
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
