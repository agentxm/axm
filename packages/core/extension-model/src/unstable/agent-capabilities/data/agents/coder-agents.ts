import type { Agent } from "../../schema.js";

export const coderAgentsAgent = {
  id: "coder-agents",
  name: "Coder Agents",
  vendor: "Coder",
  homepage: "https://coder.com/docs/ai-coder/agents",
  interfaces: ["workspace-agent"],
  family: null,
  profile: {
    identity: {
      product: "Coder Agents",
      surface: "workspace-agent",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: [
        "https://coder.com/docs/ai-coder/agents",
        "https://coder.com/docs/ai-coder/agents/extending-agents",
      ],
      claimScope: "Product identity, delivery surface and cited extension documentation",
      conditions: [
        "AXM must run within the connected Coder workspace; template and administrator policy govern availability.",
      ],
      limitations: ["No vendor runtime session was executed."],
    },
    lifecycleQualifications: [],
  },
  rootDir: null,
  lifecycle: {
    state: "active",
  },
  detection: {
    project: {
      markers: [],
    },
    user: {
      markers: [],
    },
  },
  docs: [
    {
      label: "Official documentation",
      url: "https://coder.com/docs/ai-coder/agents",
    },
    {
      label: "Extension reference",
      url: "https://coder.com/docs/ai-coder/agents/extending-agents",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes:
          "Workspace skills can include supporting files. Personal skills are UI-managed single-file entries and are outside this filesystem projection.",
        docs: [],
        sources: ["https://coder.com/docs/ai-coder/agents/extending-agents"],
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://coder.com/docs/ai-coder/agents/extending-agents"],
          claimScope: "Skill discovery roots and standard SKILL.md format",
          conditions: [
            "Skill names must match their directories; SKILL.md is limited to 64 KB and supporting files to 512 KB.",
          ],
          limitations: [],
        },
        scopes: ["project"],
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
        ],
      },
      axm: {
        status: "supported",
        lastVerified: null,
        writer: null,
        verification: {
          verifiedAt: "2026-10-01",
          boundary: "configuration",
          evidence: [
            "specification:cli/skills/new/scaffolds-for-every-configured-agent",
            "packages/core/workspace-kernel/src/agent-adapters/agents/scoped-native-readers.spec.ts",
          ],
          limitations: [
            "Project-scope skill scaffolding and native reader resolution were exercised in isolated filesystems. This does not execute Coder Agents or establish personal skill uploads.",
          ],
        },
      },
    },
    "mcp-server": {
      native: {
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes: null,
        docs: [],
        sources: ["https://coder.com/docs/ai-coder/agents/extending-agents"],
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://coder.com/docs/ai-coder/agents/extending-agents"],
          claimScope: "Workspace MCP file, container and stdio/HTTP entry grammar",
          conditions: [
            "Workspace template must expose MCP and the current agent mode must permit tool use.",
          ],
          limitations: [],
        },
        scopes: ["project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },
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
        entryDialect: {
          activationField: {
            required: null,
            accepted: [null],
          },
          stdio: {
            typeField: {
              required: null,
              accepted: [null, { name: "type", value: "stdio" }],
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
                },
              },
              accepted: [
                null,
                {
                  name: "type",
                  value: {
                    "streamable-http": "http",
                  },
                },
              ],
            },
            urlKey: {
              "streamable-http": "url",
            },
            headersKey: "headers",
          },
        },
      },
      axm: {
        status: "supported",
        lastVerified: null,
        writer: {
          config: {
            locationIds: ["project"],
          },
        },
        verification: {
          verifiedAt: "2026-10-01",
          boundary: "configuration",
          evidence: [
            "specification:workspace/mcps/shared-native-writes-require-compatible-authority",
          ],
          limitations: [
            "Project .mcp.json install, update, repetition, disable and removal preserve sibling entries. Stdio and HTTP dialects are checked without executing Coder Agents or changing template policy.",
          ],
        },
      },
    },
    subagent: {
      native: {
        availability: {
          via: "unknown",
        },
        vendorStatus: {
          state: "active",
        },
        notes: "No scoped evidence establishes a reusable extension target for this capability.",
        docs: [],
        sources: [],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason: "No verified native extension target or AXM projection is recorded.",
      },
    },
    hook: {
      native: {
        availability: {
          via: "unknown",
        },
        vendorStatus: {
          state: "active",
        },
        notes: "No scoped evidence establishes a reusable extension target for this capability.",
        docs: [],
        sources: [],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason: "No verified native extension target or AXM projection is recorded.",
      },
    },
  },
  instructions: {
    native: {
      availability: {
        via: "unknown",
      },
      vendorStatus: {
        state: "active",
      },
      notes: "No scoped evidence establishes a reusable extension target for this capability.",
      docs: [],
      sources: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason: "No verified native extension target or AXM projection is recorded.",
    },
  },
  permissions: {
    native: {
      availability: {
        via: "unknown",
      },
      vendorStatus: {
        state: "active",
      },
      notes: "No scoped evidence establishes a reusable extension target for this capability.",
      docs: [],
      sources: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason: "No verified native extension target or AXM projection is recorded.",
    },
  },
} as const satisfies Agent;
