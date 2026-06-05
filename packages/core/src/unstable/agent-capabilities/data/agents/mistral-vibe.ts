import type { Agent } from "../../schema.js";

export const mistralVibeAgent = {
  id: "mistral-vibe",
  name: "Mistral Vibe",
  vendor: "Mistral AI",
  homepage: "https://docs.mistral.ai/mistral-vibe/overview",
  interfaces: ["cli"],
  family: "mistral",
  rootDir: ".vibe",
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Mistral Vibe documentation",
      url: "https://docs.mistral.ai/mistral-vibe/overview",
    },
  ],
  capabilities: {
    skill: {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://docs.mistral.ai/mistral-vibe/agents-skills"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".vibe/skills",
    },
    command: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
    "mcp-server": {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://docs.mistral.ai/mistral-vibe/terminal/configuration"],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      transports: ["stdio", "http"],
      mcpEnvExpansion: {
        variables: "none",
        defaults: false,
      },
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
          envKey: null,
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
        transform: null,
      },
    },
    subagent: {
      lifecycle: "supported",
      notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
      docs: [],
      sources: ["https://docs.mistral.ai/mistral-vibe/agents-skills"],
      lastVerified: "2026-05-20",
      scopes: ["user"],
      directory: ".vibe/agents",
      layout: "directory",
    },
    files: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
    rule: {
      lifecycle: "supported",
      notes: null,
      docs: [],
      sources: ["https://docs.mistral.ai/mistral-vibe/agents-skills"],
      lastVerified: "2026-05-20",
      scopes: ["project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: false,
      importSyntax: null,
    },
    hook: {
      lifecycle: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
  },
  permissions: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
} as const satisfies Agent;
