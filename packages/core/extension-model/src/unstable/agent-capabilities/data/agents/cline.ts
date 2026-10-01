import type { Agent } from "../../schema.js";

export const clineAgent = {
  id: "cline",
  name: "Cline",
  vendor: "Cline",
  homepage: "https://cline.bot",
  interfaces: ["cli", "ide-extension", "desktop"],
  family: null,
  profile: {
    identity: {
      product: "Cline",
      surface: "CLI, IDE and desktop",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      claimScope:
        "Product identity and the specific capability or lifecycle changes described in this review; other capability evidence is retained separately.",
      reviewedAt: "2026-10-01",
      sources: [
        "https://cline.bot/blog/cline-desktop-an-open-source-app-for-open-weight-models",
        "https://cline.bot/blog/how-we-migrated-11-million-users-to-clines-biggest-harness-upgrade",
      ],
      conditions: [],
      limitations: [
        "Desktop and harness migration reviewed; parallel sessions do not establish a custom subagent definition format.",
        "This review does not renew historical AXM runtime verification.",
      ],
    },
    lifecycleQualifications: [],
  },
  rootDir: ".cline",
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
      label: "Cline documentation",
      url: "https://docs.cline.bot",
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
        sources: ["https://docs.cline.bot/customization/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".cline/skills",
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
            path: ".clinerules/skills",
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
        notes:
          "Cline supports MCP in both the extension and CLI. The CLI MCP config is ~/.cline/mcp.json; extension config is exposed through the MCP settings UI. Entries use the community-standard mcpServers shape with a streamableHttp remote discriminator plus Cline-specific disabled and autoApprove fields.",
        docs: [],
        sources: ["https://docs.cline.bot/mcp/mcp-overview"],
        scopes: ["user"],
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
            path: ".cline/mcp.json",
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
            required: {
              name: "disabled",
              enabled: false,
              disabled: true,
            },
            accepted: [
              {
                name: "disabled",
                enabled: false,
                disabled: true,
              },
              null,
            ],
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
              required: {
                name: "type",
                value: {
                  "streamable-http": "streamableHttp",
                  sse: "sse",
                },
              },
              accepted: [
                {
                  name: "type",
                  value: {
                    "streamable-http": "streamableHttp",
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
            locationIds: ["user"],
          },
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
        notes: "No scoped primary-source evidence establishes absence of this capability.",
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
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes:
          "Cline stores executable hooks under ~/Documents/Cline/Hooks and .clinerules/hooks. The native script-directory shape is not compatible with AXM's grouped JSON command-hook writer.",
        docs: [],
        sources: ["https://docs.cline.bot/customization/hooks"],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",
        locations: [],
        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason: "AXM has not implemented a Cline hook script directory writer.",
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
      notes: "Uses a vendor rule directory under the AGENTS.md-governed rule umbrella.",
      docs: [],
      sources: ["https://docs.cline.bot/customization/cline-rules"],
      scopes: ["user", "project"],
      standardsCompliance: "partial",
      convention: "vendor",
      kind: "rules-dir",
      locations: [
        {
          scope: "project",
          root: "project",
          path: ".clinerules",
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
        "Cline exposes auto-approve controls in the extension/CLI UI and toolPolicies in the SDK. The public docs do not define a stable AXM-writable project permission grant file.",
      docs: [],
      sources: [
        "https://docs.cline.bot/cline-cli/interactive-mode",
        "https://docs.cline.bot/sdk/guides/permission-handling",
      ],
      scopes: ["user"],
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
      reason: "AXM has not implemented a Cline permission grant writer.",
    },
  },
} as const satisfies Agent;
