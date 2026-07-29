import type { Agent } from "../../schema.js";
export const ibmBobAgent = {
  id: "ibm-bob",
  name: "IBM Bob",
  vendor: "IBM",
  homepage: "https://bob.ibm.com",
  interfaces: ["ide-extension", "cli"],
  family: null,
  rootDir: ".bob",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "IBM Bob documentation",
      url: "https://bob.ibm.com/docs/ide",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://bob.ibm.com/docs/ide/features/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".bob/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Bob custom slash commands are Markdown files in .bob/commands (project) and ~/.bob/commands (user); filenames become command names and optional frontmatter supplies description and argument-hint metadata.",
        docs: [],
        sources: ["https://bob.ibm.com/docs/ide/features/slash-commands"],
        scopes: ["user", "project"],
        directory: ".bob/commands",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-07-22",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          'Project servers live in .bob/mcp.json; user servers in ~/.bob/mcp.json. Both files key entries under mcpServers. Streamable HTTP entries use "type": "streamable-http"; legacy SSE entries remain URL-only.\n',
        docs: [],
        sources: ["https://bob.ibm.com/docs/ide/configuration/mcp/mcp-in-bob"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
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
            serversKey: "mcpServers",
            nativeEnabled: false,
            targets: [
              {
                scope: "user",
                path: "~/.bob/mcp.json",
                format: "json",
              },
              {
                scope: "project",
                path: ".bob/mcp.json",
                format: "json",
              },
            ],
            stdio: {
              typeField: {
                name: "type",
                value: {
                  "streamable-http": "streamable-http",
                },
              },
              command: "split",
              envKey: "env",
            },
            remote: {
              typeField: null,
              urlKey: {
                "streamable-http": "url",
                sse: "url",
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
        notes:
          "Bob custom modes are YAML entries in .bob/custom_modes.yaml (project) or ~/.bob/settings/custom_modes.yaml (user). Entries support slug, name, description, whenToUse, roleDefinition, customInstructions, and read/edit/execute/mcp/skill/workflow/todo/subtask/subagent/mode tool-access groups; edit groups can carry fileRegex restrictions. Subagent-style extensions have no industry spec yet.\n",
        docs: [],
        sources: ["https://bob.ibm.com/docs/ide/configuration/custom-modes"],
        scopes: ["user", "project"],
        directory: ".bob/custom_modes.yaml",
        layout: "file",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: [],
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
      notes: "Bob automatically loads AGENTS.md from the workspace root.\n",
      docs: [],
      sources: ["https://bob.ibm.com/docs/ide/configuration/rules"],
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      directory: ".bob/rules",
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
        "IBM Bob custom modes define tool access groups and file permissions, including read, edit, command, and mcp groups. AXM has not implemented a custom_modes permission writer.",
      docs: [],
      sources: [
        "https://bob.ibm.com/docs/ide/features/modes",
        "https://bob.ibm.com/docs/ide/configuration/custom-modes",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file", "ui-only"],
      configFiles: [
        {
          scope: "project",
          path: ".bob/custom_modes.yaml",
          format: "yaml",
          gitignored: false,
        },
        {
          scope: "user",
          path: "~/.bob/settings/custom_modes.yaml",
          format: "yaml",
          gitignored: false,
        },
      ],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: "2026-06-06",
      writer: null,
      reason: "AXM has not implemented an IBM Bob custom-modes permission writer.",
    },
  },
} as const satisfies Agent;
