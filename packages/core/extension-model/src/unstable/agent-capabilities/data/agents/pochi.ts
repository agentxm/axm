import type { Agent } from "../../schema.js";
export const pochiAgent = {
  id: "pochi",
  name: "Pochi",
  vendor: "TabbyML",
  homepage: "https://getpochi.com",
  interfaces: ["ide-extension"],
  family: null,
  rootDir: ".pochi",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Pochi documentation",
      url: "https://docs.getpochi.com",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.getpochi.com/skills/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".pochi/skills",
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
            scope: "project",
            root: "project",
            path: ".agents/skills",
            shape: "directory",
            role: "additional",
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
          sources: ["https://docs.getpochi.com/skills/"],
          conditions: [],
          limitations: ["No vendor runtime or AXM writer execution was performed."],
          claimScope: "Project Pochi and shared skill roots and invocation controls",
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [
          "https://docs.getpochi.com/mcp/",
          "https://docs.getpochi.com/tutorials/secure-db-access-in-pochi/",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        transports: ["stdio", "http"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },

        locations: [
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".pochi/config.jsonc",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
            format: "jsonc",
            keyPath: ["mcp"],
            attribution: "agent",
          },
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".pochi/config.jsonc",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
            format: "jsonc",
            keyPath: ["mcp"],
            attribution: "agent",
          },
        ],

        entryDialect: {
          activationField: {
            required: { name: "disabled", enabled: false, disabled: true },
            accepted: [{ name: "disabled", enabled: false, disabled: true }, null],
          },
          stdio: {
            typeField: { required: null, accepted: [null] },
            command: "split",
            envKey: "env",
          },
          remote: {
            typeField: { required: null, accepted: [null] },
            urlKey: {
              "streamable-http": "url",
            },
            headersKey: "headers",
          },
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: {
          config: {
            locationIds: ["project", "user"],
          },
        },
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Custom agents are Markdown files in project or home .pochi/agents with YAML frontmatter. Description is required; name defaults to the filename.",
        docs: [],
        sources: ["https://docs.getpochi.com/custom-agent/"],

        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".pochi/agents",
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
            path: ".pochi/agents",
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
          sources: ["https://docs.getpochi.com/custom-agent/"],
          conditions: [],
          limitations: ["No vendor runtime or AXM writer execution was performed."],
          claimScope:
            "Custom agents are Markdown files in project or home .pochi/agents with YAML frontmatter. Description is required; name defaults to the filename.",
        },
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
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
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Pochi reads custom-instruction files at the workspace root: README.pochi.md (primary) and AGENTS.md (alternative, treated identically), plus ~/.pochi/README.pochi.md at user scope. AXM manages the universal AGENTS.md.",
      docs: [],
      sources: ["https://docs.getpochi.com/rules/"],
      scopes: ["user", "project"],
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
      nestedDiscovery: false,
      importSyntax: null,
    },
    axm: {
      status: "supported",
      lastVerified: "2026-08-05",
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "UI Auto-Approve controls cover reading, writing, execution, MCP use and retry behavior.",
      docs: [],
      sources: ["https://docs.getpochi.com/permissions/"],

      scopes: ["user"],
      mechanism: ["ui-only"],
      locations: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
      review: {
        reviewedAt: "2026-10-01",
        sources: ["https://docs.getpochi.com/permissions/"],
        conditions: [],
        limitations: [
          "No vendor runtime or AXM writer execution was performed.",
          "No AXM permission writer was verified.",
        ],
        claimScope:
          "UI Auto-Approve controls cover reading, writing, execution, MCP use and retry behavior.",
      },
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },

  profile: {
    identity: {
      product: "Pochi",
      surface: "Pochi editor agent and CLI",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: [
        "https://docs.getpochi.com/custom-agent/",
        "https://docs.getpochi.com/permissions/",
        "https://docs.getpochi.com/skills/",
      ],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: mcp-server, hook, instructions.",
      ],
      claimScope: "Custom agent Markdown definitions and UI approvals",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
