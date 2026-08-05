import type { Agent } from "../../schema.js";
export const ampAgent = {
  id: "amp",
  name: "Amp",
  vendor: "Sourcegraph",
  homepage: "https://ampcode.com",
  interfaces: ["cli", "ide-extension"],
  family: "sourcegraph",
  rootDir: null,
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Amp Owner's Manual",
      url: "https://ampcode.com/manual",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://ampcode.com/manual#agent-skills"],
        scopes: ["user", "project"],
        standardsCompliance: "partial",
        convention: "vendor",
        directory: ".agents/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
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
        notes:
          "Amp declares always-available MCP servers under the flat amp.mcpServers settings key in ~/.config/amp/settings.json (user) or .amp/settings.json (workspace, which requires explicit approval), and skill-scoped MCP servers through mcp.json inside a skill directory.",
        docs: [],
        sources: ["https://ampcode.com/manual#MCP", "https://ampcode.com/manual#configuration"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "braced",
          defaults: false,
        },
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason:
          "Amp nests its servers under the flat amp.mcpServers settings key, which McpServersKey cannot express; a writer needs a schema change rather than catalog data.",
      },
    },
    subagent: {
      native: {
        availability: {
          via: "plugin",
          provider: "first-party",
          plugin: {
            name: "Amp plugin API",
            homepage: "https://ampcode.com/manual",
            author: "Amp",
            distribution: {
              mechanism: "agent-native",
              installHint: "Save a plugin under .amp/plugins and reload plugins.",
              packageRef: null,
            },
            detection: {
              paths: [
                {
                  scope: "project",
                  path: ".amp/plugins",
                  kind: "dir",
                },
                {
                  scope: "user",
                  path: "~/.config/amp/plugins",
                  kind: "dir",
                },
              ],
              configKeys: [],
            },
          },
        },
        vendorStatus: { state: "active" },
        notes:
          "Amp has built-in automatic subagents and first-party plugin APIs for custom subagent-like tools, but no documented Markdown subagent directory that AXM can materialize.",
        docs: [],
        sources: ["https://ampcode.com/manual#subagents", "https://ampcode.com/manual#plugins"],
        scopes: ["user", "project"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
        reason: "AXM has not implemented Amp plugin/subagent materialization.",
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Amp plugins can handle tool-call, tool-result, and agent lifecycle events. AXM models the in-process plugin surface but does not serialize Amp plugins or amp.hooks actions yet.",
        docs: [],
        sources: ["https://ampcode.com/manual", "https://ampcode.com/manual/plugin-api"],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason: "AXM has not implemented Amp plugin or declarative-action hook writers.",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://ampcode.com/manual#agentsmd"],
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: true,
      importSyntax: "at-path",
    },
    axm: {
      status: "supported",
      lastVerified: "2026-08-05",
      writer: null,
    },
  },
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Amp permission rules use the amp.permissions and amp.mcpPermissions settings. Enterprise administrators can enforce the same schema through platform-specific managed-settings.json files.",
      docs: [],
      sources: [
        "https://ampcode.com/news/tool-level-permissions",
        "https://ampcode.com/news/mcp-permissions",
        "https://ampcode.com/news/enterprise-managed-settings",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file"],
      configFiles: [
        {
          scope: "user",
          path: "~/.config/amp/settings.json",
          format: "json",
          gitignored: false,
        },
        {
          scope: "project",
          path: ".amp/settings.json",
          format: "json",
          gitignored: false,
        },
      ],
      grammar: {
        style: "tool-call",
        example: '{"tool":"Bash","matches":{"cmd":"*git commit*"},"action":"ask"}',
        notes:
          "amp.permissions rules select a tool, optionally glob-match tool arguments, and apply allow, reject, ask, or delegate.",
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
