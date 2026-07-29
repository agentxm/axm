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
        directory: ".windsurf/skills",
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
          "Devin Desktop Workflows are slash-command-invoked Markdown prompts under .windsurf/workflows (project) and ~/.codeium/windsurf/global_workflows (user).\n",
        docs: [],
        sources: ["https://docs.devin.ai/desktop/cascade/workflows"],
        scopes: ["user", "project"],
        directory: ".windsurf/workflows",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-06-06",
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
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "braced",
          defaults: false,
        },
      },
      axm: {
        status: "supported",
        lastVerified: "2026-07-22",
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
            remote: {
              typeField: null,
              urlKey: {
                "streamable-http": "serverUrl",
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
        configFiles: [
          {
            scope: "user",
            path: "~/.codeium/windsurf/hooks.json",
            format: "json",
            gitignored: false,
          },
          {
            scope: "project",
            path: ".windsurf/hooks.json",
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
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "post_read_code",
            canonical: "tool.post",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "pre_write_code",
            canonical: "tool.pre",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "post_write_code",
            canonical: "tool.post",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "pre_run_command",
            canonical: "tool.pre",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "post_run_command",
            canonical: "tool.post",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "pre_mcp_tool_use",
            canonical: "tool.pre",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "post_mcp_tool_use",
            canonical: "tool.post",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "pre_user_prompt",
            canonical: "prompt.submit",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["allow", "deny"] }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "post_cascade_response",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "post_cascade_response_with_transcript",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-07-22",
          },
        ],
        tools: [
          {
            nativeName: "read_code",
            canonical: "file.read",
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "write_code",
            canonical: "file.write",
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "run_command",
            canonical: "shell.exec",
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-06-06",
          },
          {
            nativeName: "mcp_tool_use",
            canonical: "mcp.call",
            sources: ["https://docs.devin.ai/desktop/cascade/hooks"],
            lastVerified: "2026-06-06",
          },
        ],
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: "2026-06-06",
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
      directory: ".devin/rules",
      kind: "agents-md",
      files: ["AGENTS.md"],
      nestedDiscovery: true,
      importSyntax: null,
    },
    axm: {
      status: "supported",
      lastVerified: "2026-07-22",
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
      lastVerified: "2026-06-06",
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
