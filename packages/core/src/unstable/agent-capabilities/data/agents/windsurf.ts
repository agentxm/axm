import type { Agent } from "../../schema.js";

export const windsurfAgent = {
  id: "windsurf",
  name: "Windsurf",
  vendor: "Cognition",
  homepage: "https://windsurf.com",
  interfaces: ["ide-extension"],
  family: "cognition",
  rootDir: ".windsurf",
  detection: {
    projectDirs: [],
    userDirs: [],
  },
  docs: [
    {
      label: "Windsurf documentation",
      url: "https://docs.windsurf.com",
    },
  ],
  skills: {
    lifecycle: "available",
    notes:
      "Cascade reads SKILL.md skills from .windsurf/skills (project) and ~/.codeium/windsurf/skills (user) with progressive disclosure.\n",
    docs: [],
    sources: ["https://docs.windsurf.com/windsurf/cascade/skills"],
    lastVerified: "2026-05-18",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "vendor",
    directory: ".windsurf/skills",
  },
  commands: {
    lifecycle: "available",
    notes:
      "Windsurf Workflows are slash-command-invoked Markdown prompts under .windsurf/workflows (project) and ~/.codeium/windsurf/global_workflows (user).\n",
    docs: [],
    sources: ["https://docs.windsurf.com/windsurf/cascade/workflows"],
    lastVerified: "2026-05-18",
    scopes: ["user", "project"],
    directory: ".windsurf/workflows",
  },
  mcp: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://docs.windsurf.com/windsurf/cascade/mcp"],
    lastVerified: "2026-05-16",
    scopes: ["user", "project"],
    standardsCompliance: "full",
    convention: "universal",
    transports: ["stdio"],
    config: {
      serversKey: "mcpServers",
      nativeEnabled: false,
      targets: [
        {
          scope: "user",
          path: "~/.codeium/windsurf/mcp_config.json",
          format: "json",
        },
      ],
      stdio: {
        typeField: null,
        command: "split",
        envKey: "env",
      },
      remote: null,
      transform: null,
    },
  },
  subagents: {
    lifecycle: "unsupported",
    notes:
      "Cascade exposes only built-in and internal subagents plus multi-agent sessions; no user-authorable custom subagent extension type is documented.\n",
    docs: [],
    sources: ["https://docs.windsurf.com/windsurf/cascade/agents-md"],
  },
  instructions: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://docs.windsurf.com/windsurf/cascade/agents-md"],
    lastVerified: "2026-05-16",
    scopes: ["project"],
    standardsCompliance: "full",
    convention: "universal",
    kind: "agents-md",
    files: ["AGENTS.md"],
    nestedDiscovery: true,
    importSyntax: null,
  },
  rules: {
    lifecycle: "available",
    notes: "No industry spec for rule files yet; AXM bridges to the agent's native layout.",
    docs: [],
    sources: ["https://docs.windsurf.com/windsurf/cascade/rules"],
    lastVerified: "2026-05-16",
    scopes: ["user", "project"],
    directory: ".windsurf/rules",
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
    sources: [
      "https://docs.windsurf.com/windsurf/terminal",
      "https://docs.windsurf.com/windsurf/cascade",
    ],
    lastVerified: "2026-05-18",
    scopes: ["user"],
    mechanism: ["config-file", "ui-only"],
    configFiles: [
      {
        scope: "user",
        path: "VS Code settings (Settings UI)",
        format: "vscode-settings",
        gitignored: false,
      },
    ],
    grammar: {
      style: "prefix",
      example: "axm",
      notes:
        "windsurf.cascadeCommandsAllowList is prefix-matched. Workspace-scoped override for these keys is not documented; configure at user scope. Teams/Enterprise can merge in lists via the Admin Portal.\n",
    },
    prerequisites: [
      {
        key: "Cascade auto-execution level",
        value: "allowlist_only | turbo",
        scope: "user",
        note: "Disabled and Auto modes ignore allowlist entries; set via the Windsurf Settings panel.",
      },
    ],
    cliFlags: [],
    grants: {
      shell: {
        target: "VS Code settings",
        patch: {
          "windsurf.cascadeCommandsAllowList": ["${tool}"],
        },
        template: null,
      },
    },
  },
} as const satisfies Agent;
