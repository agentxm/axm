import type { Agent } from "../../schema.js";
export const windsurfAgent = {
  id: "windsurf",
  name: "Windsurf",
  vendor: "Cognition",
  homepage: "https://windsurf.com",
  interfaces: ["ide-extension"],
  family: "cognition",
  rootDir: ".windsurf",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Windsurf documentation",
      url: "https://docs.windsurf.com",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Cascade reads SKILL.md skills from .windsurf/skills (project) and ~/.codeium/windsurf/skills (user) with progressive disclosure.\n",
        docs: [],
        sources: ["https://docs.windsurf.com/windsurf/cascade/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".windsurf/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-05-18",
        writer: null,
      },
    },
    command: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Windsurf Workflows are slash-command-invoked Markdown prompts under .windsurf/workflows (project) and ~/.codeium/windsurf/global_workflows (user).\n",
        docs: [],
        sources: ["https://docs.windsurf.com/windsurf/cascade/workflows"],
        scopes: ["user", "project"],
        directory: ".windsurf/workflows",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-05-18",
        writer: null,
      },
    },
    "mcp-server": {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.windsurf.com/windsurf/cascade/mcp"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-05-16",
        writer: {
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
      },
    },
    subagent: {
      native: {
        availability: { via: "none" },
        vendorStatus: { state: "active" },
        notes:
          "Cascade exposes only built-in and internal subagents plus multi-agent sessions; no user-authorable custom subagent extension type is documented.\n",
        docs: [],
        sources: ["https://docs.windsurf.com/windsurf/cascade/agents-md"],
      },
      axm: {
        status: "unsupported",
        lastVerified: null,
        writer: null,
      },
    },
    files: {
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
    rule: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://docs.windsurf.com/windsurf/cascade/agents-md"],
        scopes: ["project"],
        standardsCompliance: "full",
        convention: "universal",
        directory: ".windsurf/rules",
        kind: "agents-md",
        files: ["AGENTS.md"],
        nestedDiscovery: true,
        importSyntax: null,
      },
      axm: {
        status: "supported",
        lastVerified: "2026-05-16",
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
  permissions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: [
        "https://docs.windsurf.com/windsurf/terminal",
        "https://docs.windsurf.com/windsurf/cascade",
      ],
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
    },
    axm: {
      status: "supported",
      lastVerified: "2026-05-18",
      writer: {
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
    },
  },
} as const satisfies Agent;
