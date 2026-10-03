import type { Agent } from "../../schema.js";
export const piAgent = {
  id: "pi",
  name: "Pi",
  vendor: "Earendil Inc",
  homepage: "https://github.com/earendil-works/pi",
  interfaces: ["cli"],
  family: null,
  rootDir: ".pi",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Pi coding agent documentation",
      url: "https://pi.dev/docs",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Skills follow the Agent Skills SKILL.md standard and are invoked via /skill:name. Pi discovers them from .pi/skills and .agents/skills (project, searched up through parent directories) and ~/.pi/agent/skills and ~/.agents/skills (user).\n",
        docs: [],
        sources: ["https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md"],
        scopes: ["user", "project"],
        standardsCompliance: "full",
        convention: "vendor",
        locations: [
          {
            scope: "project",
            root: "project",
            path: ".agents/skills",
            shape: "directory",
            role: "additional",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "project",
            root: "project",
            path: ".pi/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "user",
            root: "home",
            path: ".pi/agent/skills",
            shape: "directory",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
          },
          {
            scope: "user",
            root: "home",
            path: ".agents/skills",
            shape: "directory",
            role: "additional",
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
        notes:
          "Requires Pi 1.0 or later. Native runtime verification is pending. Hyphens and underscores collide in exposed server names. Reload the host after configuration changes.",
        docs: [],
        sources: [
          "https://github.com/earendil-works/pi/blob/v1.0.0/packages/coding-agent/docs/mcp.md",
        ],
        scopes: ["project", "user"],
        standardsCompliance: "full",
        convention: "vendor",
        transports: ["stdio", "http"],
        mcpEnvExpansion: {
          variables: "braced",
          defaults: false,
          fields: ["env", "headers"],
          executableValues: true,
          homeExpansion: true,
        },
        locations: [
          {
            id: "project",
            scope: "project",
            root: "project",
            path: ".pi/mcp.json",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
            format: "json",
            keyPath: ["mcpServers"],
            attribution: "agent",
          },
          {
            id: "user",
            scope: "user",
            root: "home",
            path: ".pi/agent/mcp.json",
            configRootRelativePath: "mcp.json",
            shape: "file",
            role: "primary",
            status: "canonical",
            applicability: { kind: "always" },
            provenance: { kind: "capability-sources" },
            format: "json",
            keyPath: ["mcpServers"],
            attribution: "agent",
          },
        ],
        entryDialect: {
          activationField: {
            required: { name: "enabled", enabled: true, disabled: false },
            accepted: [null, { name: "enabled", enabled: true, disabled: false }],
          },
          stdio: {
            typeField: {
              required: { name: "type", value: "stdio" },
              accepted: [null, { name: "type", value: "stdio" }],
            },
            command: "split",
            envKey: "env",
            cwdKey: "cwd",
          },
          remote: {
            typeField: {
              required: { name: "type", value: "http" },
              accepted: [
                null,
                { name: "type", value: "http" },
                { name: "type", value: "streamable-http" },
              ],
            },
            urlKey: { "streamable-http": "url" },
            headersKey: "headers",
          },
        },
      },
      axm: {
        status: "supported",
        lastVerified: null,
        writer: { config: { locationIds: ["project", "user"] } },
      },
    },
    subagent: {
      native: {
        availability: {
          via: "plugin",
          provider: "third-party",
          plugin: {
            name: "pi-subagents",
            homepage: "https://github.com/nicobailon/pi-subagents",
            author: "nicobailon",
            distribution: {
              mechanism: "agent-native",
              installHint: "pi install npm:pi-subagents",
              packageRef: "npm:pi-subagents",
            },
            detection: {
              paths: [
                {
                  scope: "user",
                  path: "~/.pi/agent/agents/",
                  kind: "dir",
                },
                {
                  scope: "project",
                  path: ".pi/agents/",
                  kind: "dir",
                },
                {
                  scope: "user",
                  path: "~/.pi/agent/extensions/subagent/agents/",
                  kind: "dir",
                },
              ],
              configKeys: [
                {
                  scope: "user",
                  file: "~/.pi/agent/settings.json",
                  key: "subagents",
                },
                {
                  scope: "project",
                  file: ".pi/settings.json",
                  key: "subagents",
                },
              ],
            },
          },
        },
        vendorStatus: { state: "active" },
        notes:
          "Pi has no built-in subagent system by design, but the third-party pi-subagents plugin adds a subagent extension surface. AXM describes and may detect this plugin, but does not install, resolve, or manage it.\n",
        docs: [],
        sources: [
          "https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md",
          "https://github.com/nicobailon/pi-subagents",
        ],
        scopes: ["user", "project"],
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
          "Pi extension hooks are in-process TypeScript extension points; this is the core Pi project, not the oh-my-pi fork. AXM models the surface but does not serialize Pi extension hooks yet.",
        docs: [],
        sources: ["https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md"],
        scopes: ["user", "project"],
        modeling: "native-unmodeled",

        locations: [],

        entryDialect: null,
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
        reason: "AXM has not implemented Pi extension hook writers.",
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "AGENTS.md and CLAUDE.md context load at startup from the global directory (~/.pi/agent), parent directories, and the current directory; all matching files are concatenated.\n",
      docs: [],
      sources: ["https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md"],
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
      availability: { via: "unknown" },
      vendorStatus: { state: "active" },
      notes:
        "Project trust is documented separately from per-tool grants. The current per-tool permission boundary was not established by this review.",
      docs: [],
      sources: ["https://pi.dev/docs/latest/settings"],
    },
    axm: {
      status: "unsupported",
      lastVerified: null,
      writer: null,
    },
  },

  profile: {
    identity: {
      product: "Pi",
      surface: "Pi terminal coding agent",
      edition: null,
      ownership: null,
      modelProviders: null,
    },
    review: {
      reviewedAt: "2026-10-01",
      sources: [
        "https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md",
        "https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/configuration.md",
      ],
      conditions: [],
      limitations: [
        "Documentation and public source review only; no vendor runtime execution or AXM configuration verification.",
        "Pi 1.0 MCP configuration is implemented from its versioned documentation; native runtime acceptance remains pending.",
        "Capability mechanics not revalidated in this review: skill, mcp-server, subagent, hook, instructions, permissions.",
      ],
      claimScope: "Current terminal product and configuration entry points",
    },
    lifecycleQualifications: [],
  },
} as const satisfies Agent;
