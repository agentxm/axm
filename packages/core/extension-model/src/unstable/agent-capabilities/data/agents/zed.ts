import type { Agent } from "../../schema.js";
export const zedAgent = {
  id: "zed",
  name: "Zed",
  vendor: "Zed Industries",
  homepage: "https://zed.dev",
  interfaces: ["ide-extension"],
  family: null,
  rootDir: ".zed",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [{ kind: "dir", path: ".zed", signal: "supporting", note: null }] },
    user: { markers: [{ kind: "dir", path: "~/.config/zed", signal: "definitive", note: null }] },
  },
  docs: [{ label: "Zed Agent documentation", url: "https://zed.dev/docs/ai/zed-agent" }],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Because Zed's project Skill directory is .agents/skills, --agent universal already wrote to the correct location; this entry adds Zed-specific detection and naming.",
        docs: [],
        sources: ["https://zed.dev/docs/ai/skills"],
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
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
          {
            scope: "user",
            root: "home",
            path: ".agents/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
        ],

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://zed.dev/docs/ai/skills"],
          conditions: [
            "Project skills require a trusted worktree.",
            "Skills apply to Zed Agent, not automatically to external agents or terminal threads.",
          ],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Only direct child skill folders are discovered.",
          ],
          claimScope: "Built-in Zed Agent skill roots and trust boundary",
        },
      },
      axm: { status: "supported", lastVerified: "2026-08-05", writer: null },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Zed configures context servers in settings; AXM has not modeled the Zed settings dialect.",
        docs: [],
        sources: ["https://zed.dev/docs/ai/mcp"],
        scopes: ["user", "project"],
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
        reason: "AXM has not implemented a Zed settings writer for context servers.",
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
      sources: ["https://zed.dev/docs/ai/instructions"],
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
        "Zed exposes tool permissions through agent settings and prompts; AXM does not model that settings surface.",
      docs: [],
      sources: ["https://zed.dev/docs/ai/tool-permissions"],
      scopes: ["user", "project"],
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
      reason: "AXM has not implemented Zed tool-permission settings.",
    },
  },

  profile: {
    identity: {
      product: "Zed",
      surface: "Zed built-in Agent; external agents are separate",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: ["https://zed.dev/docs/ai/skills"],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: mcp-server, subagent, hook, instructions, permissions.",
      ],
      claimScope: "Skill scopes, trust conditions and invocation",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
