import type { Agent } from "../../schema.js";

export const cursorAgent = {
  id: "cursor",
  name: "Cursor",
  vendor: "Anysphere",
  homepage: "https://cursor.com",
  interfaces: ["ide-extension", "cli"],
  family: "cursor",
  profile: {
    identity: {
      product: "Cursor",
      surface: "Desktop IDE and CLI",
      edition: null,
      ownership: {
        company: "Anysphere",
        parentCompany: "SpaceX",
        sources: ["https://cursor.com/blog/joining-spacex"],
      },
      modelProviders: null,
    },
    review: {
      claimScope:
        "Product identity and the specific capability or lifecycle changes described in this review; other capability evidence is retained separately.",
      reviewedAt: "2026-10-01",
      sources: ["https://cursor.com/blog/joining-spacex"],
      conditions: [],
      limitations: [
        "Parent-company acquisition reviewed; the product/operator identity is distinct from parent and model provider. Existing capability paths were not all re-exercised.",
        "This review does not renew historical AXM runtime verification.",
      ],
    },
    lifecycleQualifications: [],
  },
  rootDir: ".cursor",
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
          path: "~/.cursor",
          signal: "definitive",
          note: null,
        },
        {
          kind: "executable",
          name: "cursor-agent",
          signal: "definitive",
          note: "CLI on PATH.",
        },
      ],
    },
  },
  docs: [
    {
      label: "Cursor documentation",
      url: "https://docs.cursor.com",
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
          "Cursor 2.4 added Agent Skills (SKILL.md) across the editor and the cursor-agent CLI.",
        docs: [],
        sources: ["https://cursor.com/docs/skills.md"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".cursor/skills",
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
            scope: "project",
            root: "project",
            path: ".claude/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
            applicability: {
              kind: "always",
            },
            provenance: {
              kind: "capability-sources",
            },
          },
          {
            scope: "project",
            root: "project",
            path: ".codex/skills",
            shape: "directory",
            role: "additional",
            status: "compat",
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
        sources: [
          "https://cursor.com/docs/mcp.md",
          "https://prod.cursor.com/docs/mcp#using-mcpjson",
        ],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "universal",
        transports: ["stdio", "http", "sse"],
        mcpEnvExpansion: {
          variables: "braced",
          defaults: false,
        },
        locations: [
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".cursor/mcp.json",
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
            id: "user",
            scope: "user",
            root: "home",
            path: ".cursor/mcp.json",
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
            typeField: {
              required: {
                name: "type",
                value: "stdio",
              },
              accepted: [
                {
                  name: "type",
                  value: "stdio",
                },
                null,
              ],
            },
            command: "split",
            envKey: "env",
          },
          remote: {
            implicitTransport: "http-or-sse",
            typeField: {
              required: null,
              accepted: [null],
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
        availability: {
          via: "native",
        },
        vendorStatus: {
          state: "active",
        },
        notes:
          "Custom subagents are Markdown files with YAML frontmatter under .cursor/agents (project) or ~/.cursor/agents (user); added in Cursor 2.4.\n",
        docs: [],
        sources: ["https://cursor.com/docs/subagents.md"],
        scopes: ["user", "project"],
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".cursor/agents",
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
            path: ".cursor/agents",
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
          "Command handlers use flat event arrays. User handlers run from the Cursor configuration directory; project handlers run from the project root. Runtime execution remains unverified.",
        docs: [],
        sources: ["https://cursor.com/docs/hooks"],
        scopes: ["user", "project"],
        mechanism: ["command-stdin"],
        locations: [
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".cursor/hooks.json",
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
            path: ".cursor/hooks.json",
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
            nativeName: "preToolUse",
            canonical: "tool.pre",
            matcher: {
              kind: "regex",
              example: null,
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
              {
                kind: "block",
                outcomes: ["allow", "deny"],
              },
              {
                kind: "modify",
                operations: ["modify-input"],
              },
            ],
            sources: ["https://cursor.com/docs/hooks"],
            lastVerified: "2026-10-02",
          },
          {
            nativeName: "postToolUse",
            canonical: "tool.post",
            matcher: {
              kind: "regex",
              example: null,
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
              {
                kind: "modify",
                operations: ["modify-output", "inject-context"],
              },
            ],
            sources: ["https://cursor.com/docs/hooks"],
            lastVerified: "2026-10-02",
          },
          {
            nativeName: "beforeSubmitPrompt",
            canonical: "prompt.submit",
            matcher: {
              kind: "regex",
              example: null,
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
              {
                kind: "block",
                outcomes: ["allow", "deny"],
              },
            ],
            sources: ["https://cursor.com/docs/hooks"],
            lastVerified: "2026-10-02",
          },
          {
            nativeName: "sessionStart",
            canonical: "session.start",
            matcher: {
              kind: "none-imperative",
              example: null,
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
              {
                kind: "block",
                outcomes: ["allow", "deny"],
              },
              {
                kind: "modify",
                operations: ["inject-context"],
              },
            ],
            sources: ["https://cursor.com/docs/hooks"],
            lastVerified: "2026-10-02",
          },
          {
            nativeName: "stop",
            canonical: "turn.end",
            matcher: {
              kind: "regex",
              example: null,
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
            ],
            sources: ["https://cursor.com/docs/hooks"],
            lastVerified: "2026-10-02",
          },
          {
            nativeName: "subagentStop",
            canonical: "subagent.stop",
            matcher: {
              kind: "regex",
              example: null,
              notes: null,
            },
            decision: [
              {
                kind: "observe",
              },
            ],
            sources: ["https://cursor.com/docs/hooks"],
            lastVerified: "2026-10-02",
          },
          {
            nativeName: "preCompact",
            canonical: "compaction.pre",
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
            sources: ["https://cursor.com/docs/hooks"],
            lastVerified: "2026-10-02",
          },
        ],
        tools: [
          {
            nativeName: "Shell",
            canonical: "shell.exec",
            sources: ["https://cursor.com/docs/hooks"],
            lastVerified: "2026-10-02",
          },
          {
            nativeName: "Read",
            canonical: "file.read",
            sources: ["https://cursor.com/docs/hooks"],
            lastVerified: "2026-10-02",
          },
          {
            nativeName: "Write",
            canonical: "file.write",
            sources: ["https://cursor.com/docs/hooks"],
            lastVerified: "2026-10-02",
          },
        ],
        entryDialect: {
          serializer: "flat-command-stdin",
          matcherKind: "regex",
          matcherSerialization: "bare",
          timeoutSerialization: "seconds",
          commandNameSerialization: "omit",
        },
        review: {
          reviewedAt: "2026-10-02",
          sources: ["https://cursor.com/docs/hooks"],
          claimScope:
            "Documented native command event grammar, native decisions, and project/user locations",
          conditions: [],
          limitations: [
            "AXM projects command handlers only. The preToolUse ask response is not enforced and is not advertised. Cloud profiles do not load user hooks or sessionStart. No native host execution was observed.",
          ],
        },
      },
      axm: {
        status: "supported",
        writer: {
          locationIds: ["project", "user"],
          eventMap: "native.events",
        },
        lastVerified: null,
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
      sources: ["https://cursor.com/docs/rules.md"],
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
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
          },
        },
        {
          scope: "project",
          root: "project",
          path: ".cursor/rules",
          shape: "directory",
          role: "additional",
          status: "canonical",
          applicability: {
            kind: "always",
          },
          provenance: {
            kind: "capability-sources",
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
        "https://cursor.com/docs/cli/reference/permissions.md",
        "https://cursor.com/docs/cli/reference/parameters.md",
        "https://cursor.com/docs/agent/tools/terminal",
      ],
      scopes: ["user", "project"],
      mechanism: ["config-file", "ui-only", "cli-flag"],
      locations: [
        {
          id: "user",
          scope: "user",
          root: "home",
          path: ".cursor/permissions.json",
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
          id: "user-additional-1",
          scope: "user",
          root: "home",
          path: ".cursor/sandbox.json",
          shape: "file",
          role: "additional",
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
          path: ".cursor/sandbox.json",
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
          id: "user-additional-2",
          scope: "user",
          root: "home",
          path: ".cursor/cli-config.json",
          shape: "file",
          role: "additional",
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
          id: "project-additional-1",
          scope: "project",
          root: "project",
          path: ".cursor/cli.json",
          shape: "file",
          role: "additional",
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
        example: "axm",
        notes:
          "IDE: case-sensitive command prefix in terminalAllowlist. CLI: Tool-call syntax Shell()/Read()/Write() with glob patterns. Deny always beats allow.\n",
      },
      prerequisites: [
        {
          key: "Settings > Cursor Settings > Agents > Auto-Run",
          value: "Run in Sandbox | Run Everything",
          scope: "user",
          note: "IDE Auto-Run must be enabled before terminalAllowlist takes effect.",
        },
      ],
      cliFlags: [
        {
          flag: "--force",
          note: "Force allow commands unless explicitly denied.",
        },
        {
          flag: "--yolo",
          note: "Alias for --force.",
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
              locationId: "user",
            },
            patch: {
              terminalAllowlist: ["${tool}"],
            },
            template: null,
          },
          cliShell: {
            destination: {
              kind: "location",
              locationId: "project-additional-1",
            },
            patch: {
              permissions: {
                allow: ["Shell(${tool})", "Shell(${tool}:*)"],
              },
            },
            template: null,
          },
          filesystem: {
            destination: {
              kind: "location",
              locationId: "project",
            },
            patch: {
              type: "workspace_readwrite",
              additionalReadwritePaths: [],
            },
            template: null,
          },
        },
      },
    },
  },
} as const satisfies Agent;
