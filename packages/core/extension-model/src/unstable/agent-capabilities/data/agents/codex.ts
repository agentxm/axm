import type { Agent } from "../../schema.js";

export const codexAgent = {
  id: "codex",
  name: "Codex",
  vendor: "OpenAI",
  homepage: "https://learn.chatgpt.com/docs",
  interfaces: ["cli", "ide-extension"],
  family: "openai",
  profile: {
    identity: {
      product: "Codex",
      surface: "CLI and IDE extension",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      claimScope:
        "Product identity and the specific capability or lifecycle changes described in this review; other capability evidence is retained separately.",
      reviewedAt: "2026-10-01",
      sources: [
        "https://learn.chatgpt.com/docs/hooks",
        "https://developers.openai.com/codex/skills",
      ],
      conditions: [],
      limitations: [
        "Hook invocation and decisions reviewed; prompt/agent hook entries may parse without executing. Other existing paths retain their earlier evidence.",
        "This review does not renew historical AXM runtime verification.",
      ],
    },
    lifecycleQualifications: [],
  },
  rootDir: ".codex",
  targeting: {
    extends: null,
    capabilities: {
      "structured-input": {
        grades: ["native"],
        nouns: {
          "tool:structured-input": "request_user_input",
        },
        affordances: {
          "do:ask-structured":
            "Use request_user_input to collect structured input, then STOP and wait for the response.",
        },
      },
    },
  },
  lifecycle: {
    state: "active",
  },
  detection: {
    project: {
      markers: [
        {
          kind: "file",
          path: "AGENTS.md",
          signal: "ambiguous",
          note: "Shared instruction filename used by multiple agents.",
        },
      ],
    },
    user: {
      markers: [
        {
          kind: "dir",
          path: "~/.codex",
          signal: "definitive",
          note: null,
        },
        {
          kind: "executable",
          name: "codex",
          signal: "definitive",
          note: "CLI on PATH.",
        },
      ],
    },
  },
  docs: [
    {
      label: "Codex documentation",
      url: "https://learn.chatgpt.com/docs",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes:
          "Reads SKILL.md skills from repository (.agents/skills) and user (~/.agents/skills) locations with progressive disclosure, using the cross-tool Agent Skills convention rather than a .codex/ path.\n",
        docs: [],
        sources: ["https://developers.openai.com/codex/skills"],
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
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
          {
            scope: "user",
            root: "home",
            path: ".agents/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
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
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes: null,
        docs: [],
        sources: ["https://developers.openai.com/codex/mcp/"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        transports: ["stdio", "http"],
        mcpEnvExpansion: {
          variables: "none",
          defaults: false,
        },
        locations: [
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".codex/config.toml",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
            format: "toml",
            keyPath: ["mcp_servers"],
            attribution: "agent",
          },
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".codex/config.toml",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
            format: "toml",
            keyPath: ["mcp_servers"],
            attribution: "agent",
            configRootRelativePath: "config.toml",
          },
        ],
        entryDialect: {
          activationField: {
            required: {
              name: "enabled",
              enabled: true,
              disabled: false,
            },
            accepted: [
              {
                name: "enabled",
                enabled: true,
                disabled: false,
              },
              null,
            ],
          },
          stdio: {
            typeField: {
              required: null,
              accepted: [null],
            },
            command: "split",
            envKey: "env",
            envVarsKey: "env_vars",
            cwdKey: "cwd",
          },
          remote: {
            typeField: {
              required: null,
              accepted: [null],
            },
            urlKey: {
              "streamable-http": "url",
            },
            headersKey: "http_headers",
            bearerTokenEnvKey: "bearer_token_env_var",
            envHeadersKey: "env_http_headers",
          },
        },
      },
      axm: {
        status: "supported",
        lastVerified: null,
        writer: {
          config: {
            locationIds: ["project", "user"],
          },
        },
      },
    },
    subagent: {
      native: {
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes:
          "Custom agents are standalone TOML files under .codex/agents (project) or ~/.codex/agents (user); a custom agent overrides a built-in of the same name.\n",
        docs: [],
        sources: ["https://learn.chatgpt.com/docs/agent-configuration/subagents"],
        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".codex/agents",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
          {
            scope: "user",
            root: "home",
            path: ".codex/agents",
            configRootRelativePath: "agents",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
        ],
      },
      axm: {
        status: "supported",
        lastVerified: "2026-08-05",
        writer: null,
      },
    },
    hook: {
      native: {
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes:
          "Command and mcp_tool hooks execute. Prompt and agent handlers are parsed but skipped. AXM projects command handlers only; native allow/deny and updatedInput semantics do not expand the AXM canonical decision subset.",
        docs: [],
        sources: ["https://learn.chatgpt.com/docs/hooks"],
        scopes: ["user", "project"],
        mechanism: ["command-stdin", "mcp"],
        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".codex/hooks.json",
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
            keyPath: ["hooks"],
            gitignored: false,
            configRootRelativePath: "hooks.json",
          },
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".codex/hooks.json",
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
            keyPath: ["hooks"],
            gitignored: false,
          },
        ],
        events: [
          {
            nativeName: "PreToolUse",
            canonical: "tool.pre",
            matcher: {
              kind: "regex",
              example: "Bash|apply_patch",
              notes: null,
            },
            decision: [
              {
                kind: "block",
                outcomes: ["allow", "deny"],
              },
            ],
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PermissionRequest",
            canonical: "tool.pre",
            matcher: {
              kind: "regex",
              example: "Bash|apply_patch",
              notes: null,
            },
            decision: [
              {
                kind: "block",
                outcomes: ["allow", "deny"],
              },
            ],
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PostToolUse",
            canonical: "tool.post",
            matcher: {
              kind: "regex",
              example: "Bash|apply_patch",
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
            ],
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "UserPromptSubmit",
            canonical: "prompt.submit",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: null,
            },
            decision: [
              {
                kind: "block",
                outcomes: ["deny"],
              },
            ],
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "SessionStart",
            canonical: "session.start",
            matcher: {
              kind: "regex",
              example: "startup|resume|clear|compact",
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
            ],
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Stop",
            canonical: "turn.end",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
            ],
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "SubagentStop",
            canonical: "subagent.stop",
            matcher: {
              kind: "regex",
              example: null,
              notes: "Matcher filters subagent type.",
            },
            decision: [
              {
                kind: "observe",
              },
            ],
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "PreCompact",
            canonical: "compaction.pre",
            matcher: {
              kind: "regex",
              example: "manual|auto",
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
            ],
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-08-05",
          },
        ],
        tools: [
          {
            nativeName: "apply_patch",
            canonical: "file.edit",
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Edit",
            canonical: "file.edit",
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Write",
            canonical: "file.write",
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-08-05",
          },
          {
            nativeName: "Bash",
            canonical: "shell.exec",
            sources: ["https://learn.chatgpt.com/docs/hooks"],
            lastVerified: "2026-08-05",
          },
        ],
        entryDialect: {
          serializer: "command-stdin",
          matcherKind: "regex",
          matcherSerialization: "bare",
          timeoutSerialization: "seconds",
          commandNameSerialization: "omit",
        },
        review: {
          reviewedAt: "2026-10-01",
          sources: ["https://learn.chatgpt.com/docs/hooks"],
          claimScope: "Documented executable hook mechanisms and permission decision behavior",
          conditions: [],
          limitations: ["AXM writes command handlers only."],
        },
      },
      axm: {
        status: "supported",
        writer: {
          locationIds: ["project"],
          eventMap: "native.events",
        },
        lastVerified: "2026-08-05",
      },
    },
  },
  instructions: {
    native: {
      availability: {
        via: "native",
      },
      vendorStatus: {
        state: "active",
      },
      notes: null,
      docs: [],
      sources: ["https://github.com/openai/codex/blob/main/docs/agents_md.md"],
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
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
        },
        {
          scope: "user",
          root: "home",
          path: ".codex/AGENTS.md",
          configRootRelativePath: "AGENTS.md",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "sources",
            sources: ["https://learn.chatgpt.com/docs/agent-configuration/agents-md"],
          },
        },
        {
          scope: "user",
          root: "home",
          path: ".codex/AGENTS.override.md",
          configRootRelativePath: "AGENTS.override.md",
          shape: "file",
          role: "additional",
          status: "canonical",
          applicability: {
            kind: "conditional",
            condition: "Overrides AGENTS.md when non-empty under the selected CODEX_HOME.",
          },
          provenance: {
            kind: "sources",
            sources: ["https://learn.chatgpt.com/docs/agent-configuration/agents-md"],
          },
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
      availability: {
        via: "native",
      },
      vendorStatus: {
        state: "active",
      },
      notes: null,
      docs: [],
      sources: [
        "https://learn.chatgpt.com/docs/config-file/config-reference",
        "https://learn.chatgpt.com/docs/permissions",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file", "cli-flag"],
      locations: [
        {
          id: "user",
          scope: "user",
          root: "home",
          path: ".codex/config.toml",
          shape: "file",
          role: "primary",
          status: "canonical",
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
          format: "toml",
          gitignored: false,
          configRootRelativePath: "config.toml",
        },
        {
          id: "user-additional-1",
          scope: "user",
          root: "home",
          path: ".codex/axm.config.toml",
          shape: "file",
          role: "additional",
          status: "canonical",
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
          format: "toml",
          gitignored: false,
          configRootRelativePath: "axm.config.toml",
        },
      ],
      grammar: {
        style: "glob",
        example: '[permissions.agentxm.filesystem.":workspace_roots"] "." = "write"',
        notes:
          "Permission profiles combine filesystem, network, and workspace-root rules. Narrower deny rules remain in force over broader readable or writable paths.\n",
      },
      prerequisites: [
        {
          key: "default_permissions",
          value: "agentxm",
          scope: "user",
          note: "Selects the named permission profile.",
        },
      ],
      cliFlags: [
        {
          flag: "--yolo",
          note: "Alias for danger-full-access; use only when broad local access is intentional.",
        },
        {
          flag: "--dangerously-bypass-approvals-and-sandbox",
          note: "Runs without local sandbox restrictions.",
        },
      ],
    },
    axm: {
      status: "supported",
      lastVerified: "2026-08-05",
      writer: {
        grants: {
          shell: {
            destination: {
              kind: "location",
              locationId: "user-additional-1",
            },
            patch: {
              default_permissions: "agentxm",
              permissions: {
                agentxm: {
                  extends: ":workspace",
                },
              },
            },
            template: null,
          },
          filesystem: {
            destination: {
              kind: "location",
              locationId: "user-additional-1",
            },
            patch: {
              default_permissions: "agentxm",
              permissions: {
                agentxm: {
                  extends: ":workspace",
                  workspace_roots: {
                    "${workspaceRoot}": true,
                  },
                  filesystem: {
                    ":workspace_roots": {
                      ".": "write",
                    },
                  },
                  network: {
                    enabled: true,
                  },
                },
              },
            },
            template: null,
          },
        },
      },
    },
  },
} as const satisfies Agent;
