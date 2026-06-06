import type { Agent } from "../../schema.js";
export const opencodeAgent = {
  id: "opencode",
  name: "OpenCode",
  vendor: "SST",
  homepage: "https://opencode.ai",
  interfaces: ["cli"],
  family: null,
  rootDir: ".opencode",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "OpenCode documentation",
      url: "https://opencode.ai/docs",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://opencode.ai/docs"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".opencode/skills",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "No industry spec for slash commands yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://opencode.ai/docs"],
        scopes: ["user", "project"],
        directory: ".opencode/commands",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://opencode.ai/docs/mcp-servers/", "https://opencode.ai/docs/config/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        transports: ["stdio", "http"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },
      },
      axm: {
        support: "supported",
        lastVerified: "2026-06-05",
        writer: {
          config: {
            serversKey: "mcp",
            nativeEnabled: true,
            targets: [
              {
                scope: "project",
                path: "opencode.jsonc",
                format: "jsonc",
              },
              {
                scope: "user",
                path: "~/.config/opencode/opencode.json",
                format: "json",
              },
            ],
            stdio: {
              typeField: {
                name: "type",
                value: "local",
              },
              command: "array",
              envKey: "environment",
            },
            remote: {
              typeField: {
                name: "type",
                value: {
                  "streamable-http": "remote",
                },
              },
              urlKey: {
                "streamable-http": "url",
              },
              headersKey: "headers",
            },
            transform: null,
          },
        },
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
        docs: [],
        sources: ["https://opencode.ai/docs"],
        scopes: ["user", "project"],
        directory: ".opencode/agents",
        layout: "directory",
      },
      axm: {
        support: "supported",
        lastVerified: "2026-05-20",
        writer: null,
      },
    },
    files: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: {
        support: "unsupported",
        writer: null,
      },
    },
    rule: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: {
        support: "unsupported",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "OpenCode exposes lifecycle hooks through in-process JavaScript/TypeScript plugins. AXM models the surface but does not serialize plugin hooks yet.",
        docs: [],
        sources: ["https://opencode.ai/docs/plugins/"],
        scopes: ["user", "project"],
        mechanism: ["in-process-plugin"],
        configFiles: [],
        events: [
          {
            nativeName: "tool.execute.before",
            canonical: "tool.pre",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: "Plugin code branches imperatively.",
            },
            decision: [
              { kind: "observe" },
              { kind: "block", outcomes: ["allow", "deny"] },
              { kind: "modify", operations: ["modify-input"] },
            ],
            sources: ["https://opencode.ai/docs/plugins/"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "tool.execute.after",
            canonical: "tool.post",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: "Plugin code branches imperatively.",
            },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["modify-output"] }],
            sources: ["https://opencode.ai/docs/plugins/"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "file.edited",
            canonical: "file.changed",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: "Plugin code branches imperatively.",
            },
            decision: [{ kind: "observe" }],
            sources: ["https://opencode.ai/docs/plugins/"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "session.created",
            canonical: "session.start",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: "Plugin code branches imperatively.",
            },
            decision: [{ kind: "observe" }],
            sources: ["https://opencode.ai/docs/plugins/"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "session.compacted",
            canonical: "compaction.post",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: "Plugin code branches imperatively.",
            },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://opencode.ai/docs/plugins/"],
            lastVerified: "2026-06-06",
          },
        ],
      },
      canonical: {
        events: ["tool.pre", "tool.post", "file.changed", "session.start", "compaction.post"],
        mechanism: ["in-process-plugin"],
        matcherKinds: ["none-imperative"],
        decision: [
          { kind: "observe" },
          { kind: "block", outcomes: ["allow", "deny"] },
          { kind: "modify", operations: ["modify-input", "modify-output", "inject-context"] },
        ],
      },
      axm: {
        support: "unsupported",
        reason: "AXM has not implemented in-process plugin hook writers.",
        writer: null,
      },
    },
  },
  permissions: {
    native: {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: [],
    },
    axm: {
      support: "unsupported",
      writer: null,
    },
  },
} as const satisfies Agent;
