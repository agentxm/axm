import type { Agent } from "../../schema.js";
export const mistralVibeAgent = {
  id: "mistral-vibe",
  name: "Mistral Vibe",
  vendor: "Mistral AI",
  homepage: "https://docs.mistral.ai/vibe/code/overview",
  interfaces: ["cli", "ide-extension"],
  family: "mistral",
  rootDir: ".vibe",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Mistral Vibe documentation",
      url: "https://docs.mistral.ai/vibe/code/overview",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.mistral.ai/vibe/code/cli/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".vibe/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-07-22",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.mistral.ai/vibe/code/cli/mcp-servers"],
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
        status: "supported",
        lastVerified: "2026-06-06",
        writer: {
          config: {
            serversKey: "mcp_servers",
            nativeEnabled: true,
            targets: [
              {
                scope: "project",
                path: ".vibe/config.toml",
                format: "toml",
              },
              {
                scope: "user",
                path: "~/.vibe/config.toml",
                format: "toml",
              },
            ],
            stdio: {
              typeField: {
                name: "transport",
                value: "stdio",
              },
              command: "split",
              envKey: "env",
            },
            remote: {
              typeField: {
                name: "transport",
                value: {
                  "streamable-http": "streamable-http",
                  sse: "http",
                },
              },
              urlKey: {
                "streamable-http": "url",
                sse: "url",
              },
              headersKey: "headers",
            },
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
        sources: ["https://docs.mistral.ai/vibe/code/cli/agents"],
        scopes: ["user", "project"],
        directory: ".vibe/agents",
        layout: "directory",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Vibe executes TOML-configured hook commands with event data on standard input; pre-tool hooks can deny or modify tool input and hook output can inject context.",
        docs: [],
        sources: ["https://docs.mistral.ai/vibe/code/cli/hooks"],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        configFiles: [
          {
            scope: "project",
            path: ".vibe/hooks.toml",
            format: "toml",
            gitignored: false,
          },
          {
            scope: "user",
            path: "~/.vibe/hooks.toml",
            format: "toml",
            gitignored: false,
          },
        ],
        events: [
          {
            nativeName: "pre_tool",
            canonical: "tool.pre",
            matcher: { kind: "regex", example: "bash|read_file|write_file", notes: null },
            decision: [
              { kind: "observe" },
              { kind: "block", outcomes: ["deny"] },
              { kind: "modify", operations: ["modify-input", "inject-context"] },
            ],
            sources: ["https://docs.mistral.ai/vibe/code/cli/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "post_tool",
            canonical: "tool.post",
            matcher: { kind: "regex", example: "bash|read_file|write_file", notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://docs.mistral.ai/vibe/code/cli/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "post_agent",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://docs.mistral.ai/vibe/code/cli/hooks"],
            lastVerified: "2026-07-22",
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
      notes: null,
      docs: [],
      sources: ["https://docs.mistral.ai/vibe/code/cli/agents"],
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: false,
      importSyntax: null,
    },
    axm: {
      status: "supported",
      lastVerified: "2026-06-06",
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Vibe supports per-tool always/ask policies and Bash allow/deny command rules in layered config files.",
      docs: [],
      sources: ["https://docs.mistral.ai/vibe/code/safety-approvals-permissions"],
      scopes: ["user", "project"],
      mechanism: ["config-file", "cli-flag"],
      configFiles: [
        {
          scope: "project",
          path: ".vibe/config.toml",
          format: "toml",
          gitignored: false,
        },
        {
          scope: "user",
          path: "~/.vibe/config.toml",
          format: "toml",
          gitignored: false,
        },
      ],
      grammar: {
        style: "tool-call",
        example: '[tools.bash]\npermission = "ask"',
        notes:
          "Per-tool policy is always or ask; Bash rules additionally allow or deny command patterns.",
      },
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },
} as const satisfies Agent;
