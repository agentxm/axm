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
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".bob/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
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

        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".bob/mcp.json",
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
            id: "project",
            scope: "project",
            root: "project",
            path: ".bob/mcp.json",
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
            required: { name: "disabled", enabled: false, disabled: true },
            accepted: [{ name: "disabled", enabled: false, disabled: true }, null],
          },
          stdio: {
            typeField: { required: null, accepted: [null] },
            command: "split",
            envKey: "env",
          },
          remote: {
            typeField: {
              required: {
                name: "type",
                value: { "streamable-http": "streamable-http" },
              },
              accepted: [
                {
                  name: "type",
                  value: { "streamable-http": "streamable-http" },
                },
                null,
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
            locationIds: ["user", "project"],
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
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".bob/custom_modes.yaml",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "user",
            root: "home",
            path: ".bob/settings/custom_modes.yaml",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
        ],
      },
      axm: {
        status: "unsupported",
        reason: "Native ownership is unverified; AXM can offer a role Skill fallback.",
        lastVerified: "2026-08-05",
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
        {
          scope: "project",
          root: "project",
          path: ".bob/rules",
          shape: "directory",
          role: "additional",
          status: "canonical",
          applicability: { kind: "always" },
          provenance: { kind: "capability-sources" },
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
      locations: [
        {
          id: "project",
          scope: "project",
          root: "project",
          path: ".bob/custom_modes.yaml",
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
          id: "user",
          scope: "user",
          root: "home",
          path: ".bob/settings/custom_modes.yaml",
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
      ],
      grammar: null,
      prerequisites: [],
      cliFlags: [],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason: "AXM has not implemented an IBM Bob custom-modes permission writer.",
    },
  },
} as const satisfies Agent;
