import type { Agent } from "../../schema.js";
export const codeartsAgentAgent = {
  id: "codearts-agent",
  name: "CodeArts Agent",
  vendor: "Huawei Cloud",
  homepage: "https://support.huaweicloud.com/usermanual-cli/codeartsagent_cli_0001.html",
  interfaces: ["cli", "ide-extension"],
  family: null,
  rootDir: ".codeartsdoer",
  lifecycle: { state: "active" },
  detection: {
    project: {
      markers: [{ kind: "dir", path: ".codeartsdoer", signal: "definitive", note: null }],
    },
    user: { markers: [{ kind: "dir", path: "~/.codeartsdoer", signal: "definitive", note: null }] },
  },
  docs: [
    {
      label: "CodeArts Agent CLI documentation",
      url: "https://support.huaweicloud.com/usermanual-cli/codeartsagent_cli_0001.html",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://support.huaweicloud.com/usermanual-cli/codeartsagent_cli_0019.html"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".codeartsdoer/skills",
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
          "CodeArts Agent stores local and remote MCP servers under the mcp key in its shared JSON or JSONC configuration.",
        docs: [],
        sources: [
          "https://support.huaweicloud.com/usermanual-cli/codeartsagent_cli_0017.html",
          "https://support.huaweicloud.com/usermanual-cli/codeartsagent_cli_0028.html",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "partial",
        convention: "vendor",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: {
          config: {
            serversKey: "mcp",
            activationField: {
              required: null,
              accepted: [{ name: "enabled", enabled: true, disabled: false }, null],
            },
            targets: [
              {
                scope: "project",
                path: ".codeartsdoer/codearts_cli.jsonc",
                format: "jsonc",
              },
              {
                scope: "user",
                path: "~/.codeartsdoer/codearts_cli.jsonc",
                format: "jsonc",
              },
            ],
            stdio: {
              typeField: {
                required: { name: "type", value: "local" },
                accepted: [{ name: "type", value: "local" }],
              },
              command: "array",
              envKey: "environment",
            },
            remote: {
              typeField: {
                required: {
                  name: "type",
                  value: { "streamable-http": "remote", sse: "remote" },
                },
                accepted: [
                  {
                    name: "type",
                    value: { "streamable-http": "remote", sse: "remote" },
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
      },
    },
    subagent: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "CodeArts Agent discovers Markdown agent definitions with YAML frontmatter and supports primary and subagent modes.",
        docs: [],
        sources: [
          "https://support.huaweicloud.com/usermanual-codeartssnap/codeartsagent_ug_0051.html",
        ],
        scopes: ["user", "project"],
        directory: ".codeartsdoer/agents",
        layout: "directory",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "CodeArts Agent hooks are JavaScript or TypeScript plugin callbacks rather than declarative command hooks that AXM can serialize.",
        docs: [],
        sources: ["https://support.huaweicloud.com/usermanual-cli/codeartsagent_cli_0018.html"],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason: "AXM does not serialize CodeArts Agent JavaScript or TypeScript plugins.",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "CodeArts Agent uses AGENTS.md for project instructions and can generate it with /init.",
      docs: [],
      sources: ["https://support.huaweicloud.com/usermanual-cli/codeartsagent_cli_0014.html"],
      scopes: ["project"],
      standardsCompliance: "full",
      convention: "universal",
      kind: "agents-md",
      files: ["AGENTS.md"],
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
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "CodeArts Agent stores ordered allow, ask, and deny-style rules in a user-level JSON permission file.",
      docs: [],
      sources: ["https://support.huaweicloud.com/usermanual-cli/codeartsagent_cli_0006.html"],
      scopes: ["user"],
      mechanism: ["config-file"],
      configFiles: [
        {
          scope: "user",
          path: "~/.codeartsdoer/cli-data/storage/permission/global.json",
          format: "json",
          gitignored: false,
        },
      ],
      grammar: {
        style: "glob",
        example: '{"permission":"bash","pattern":"axm *","action":"allow"}',
        notes:
          "Each array entry selects a permission name and wildcard pattern, then applies an allow, ask, or deny action.",
      },
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason: "AXM has not implemented a CodeArts Agent permission-list writer.",
    },
  },
} as const satisfies Agent;
