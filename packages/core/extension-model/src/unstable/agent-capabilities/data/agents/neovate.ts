import type { Agent } from "../../schema.js";
export const neovateAgent = {
  id: "neovate",
  name: "Neovate",
  vendor: "Ant Group",
  homepage: "https://github.com/neovateai/neovate-code",
  interfaces: ["cli"],
  family: null,
  rootDir: ".neovate",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Neovate Code documentation",
      url: "https://github.com/neovateai/neovate-code",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Neovate loads directory-based skills (each subdirectory contains a SKILL.md with name+description frontmatter) from .neovate/skills (project) and ~/.neovate/skills (user).",
        docs: [],
        sources: ["https://github.com/neovateai/neovate-code/blob/master/src/skill.ts"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".neovate/skills",
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
            path: ".neovate/skills",
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
          sources: ["https://github.com/neovateai/neovate-code/blob/master/src/skill.ts"],
          conditions: [],
          limitations: ["No vendor runtime or AXM writer execution was performed."],
          claimScope: "Native and Claude-compatible skill discovery",
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
          "https://github.com/neovateai/neovate-code/blob/master/src/mcp.ts",
          "https://github.com/neovateai/neovate-code/blob/master/src/config.ts",
          "https://github.com/neovateai/neovate-code/blob/master/src/commands/mcp.ts",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },

        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".neovate/config.json",
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
            keyPath: ["mcpServers"],
            attribution: "agent",
          },
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".neovate/config.json",
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
            keyPath: ["mcpServers"],
            attribution: "agent",
          },
        ],

        entryDialect: {
          activationField: {
            required: { name: "disable", enabled: false, disabled: true },
            accepted: [{ name: "disable", enabled: false, disabled: true }, null],
          },
          stdio: {
            typeField: {
              required: { name: "type", value: "stdio" },
              accepted: [{ name: "type", value: "stdio" }, null],
            },
            command: "split",
            envKey: "env",
          },
          remote: {
            typeField: {
              required: {
                name: "type",
                value: {
                  "streamable-http": "http",
                  sse: "sse",
                },
              },
              accepted: [
                {
                  name: "type",
                  value: {
                    "streamable-http": "http",
                    sse: "sse",
                  },
                },
              ],
            },
            urlKey: {
              "streamable-http": "url",
              sse: "url",
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
            locationIds: ["user", "project"],
          },
        },
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
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: "Native configuration defines approvalMode values default, autoEdit and yolo.",
      docs: [],
      sources: ["https://github.com/neovateai/neovate-code/blob/master/src/config.ts"],

      scopes: ["user"],
      mechanism: ["config-file"],
      locations: [],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
      review: {
        reviewedAt: "2026-10-01",
        sources: ["https://github.com/neovateai/neovate-code/blob/master/src/config.ts"],
        conditions: [],
        limitations: [
          "No vendor runtime or AXM writer execution was performed.",
          "No AXM permission writer was verified.",
        ],
        claimScope: "Native configuration defines approvalMode values default, autoEdit and yolo.",
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
      product: "Neovate",
      surface: "Neovate Code CLI",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: [
        "https://github.com/neovateai/neovate-code/blob/master/src/skill.ts",
        "https://github.com/neovateai/neovate-code/blob/master/src/config.ts",
      ],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: mcp-server, subagent, hook, instructions.",
      ],
      claimScope: "Skill discovery and native approval modes from vendor source",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
