import type { Agent } from "../../schema.js";
export const muxAgent = {
  id: "mux",
  name: "Xum",
  vendor: "Coder",
  homepage: "https://xum.coder.com",
  interfaces: ["cli", "desktop", "ide-extension"],
  family: null,
  rootDir: ".xum",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Xum documentation",
      url: "https://xum.coder.com",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "New project skills use .xum/skills. Xum also reads shared .agents/skills and legacy .mux/skills; .xum wins when both canonical and legacy directories exist.",
        docs: [],
        sources: [
          "https://mux.coder.com/agents/agent-skills",
          "https://xum.coder.com/agents/agent-skills",
          "https://xum.coder.com/reference/mux-compatibility",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".xum/skills",
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
            path: ".xum/skills",
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
          {
            scope: "user",
            root: "home",
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
          {
            scope: "project",
            root: "project",
            path: ".mux/skills",
            shape: "directory",
            role: "additional",
            status: "deprecated",
            applicability: {
              kind: "conditional",
              condition: "Used when the canonical .xum skills directory is absent.",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
        ],

        review: {
          reviewedAt: "2026-10-01",
          sources: [
            "https://xum.coder.com/agents/agent-skills",
            "https://xum.coder.com/reference/mux-compatibility",
          ],
          conditions: [],
          limitations: ["No vendor runtime or AXM writer execution was performed."],
          claimScope: "Canonical Xum skill roots and documented legacy readers",
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
        notes:
          "Xum stores stdio command strings under the servers key in ~/.xum/mcp.jsonc, .xum/mcp.jsonc, and .xum/mcp.local.jsonc.",
        docs: [],
        sources: [
          "https://xum.coder.com/config/mcp-servers",
          "https://xum.coder.com/reference/mux-compatibility",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "partial",
        convention: "vendor",
        transports: ["stdio"],

        locations: [],

        entryDialect: null,

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://xum.coder.com/reference/mux-compatibility"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Existing detailed protocol and hook behavior were not revalidated.",
          ],
          claimScope: "Canonical directory and environment naming after the rename",
        },
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: [
          "https://mux.coder.com/agents",
          "https://xum.coder.com/reference/mux-compatibility",
        ],
        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".xum/agents",
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
            path: ".xum/agents",
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
            path: ".mux/agents",
            shape: "directory",
            role: "additional",
            status: "deprecated",
            applicability: {
              kind: "conditional",
              condition: "Used when the corresponding canonical .xum directory is absent.",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
        ],

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://xum.coder.com/reference/mux-compatibility"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Agent frontmatter and delegation semantics were not revalidated.",
          ],
          claimScope: "Canonical project agent directory after the rename",
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Xum executes raw tool_pre, tool_post, tool_env, and init scripts from .xum or ~/.xum. Input is provided through XUM_* environment variables; tool_pre can block with a non-zero exit.",
        docs: [],
        sources: [
          "https://xum.coder.com/hooks/tools.md",
          "https://xum.coder.com/hooks/init.md",
          "https://xum.coder.com/reference/mux-compatibility",
        ],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",

        locations: [],

        entryDialect: null,

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://xum.coder.com/reference/mux-compatibility"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Existing detailed protocol and hook behavior were not revalidated.",
          ],
          claimScope: "Canonical directory and environment naming after the rename",
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
      notes: null,
      docs: [],
      sources: ["https://mux.coder.com/agents/instruction-files"],
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
      nestedDiscovery: true,
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
      availability: { via: "unknown" },
      vendorStatus: { state: "active" },
      notes:
        "Native availability is not established by this review; absence of a modeled AXM installation target does not establish vendor absence.",
      docs: [],
      sources: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },

  profile: {
    identity: {
      product: "Xum",
      surface: "Xum CLI and desktop, formerly Mux",
      edition: null,
      ownership: {
        company: "Coder",
        parentCompany: null,
        sources: ["https://xum.coder.com/reference/mux-compatibility"],
      },
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: [
        "https://xum.coder.com/reference/mux-compatibility",
        "https://xum.coder.com/agents/agent-skills",
      ],
      conditions: [
        "The catalog identifier mux is retained; Xum is the current product name. Vendor compatibility locations are reader facts, not AXM compatibility shims.",
      ],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: instructions, permissions.",
      ],
      claimScope: "Product rename and canonical configuration locations",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
