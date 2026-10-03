import type { Agent } from "../../schema.js";

const unreviewed = {
  native: {
    availability: { via: "unknown" },
    vendorStatus: { state: "active" },
    notes: "This adapter models the local MCP extension-host surface only.",
    docs: [],
    sources: ["https://code.visualstudio.com/docs/agents/reference/mcp-configuration"],
  },
  axm: { status: "unsupported", writer: null, lastVerified: null },
} as const;

export const vscodeAgent = {
  id: "vscode",
  name: "Visual Studio Code",
  vendor: "Microsoft",
  homepage: "https://code.visualstudio.com",
  interfaces: ["ide-extension"],
  family: null,
  rootDir: ".vscode",
  lifecycle: { state: "active" },
  detection: { project: { markers: [] }, user: { markers: [] } },
  docs: [
    {
      label: "MCP configuration",
      url: "https://code.visualstudio.com/docs/agents/reference/mcp-configuration",
    },
  ],
  capabilities: {
    skill: unreviewed,
    subagent: unreviewed,
    hook: unreviewed,
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Local extension host only. Select the absolute user-profile mcp.json path with AXM_VSCODE_USER_MCP_CONFIG. Trust, input prompts, OAuth, policies and remote windows remain host-owned. Native runtime acceptance is pending.",
        docs: [],
        sources: ["https://code.visualstudio.com/docs/agents/reference/mcp-configuration"],
        scopes: ["project", "user"],
        standardsCompliance: "full",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: { variables: "env-colon", defaults: false },
        locations: [
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".vscode/mcp.json",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
            format: "jsonc",
            keyPath: ["servers"],
            attribution: "agent",
          },
          {
            id: "user",
            scope: "user",
            root: "home",
            path: "mcp.json",
            selectedFile: "vscode-user-mcp",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
            format: "jsonc",
            keyPath: ["servers"],
            attribution: "agent",
          },
          {
            id: "agent-host-project",
            scope: "project",
            root: "project",
            path: ".mcp.json",
            shape: "file",
            role: "additional",
            status: "canonical",
            applicability: {
              kind: "conditional",
              condition:
                "VS Code Agent Host is selected; local extension-host configuration alone does not establish this reader.",
            },
            provenance: { kind: "capability-sources" },
            format: "json",
            keyPath: ["mcpServers"],
            attribution: "shared",
          },
          {
            id: "agent-host-user",
            scope: "user",
            root: "home",
            path: ".copilot/mcp-config.json",
            shape: "file",
            role: "additional",
            status: "canonical",
            applicability: {
              kind: "conditional",
              condition: "VS Code Agent Host is selected with the default Copilot home.",
            },
            provenance: { kind: "capability-sources" },
            format: "json",
            keyPath: ["mcpServers"],
            attribution: "shared",
          },
        ],
        entryDialect: {
          activationField: { required: null, accepted: [null] },
          stdio: {
            typeField: {
              required: { name: "type", value: "stdio" },
              accepted: [{ name: "type", value: "stdio" }],
            },
            command: "split",
            envKey: "env",
            cwdKey: "cwd",
          },
          remote: {
            typeField: {
              required: { name: "type", value: { "streamable-http": "http", sse: "sse" } },
              accepted: [{ name: "type", value: { "streamable-http": "http", sse: "sse" } }],
            },
            urlKey: { "streamable-http": "url", sse: "url" },
            headersKey: "headers",
          },
        },
      },
      axm: {
        status: "supported",
        lastVerified: null,
        writer: { config: { locationIds: ["project", "user"] } },
      },
    },
  },
  instructions: unreviewed,
  permissions: unreviewed,
} as const satisfies Agent;
