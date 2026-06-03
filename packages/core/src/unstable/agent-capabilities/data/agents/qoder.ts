import type { Agent } from "../../schema.js";

export const qoderAgent = {
  id: "qoder",
  name: "Qoder",
  vendor: "Alibaba Cloud",
  homepage: "https://qoder.com",
  interfaces: ["cli", "ide-extension"],
  family: "alibaba",
  rootDir: ".qoder",
  detection: {
    projectDirs: [],
    userDirs: [],
  },
  docs: [
    {
      label: "Qoder documentation",
      url: "https://docs.qoder.com",
    },
  ],
  skills: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://docs.qoder.com/cli/Skills", "https://docs.qoder.com/extensions/skills"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "vendor",
    directory: ".qoder/skills",
  },
  commands: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  mcp: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: [
      "https://docs.qoder.com/cli/using-cli",
      "https://docs.qoder.com/user-guide/chat/model-context-protocol",
    ],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "universal",
    transports: ["stdio", "http", "sse"],
    config: {
      serversKey: "mcpServers",
      nativeEnabled: true,
      targets: [
        {
          scope: "user",
          path: "~/.qoder.json",
          format: "json",
        },
        {
          scope: "project",
          path: ".mcp.json",
          format: "json",
        },
      ],
      stdio: {
        typeField: null,
        command: "split",
        envKey: "env",
      },
      remote: {
        typeField: {
          name: "type",
          value: {
            "streamable-http": "streamable-http",
            sse: "sse",
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
  subagents: {
    lifecycle: "available",
    notes: "No industry spec for subagents yet; AXM bridges to the agent's native layout.",
    docs: [],
    sources: ["https://docs.qoder.com/en/cli/subagent"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    directory: ".qoder/agents",
    layout: "directory",
  },
  instructions: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://docs.qoder.com/cli/using-cli"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "universal",
    kind: "agents-md",
    files: ["AGENTS.md"],
    nestedDiscovery: false,
    importSyntax: null,
  },
  rules: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  hooks: {
    lifecycle: "unsupported",
    notes: null,
    docs: [],
    sources: [],
  },
  permissions: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://docs.qoder.com/en/cli/permissions"],
    lastVerified: "2026-05-20",
    scopes: ["user", "project"],
    mechanism: ["config-file", "cli-flag"],
    configFiles: [
      {
        scope: "user",
        path: "~/.qoder.json",
        format: "json",
        gitignored: false,
      },
      {
        scope: "project",
        path: ".qoder/settings.json",
        format: "json",
        gitignored: false,
      },
    ],
    grammar: {
      style: "tool-call",
      example: "Bash(npm run test:*)",
      notes: null,
    },
    prerequisites: [],
    cliFlags: [
      {
        flag: "--permission-mode",
        note: "Chooses the session permission mode.",
      },
      {
        flag: "--allowed-tools",
        note: "Allows specific tools or tool rules for a run.",
      },
      {
        flag: "--yolo",
        note: "Skips permission checks.",
      },
    ],
    grants: {
      shell: {
        target: "~/.qoder.json",
        patch: {
          permissions: {
            allow: ["Bash(${tool}:*)"],
          },
        },
        template: null,
      },
      filesystem: {
        target: "~/.qoder.json",
        patch: {
          permissions: {
            allow: [
              "Read(${workspaceRoot}/**)",
              "Edit(${workspaceRoot}/**)",
              "Write(${workspaceRoot}/**)",
            ],
          },
        },
        template: null,
      },
    },
  },
} as const satisfies Agent;
