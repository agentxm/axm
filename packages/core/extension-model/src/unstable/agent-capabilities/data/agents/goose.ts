import type { Agent } from "../../schema.js";
export const gooseAgent = {
  id: "goose",
  name: "Goose",
  vendor: "Agentic AI Foundation (AAIF)",
  homepage: "https://goose-docs.ai",
  interfaces: ["cli", "desktop"],
  family: null,
  rootDir: ".goose",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Goose documentation",
      url: "https://goose-docs.ai/docs",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "The built-in Skills platform extension loads project and global .agents/skills plus compatibility roots. Summon separately loads recipes and agents and delegates work.",
        docs: [],
        sources: [
          "https://goose-docs.ai/docs/mcp/skills-mcp/",
          "https://goose-docs.ai/docs/guides/context-engineering/using-skills/",
        ],
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
            scope: "project",
            root: "project",
            path: ".goose/skills",
            shape: "directory",
            role: "additional",
            status: "deprecated",
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
            path: ".claude/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
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
          {
            scope: "user",
            root: "home",
            path: ".claude/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
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
          sources: ["https://goose-docs.ai/docs/guides/context-engineering/using-skills/"],
          conditions: ["The Skills platform extension must be enabled."],
          limitations: ["No vendor runtime or AXM writer execution was performed."],
          claimScope: "Built-in Skills platform extension, canonical and compatibility roots",
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
        sources: ["https://goose-docs.ai/docs/getting-started/using-extensions/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },

        locations: [],

        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason: "AXM has not implemented a Goose YAML extension config writer.",
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Goose discovers reusable Markdown agents and delegates them through the built-in Summon extension.",
        docs: [],
        sources: ["https://goose-docs.ai/docs/guides/context-engineering/custom-agents/"],

        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".agents/agents",
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
            path: ".agents/agents",
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
            path: ".goose/agents",
            shape: "directory",
            role: "additional",
            status: "compat",
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
            path: ".goose/agents",
            shape: "directory",
            role: "additional",
            status: "compat",
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
            path: ".claude/agents",
            shape: "directory",
            role: "additional",
            status: "compat",
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
            path: ".claude/agents",
            shape: "directory",
            role: "additional",
            status: "compat",
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
          sources: ["https://goose-docs.ai/docs/guides/context-engineering/custom-agents/"],
          conditions: [],
          limitations: ["No vendor runtime or AXM writer execution was performed."],
          claimScope:
            "Goose discovers reusable Markdown agents and delegates them through the built-in Summon extension.",
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
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Native Open Plugins hooks run commands from hooks/hooks.json inside discovered user or project .agents/plugins packages. Plugin discovery and enablement are required.",
        docs: [],
        sources: ["https://goose-docs.ai/docs/guides/context-engineering/hooks/"],

        scopes: ["user", "project"],
        modeling: "native-unmodeled",
        entryDialect: null,
        locations: [],
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://goose-docs.ai/docs/guides/context-engineering/hooks/"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Event serialization and AXM writing remain unmodeled.",
          ],
          claimScope:
            "Native Open Plugins hooks run commands from hooks/hooks.json inside discovered user or project .agents/plugins packages. Plugin discovery and enablement are required.",
        },
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
        "Goose loads AGENTS.md and .goosehints through directory hierarchies. CONTEXT_FILE_NAMES can override the filenames.",
      docs: [],
      sources: ["https://goose-docs.ai/docs/guides/context-engineering/using-goosehints/"],

      scopes: ["project", "user"],
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
          path: ".goosehints",
          shape: "file",
          role: "additional",
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
          root: "xdg-config",
          path: "goose/.goosehints",
          shape: "file",
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
      nestedDiscovery: true,
      importSyntax: null,
      review: {
        reviewedAt: "2026-10-01",
        sources: ["https://goose-docs.ai/docs/guides/context-engineering/using-goosehints/"],
        conditions: [],
        limitations: ["No vendor runtime or AXM writer execution was performed."],
        claimScope:
          "Goose loads AGENTS.md and .goosehints through directory hierarchies. CONTEXT_FILE_NAMES can override the filenames.",
      },
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Goose exposes permission mode, tool permissions, and .gooseignore controls. AXM has not modeled a narrow permission grant writer for Goose.",
      docs: [],
      sources: ["https://goose-docs.ai/docs/guides/managing-tools/tool-permissions/"],
      scopes: ["user", "project"],
      mechanism: ["config-file", "ui-only"],
      locations: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason: "AXM has not implemented a Goose permission grant writer.",
    },
  },

  profile: {
    identity: {
      product: "Goose",
      surface: "Goose CLI and desktop",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: [
        "https://goose-docs.ai/docs/guides/context-engineering/using-skills/",
        "https://goose-docs.ai/docs/guides/context-engineering/custom-agents/",
        "https://goose-docs.ai/docs/guides/context-engineering/hooks/",
        "https://goose-docs.ai/docs/guides/context-engineering/using-goosehints/",
      ],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: mcp-server, permissions.",
      ],
      claimScope: "Skills, custom agents, hooks and instruction discovery",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
