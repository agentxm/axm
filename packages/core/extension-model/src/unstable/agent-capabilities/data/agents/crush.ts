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
        convention: "universal",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".agents/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "project",
            root: "project",
            path: ".crush/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "project",
            root: "project",
            path: ".claude/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "project",
            root: "project",
            path: ".cursor/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
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

        locations: [
          {
            id: "project",
            scope: "project",
            root: "project",
            path: "crush.json",
            shape: "file",
            role: "primary",
            status: "deprecated",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
            format: "json",
            keyPath: ["mcp"],
            attribution: "agent",
          },
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".config/crush/crush.json",
            shape: "file",
            role: "primary",
            status: "deprecated",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
            format: "json",
            keyPath: ["mcp"],
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
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: {
          config: {
            locationIds: ["project", "user"],
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

        locations: [],

        entryDialect: null,
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
        "Crush can allow broad built-in tools through permissions.allowed_tools and can bypass prompts with --yolo. This does not provide a narrow shell-command grant for AXM.",
      docs: [],
      sources: ["https://github.com/charmbracelet/crush"],
      scopes: ["user", "project"],
      mechanism: ["config-file", "cli-flag"],
      locations: [
        {
          id: "project",
          scope: "project",
          root: "project",
          path: "crush.json",
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
          gitignored: false,
        },
        {
          id: "user",
          scope: "user",
          root: "home",
          path: ".config/crush/crush.json",
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
