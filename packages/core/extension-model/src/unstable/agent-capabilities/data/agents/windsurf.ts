import type { Agent } from "../../schema.js";
export const windsurfAgent = {
  id: "windsurf",
  name: "Devin Desktop (Windsurf)",
  vendor: "Cognition",
  homepage: "https://devin.ai/desktop",
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
      label: "Devin Desktop documentation",
      url: "https://docs.devin.ai/desktop",
    },
    {
      label: "Windsurf is now Devin Desktop",
      url: "https://devin.ai/blog/windsurf-is-now-devin-desktop",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Devin Desktop reads SKILL.md skills from .windsurf/skills (project) and ~/.codeium/windsurf/skills (user) with progressive disclosure. It also discovers universal .agents/skills paths. The built-in Cascade agent reached end-of-life 2026-07-01 and is being replaced by Devin Local; the .windsurf/* and ~/.codeium/windsurf/* config surfaces persist under Devin Local.\n",
        docs: [],
        sources: ["https://docs.devin.ai/desktop/cascade/skills"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".windsurf/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "user",
            root: "home",
            path: ".codeium/windsurf/skills",
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
        notes: null,
        docs: [],
        sources: ["https://docs.devin.ai/desktop/cascade/mcp"],
        scopes: ["user"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "braced",
          defaults: false,
        },

        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".codeium/windsurf/mcp_config.json",
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
            required: null,
            accepted: [null],
          },
          stdio: {
            typeField: { required: null, accepted: [null] },
            command: "split",
            envKey: "env",
          },
          remote: {
            typeField: { required: null, accepted: [null] },
            urlKey: {
              "streamable-http": "serverUrl",
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
            locationIds: ["user"],
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
        sources: ["https://docs.devin.ai/desktop/cascade/agents-md"],
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
          "Devin Desktop/Cascade hooks are direct per-event command arrays in hooks.json. AXM's generic hook writer emits grouped command-stdin hooks and cannot serialize this shape yet.",
        docs: [],
        sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".codeium/windsurf/hooks.json",
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
            id: "project",
            scope: "project",
            root: "project",
            path: ".windsurf/hooks.json",
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
        events: [
          {
            nativeName: "pre_read_code",
            canonical: "tool.pre",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "post_read_code",
            canonical: "tool.post",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "pre_write_code",
            canonical: "tool.pre",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "post_write_code",
            canonical: "tool.post",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "pre_run_command",
            canonical: "tool.pre",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "post_run_command",
            canonical: "tool.post",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "pre_mcp_tool_use",
            canonical: "tool.pre",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "post_mcp_tool_use",
            canonical: "tool.post",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "pre_user_prompt",
            canonical: "prompt.submit",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "post_cascade_response",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "post_cascade_response_with_transcript",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-08-05",
          },
        ],
        tools: [
          {
            nativeName: "read_code",
            canonical: "file.read",
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "write_code",
            canonical: "file.write",
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "run_command",
            canonical: "shell.exec",
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "mcp_tool_use",
            canonical: "mcp.call",
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-08-05",
          },
        ],

        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason: "AXM has not implemented a Devin Desktop/Cascade hooks writer.",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://docs.devin.ai/desktop/cascade/agents-md"],
      scopes: ["project"],
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
          path: ".devin/rules",
          shape: "directory",
          role: "additional",
          status: "canonical",
          applicability: { kind: "always" },
          provenance: { kind: "capability-sources" },
        },
      ],
      nestedDiscovery: true,
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
      notes: null,
      docs: [],
      sources: ["https://docs.devin.ai/desktop/terminal", "https://docs.devin.ai/desktop/cascade"],
      scopes: ["user"],
      mechanism: ["config-file", "ui-only"],
      locations: [],
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
      lastVerified: "2026-08-05",
      writer: {
        grants: {
          shell: {
            destination: { kind: "settings-ui" },
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
