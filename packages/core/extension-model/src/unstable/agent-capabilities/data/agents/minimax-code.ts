import type { Agent } from "../../schema.js";
export const minimaxCodeAgent = {
  id: "minimax-code",
  name: "MiniMax Code",
  vendor: "MiniMax",
  homepage: "https://agent.minimax.io/download",
  interfaces: ["cli", "desktop"],
  family: null,
  rootDir: ".minimax",
  lifecycle: { state: "active" },
  detection: { project: { markers: [] }, user: { markers: [] } },
  docs: [{ label: "MiniMax Code", url: "https://github.com/MiniMax-AI/minimax-code" }],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "The CLI discovers workspace SKILL.md directories, built-in skills and installed plugin skills.",
        docs: [],
        sources: ["https://github.com/MiniMax-AI/minimax-code/blob/main/docs/tui-capabilities.md"],

        scopes: ["project"],
        standardsCompliance: "partial",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".minimax/skills",
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
        ],
        review: {
          reviewedAt: "2026-10-01",
          sources: [
            "https://github.com/MiniMax-AI/minimax-code/blob/main/docs/tui-capabilities.md",
          ],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Full Agent Skills conformance and every discovery priority were not assessed.",
          ],
          claimScope: "Workspace skill roots and directory symlink support",
        },
      },
      axm: {
        status: "unsupported",
        lastVerified: "2026-08-05",
        writer: null,
        reason:
          "AXM has not implemented a managed installation target for the documented native surface.",
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "The runtime reads .mcp.json only from the session main workspace. It supports stdio, HTTP and SSE; no ancestor or additional-directory search is performed.",
        docs: [],
        sources: [
          "https://github.com/MiniMax-AI/minimax-code/blob/main/packages/local-runtime-v2/docs/project-mcp.md",
        ],

        scopes: ["project"],
        standardsCompliance: "partial",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],
        entryDialect: null,
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".mcp.json",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
            id: "project",
            format: "json",
            keyPath: ["mcpServers"],
            attribution: "shared",
          },
        ],
        review: {
          reviewedAt: "2026-10-01",
          sources: [
            "https://github.com/MiniMax-AI/minimax-code/blob/main/packages/local-runtime-v2/docs/project-mcp.md",
          ],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "The user-profile configuration and writer dialect remain unmodeled.",
          ],
          claimScope: "Project MCP path and transports",
        },
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason:
          "AXM has not implemented a managed installation target for the documented native surface.",
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "The CLI runtime provides native subagent tools. A portable custom-subagent directory was not established.",
        docs: [],
        sources: ["https://github.com/MiniMax-AI/minimax-code/blob/main/docs/tui-capabilities.md"],

        scopes: [],
        locations: [],
        review: {
          reviewedAt: "2026-10-01",
          sources: [
            "https://github.com/MiniMax-AI/minimax-code/blob/main/docs/tui-capabilities.md",
          ],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "No automatically discoverable custom-subagent directory or configuration scope was established.",
          ],
          claimScope:
            "The CLI runtime provides native subagent tools. A portable custom-subagent directory was not established.",
        },

        modeling: "native-unmodeled",
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason:
          "AXM has not implemented a managed installation target for the documented native surface.",
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "MiniMax-format plugins register hook documents through their manifest hooks array; synchronous command hooks can return TUI systemMessage notices.",
        docs: [],
        sources: ["https://github.com/MiniMax-AI/minimax-code/blob/main/docs/hooks.md"],

        scopes: [],
        modeling: "native-unmodeled",
        entryDialect: null,
        locations: [],
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://github.com/MiniMax-AI/minimax-code/blob/main/docs/hooks.md"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Event serialization and AXM writing remain unmodeled.",
          ],
          claimScope:
            "MiniMax-format plugins register hook documents through their manifest hooks array; synchronous command hooks can return TUI systemMessage notices.",
        },
      },
      axm: { status: "unsupported", writer: null, lastVerified: null },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: "mcode init creates or updates AGENTS.md project guidance.",
      docs: [],
      sources: ["https://github.com/MiniMax-AI/minimax-code"],

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
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
        },
      ],
      nestedDiscovery: false,
      importSyntax: null,
      review: {
        reviewedAt: "2026-10-01",
        sources: ["https://github.com/MiniMax-AI/minimax-code"],
        conditions: [],
        limitations: [
          "No vendor runtime or AXM writer execution was performed.",
          "Nested instruction traversal and personal instruction locations were not established.",
        ],
        claimScope: "mcode init creates or updates AGENTS.md project guidance.",
      },
    },
    axm: { status: "unsupported", lastVerified: null, writer: null },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: "The CLI exposes execution permission modes, local rules and sandboxing.",
      docs: [],
      sources: ["https://github.com/MiniMax-AI/minimax-code/blob/main/docs/tui-capabilities.md"],

      scopes: ["user"],
      mechanism: ["ui-only", "config-file"],
      locations: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
      review: {
        reviewedAt: "2026-10-01",
        sources: ["https://github.com/MiniMax-AI/minimax-code/blob/main/docs/tui-capabilities.md"],
        conditions: [],
        limitations: [
          "No vendor runtime or AXM writer execution was performed.",
          "No AXM permission writer was verified.",
        ],
        claimScope: "The CLI exposes execution permission modes, local rules and sandboxing.",
      },
    },
    axm: { status: "unsupported", lastVerified: null, writer: null },
  },

  profile: {
    identity: {
      product: "MiniMax Code",
      surface: "MiniMax Code terminal TUI, headless CLI and ACP; desktop is separate",
      edition: null,
      ownership: null,
      modelProviders: ["MiniMax", "User-configured compatible providers"],
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: [
        "https://github.com/MiniMax-AI/minimax-code",
        "https://github.com/MiniMax-AI/minimax-code/blob/main/docs/tui-capabilities.md",
        "https://github.com/MiniMax-AI/minimax-code/blob/main/packages/local-runtime-v2/docs/project-mcp.md",
        "https://github.com/MiniMax-AI/minimax-code/blob/main/docs/hooks.md",
      ],
      conditions: [
        "Capabilities reviewed against public CLI source targeting TUI 0.4.12; matching npm versions do not prove identical source/build provenance.",
        "The desktop app source is outside the public CLI repository; ACP is a CLI protocol surface.",
      ],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
      ],
      claimScope: "Public CLI source capabilities and desktop boundary",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
