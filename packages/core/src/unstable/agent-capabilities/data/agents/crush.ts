import type { Agent } from "../../schema.js";
export const crushAgent = {
  id: "crush",
  name: "Crush",
  vendor: "Charm",
  homepage: "https://charm.land/crush",
  interfaces: ["cli"],
  family: null,
  rootDir: ".crush",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Crush repository",
      url: "https://github.com/charmbracelet/crush",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes: null,
        docs: [],
        sources: ["https://github.com/charmbracelet/crush"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
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
          "Crush now prefers executable crushrc configuration. AXM targets the deprecated-but-still-supported JSON configuration because the generic writer cannot safely author shell configuration.",
        docs: [],
        sources: [
          "https://github.com/charmbracelet/crush",
          "https://github.com/charmbracelet/crush/blob/main/schema.json",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
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
              required: { name: "disabled", enabled: false, disabled: true },
              accepted: [{ name: "disabled", enabled: false, disabled: true }, null],
            },
            targets: [
              {
                scope: "project",
                path: "crush.json",
                format: "json",
              },
              {
                scope: "user",
                path: "~/.config/crush/crush.json",
                format: "json",
              },
            ],
            stdio: {
              typeField: { required: null, accepted: [null] },
              command: "split",
              envKey: "env",
            },
            remote: {
              typeField: {
                required: {
                  name: "type",
                  value: {
                    "streamable-http": "http",
                    sse: "sse",
                  },
                },
                accepted: [
                  {
                    name: "type",
                    value: {
                      "streamable-http": "http",
                      sse: "sse",
                    },
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
    hook: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Crush currently supports PreToolUse hooks in crush.json/.crush.json with direct event arrays. The native shape is Claude Code-compatible conceptually but not AXM's grouped command-hook JSON writer shape.",
        docs: [],
        sources: ["https://github.com/charmbracelet/crush/tree/main/docs/hooks"],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason: "AXM has not implemented a Crush hook writer.",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://github.com/charmbracelet/crush"],
      scopes: ["user", "project"],
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
        "Crush can allow broad built-in tools through permissions.allowed_tools and can bypass prompts with --yolo. This does not provide a narrow shell-command grant for AXM.",
      docs: [],
      sources: ["https://github.com/charmbracelet/crush"],
      scopes: ["user", "project"],
      mechanism: ["config-file", "cli-flag"],
      configFiles: [
        {
          scope: "project",
          path: "crush.json",
          format: "json",
          gitignored: false,
        },
        {
          scope: "user",
          path: "~/.config/crush/crush.json",
          format: "json",
          gitignored: false,
        },
      ],
      grammar: {
        style: "prefix",
        example: '"permissions": { "allowed_tools": ["view", "edit", "bash"] }',
        notes:
          "allowed_tools grants whole tools such as bash; it cannot narrowly grant only the axm command.",
      },
      prerequisites: [],
      cliFlags: [
        {
          flag: "--yolo",
          note: "Skips all permission prompts for the workspace.",
        },
      ],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
      reason: "AXM has not implemented a narrow Crush permission grant writer.",
    },
  },
} as const satisfies Agent;
