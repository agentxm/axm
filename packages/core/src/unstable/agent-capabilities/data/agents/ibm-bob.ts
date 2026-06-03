import type { Agent } from "../../schema.js";

export const ibmBobAgent = {
  id: "ibm-bob",
  name: "IBM Bob",
  vendor: "IBM",
  homepage: "https://bob.ibm.com",
  interfaces: ["ide-extension", "cli"],
  family: null,
  rootDir: ".bob",
  detection: {
    projectDirs: [],
    userDirs: [],
  },
  docs: [
    {
      label: "IBM Bob documentation",
      url: "https://bob.ibm.com/docs/ide",
    },
  ],
  skills: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://bob.ibm.com/docs/ide"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "vendor",
    directory: ".bob/skills",
  },
  commands: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  mcp: {
    lifecycle: "available",
    notes:
      "Project servers live in .bob/mcp.json; user servers in ~/.bob/mcp_settings.json. Both files key entries under mcpServers. Remote entries carry a url field with no type discriminator; SSE is documented as legacy alongside streamable HTTP.\n",
    docs: [],
    sources: ["https://bob.ibm.com/docs/ide/configuration/mcp/mcp-in-bob"],
    lastVerified: "2026-05-19",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "universal",
    transports: ["stdio", "http", "sse"],
    config: {
      serversKey: "mcpServers",
      nativeEnabled: false,
      targets: [
        {
          scope: "user",
          path: "~/.bob/mcp_settings.json",
          format: "json",
        },
        {
          scope: "project",
          path: ".bob/mcp.json",
          format: "json",
        },
      ],
      stdio: {
        typeField: null,
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
  subagents: {
    lifecycle: "available",
    notes:
      "Bob custom modes are YAML entries (slug, name, roleDefinition, groups, customInstructions) in .bob/custom_modes.yaml (project) or the global custom_modes.yaml (user). Subagent-style extensions have no industry spec yet.\n",
    docs: [],
    sources: ["https://bob.ibm.com/docs/ide/configuration/custom-modes"],
    lastVerified: "2026-05-19",
    scopes: ["user", "project"],
    directory: ".bob/custom_modes.yaml",
    layout: "file",
  },
  instructions: {
    lifecycle: "available",
    notes: "Bob automatically loads AGENTS.md from the workspace root.\n",
    docs: [],
    sources: ["https://bob.ibm.com/docs/ide/configuration/rules"],
    lastVerified: "2026-05-19",
    scopes: ["project"],
    standardsCompliance: "full",
    convention: "universal",
    kind: "agents-md",
    files: ["AGENTS.md"],
    nestedDiscovery: false,
    importSyntax: null,
  },
  rules: {
    lifecycle: "available",
    notes:
      "Custom rules load from .bob/rules (project) and ~/.bob/rules (user). The legacy single-file .bobrules and mode-scoped .bob/rules-{mode} directories are also supported.\n",
    docs: [],
    sources: ["https://bob.ibm.com/docs/ide/configuration/rules"],
    lastVerified: "2026-05-19",
    scopes: ["user", "project"],
    directory: ".bob/rules",
  },
  hooks: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  permissions: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
} as const satisfies Agent;
