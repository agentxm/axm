import type { Agent } from "../../schema.js";
export const hermesAgent = {
  id: "hermes",
  name: "Hermes Agent",
  vendor: "Nous Research",
  homepage: "https://hermes-agent.nousresearch.com",
  interfaces: ["cli"],
  family: null,
  rootDir: ".hermes",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Hermes Agent documentation",
      url: "https://hermes-agent.nousresearch.com/docs",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Hermes reads SKILL.md skills from ~/.hermes/skills as the source of truth. Additional external skill directories can be configured in ~/.hermes/config.yaml for shared team use.\n",
        docs: [],
        sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/skills"],
        scopes: ["user"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "user",
            root: "home",
            path: ".hermes/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
        ],

        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/skills"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "Additional directory precedence and every frontmatter field were not revalidated.",
          ],
          claimScope: "User skill library and additional configured sources",
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
          "Hermes declares MCP servers under mcp_servers in ~/.hermes/config.yaml. AXM writes declared named entries in that YAML file without ownership metadata, preserving other entries and coexisting with hermes mcp commands.\n",
        docs: [],
        sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp"],
        scopes: ["user"],
        standardsCompliance: "partial",
        convention: "vendor",
        transports: ["stdio", "http"],

        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".hermes/config.yaml",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
            format: "yaml",
            keyPath: ["mcp_servers"],
            attribution: "agent",
          },
        ],

        entryDialect: {
          activationField: {
            required: { name: "enabled", enabled: true, disabled: false },
            accepted: [{ name: "enabled", enabled: true, disabled: false }],
          },
          stdio: {
            typeField: { required: null, accepted: [null] },
            command: "split",
            envKey: "env",
          },
          remote: {
            typeField: { required: null, accepted: [null] },
            urlKey: { "streamable-http": "url" },
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
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Native delegate_task workers have isolated contexts, parallel execution and configurable delegation models.",
        docs: [],
        sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation/"],

        scopes: [],
        locations: [],
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation/"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "No automatically discoverable custom-subagent directory or configuration scope was established.",
          ],
          claimScope:
            "Native delegate_task workers have isolated contexts, parallel execution and configurable delegation models.",
        },

        modeling: "native-unmodeled",
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
          "Hermes has profile config.yaml shell hooks, Python plugin hooks, outbound webhooks and Gateway-only HOOK.yaml plus handler.py directories. Gateway hooks do not run in the CLI or Desktop; modeled event mappings cover only part of this surface.",
        docs: [],
        sources: [
          "https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks",
          "https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks/",
        ],
        scopes: ["user"],
        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".hermes/config.yaml",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
            format: "yaml",
            gitignored: false,
          },
          {
            id: "user-additional-1",
            scope: "user",
            root: "home",
            path: ".hermes/shell-hooks-allowlist.json",
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

        entryDialect: null,
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks/"],
          conditions: [],
          limitations: [
            "No vendor runtime or AXM writer execution was performed.",
            "The existing event mappings and allowlist mechanics were not exhaustively revalidated.",
          ],
          claimScope: "Hook system availability and surface boundaries",
        },

        mechanism: ["command-stdin"],
        events: [
          {
            nativeName: "pre_tool_call",
            canonical: "tool.pre",
            matcher: {
              kind: "regex",
              example: "terminal|read_file|write_file",
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
              {
                kind: "block",
                outcomes: ["deny"],
              },
            ],
            sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "post_tool_call",
            canonical: "tool.post",
            matcher: {
              kind: "regex",
              example: "terminal|read_file|write_file",
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
            ],
            sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "pre_llm_call",
            canonical: "prompt.submit",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
              {
                kind: "modify",
                operations: ["inject-context"],
              },
            ],
            sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "post_llm_call",
            canonical: "turn.end",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
            ],
            sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "on_session_start",
            canonical: "session.start",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
            ],
            sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "subagent_stop",
            canonical: "subagent.stop",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
            ],
            sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "transform_llm_output",
            canonical: "turn.end",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: null,
            },
            decision: [
              {
                kind: "modify",
                operations: ["modify-output"],
              },
            ],
            sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks"],
            lastVerified: "2026-08-05",
          },
        ],
        tools: [],
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
        "Hermes reads AGENTS.md as a recursive project instruction source. .hermes.md and SOUL.md are higher-priority native alternatives at the git root, but AGENTS.md is the cross-tool standard AXM writes.\n",
      docs: [],
      sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/configuration"],
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
      product: "Hermes Agent",
      surface: "Hermes CLI and Gateway; hook behavior varies by surface",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: [
        "https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks/",
        "https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation/",
        "https://hermes-agent.nousresearch.com/docs/user-guide/features/skills",
      ],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Capability mechanics not revalidated in this review: mcp-server, instructions, permissions.",
      ],
      claimScope: "Hook systems and native subagent delegation",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
