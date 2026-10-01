import type { Agent } from "../../schema.js";

export const junieAgent = {
  id: "junie",
  name: "Junie",
  vendor: "JetBrains",
  homepage: "https://www.jetbrains.com/junie",
  interfaces: ["ide-extension", "cli"],
  family: "jetbrains",
  profile: {
    identity: {
      product: "Junie",
      surface: "IDE and CLI",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      claimScope:
        "Product identity and the specific capability or lifecycle changes described in this review; other capability evidence is retained separately.",
      reviewedAt: "2026-10-01",
      sources: [
        "https://junie.jetbrains.com/docs/junie-cli.html",
        "https://junie.jetbrains.com/docs/agent-skills.html",
        "https://junie.jetbrains.com/docs/junie-cli-hooks.html",
      ],
      conditions: ["CLI hooks remain an Early Access surface."],
      limitations: [
        "CLI and skill discovery reviewed; CLI hooks are Early Access and must not be inferred for every IDE.",
        "This review does not renew historical AXM runtime verification.",
      ],
    },
    lifecycleQualifications: [],
  },
  rootDir: ".junie",
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
      label: "Junie documentation",
      url: "https://junie.jetbrains.com/docs/",
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
        notes: null,
        docs: [],
        sources: ["https://junie.jetbrains.com/docs/agent-skills.html"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".junie/skills",
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
        lastVerified: "2026-08-05",
        writer: null,
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
        sources: ["https://junie.jetbrains.com/docs/junie-cli-mcp-configuration.html"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
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
            path: ".junie/mcp/mcp.json",
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
            id: "user",
            scope: "user",
            root: "home",
            path: ".junie/mcp/mcp.json",
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
            required: null,
            accepted: [null],
          },
          stdio: {
            typeField: {
              required: null,
              accepted: [null],
            },
            command: "split",
            envKey: "env",
          },
          remote: {
            typeField: {
              required: null,
              accepted: [null],
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
            locationIds: ["project", "user"],
          },
        },
      },
    },
    subagent: {
      native: {
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://junie.jetbrains.com/docs/junie-cli-subagents.html"],
        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".junie/agents",
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
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes:
          "Junie CLI hooks support seven command (type:command) event types: SessionStart, UserPromptSubmit, PreToolUse, Stop, StopFailure, PermissionRequest, and SessionEnd, configured from user config or explicit --config-location files. Default project hooks are still ignored for safety, so AXM does not write Junie hooks yet.",
        docs: [],
        sources: [
          "https://junie.jetbrains.com/docs/junie-cli-hooks.html",
          "https://junie.jetbrains.com/docs/junie-cli-configuration.html",
        ],
        scopes: ["user"],
        modeling: "native-unmodeled",
        locations: [],
        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason: "AXM has no trusted project hook writer target for Junie CLI hooks.",
      },
    },
  },
  instructions: {
    native: {
      availability: {
        via: "native",
      },
      vendorStatus: {
        state: "active",
      },
      notes:
        "Junie CLI reads persistent project guidance from .junie/AGENTS.md and suggests importing AGENTS.md-style files from other agents into that location.",
      docs: [],
      sources: [
        "https://junie.jetbrains.com/docs/guidelines-and-memory.html",
        "https://junie.jetbrains.com/docs/junie-cli-usage.html",
      ],
      scopes: ["project", "user"],
      standardsCompliance: "parity",
      convention: "vendor",
      kind: "own-file",
      locations: [
        {
          scope: "project",
          root: "project",
          path: ".junie/AGENTS.md",
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
    },
    axm: {
      status: "supported",
      lastVerified: "2026-08-05",
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: {
        via: "native",
      },
      vendorStatus: {
        state: "active",
      },
      notes:
        "Junie CLI uses the Action Allowlist for terminal commands, MCP tools, and other sensitive actions; brave mode allows all sensitive actions for a session.",
      docs: [],
      sources: [
        "https://junie.jetbrains.com/docs/junie-cli-usage.html",
        "https://junie.jetbrains.com/docs/action-allowlist.html",
      ],
      scopes: ["user"],
      mechanism: ["config-file", "ui-only"],
      locations: [
        {
          id: "user",
          scope: "user",
          root: "home",
          path: ".junie/allowlist.json",
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
        {
          id: "user-additional-1",
          scope: "user",
          root: "home",
          path: ".junie/config.json",
          shape: "file",
          role: "additional",
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
        example: "^\\Qaxm \\E[^\\s;&|<>@$]+.*$",
        notes:
          "Terminal rules can be exact commands, Java regular expressions, or standard regular expressions.",
      },
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason: "AXM has not implemented a Junie Action Allowlist writer.",
    },
  },
} as const satisfies Agent;
