import type { Agent } from "../../schema.js";

export const geminiCliAgent = {
  id: "gemini-cli",
  name: "Gemini CLI",
  vendor: "Google",
  homepage: "https://github.com/google-gemini/gemini-cli",
  interfaces: ["cli"],
  family: "google",
  rootDir: ".gemini",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: {
      markers: [
        { kind: "dir", path: "~/.gemini", signal: "definitive", note: null },
        { kind: "executable", name: "gemini", signal: "definitive", note: "CLI on PATH." },
      ],
    },
  },
  docs: [
    {
      label: "Gemini CLI documentation",
      url: "https://github.com/google-gemini/gemini-cli/tree/main/docs",
    },
    {
      label: "Transitioning Gemini CLI to Antigravity CLI",
      url: "https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/",
    },
  ],
  capabilities: {
    skill: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      axmSupport: "supported",
      notes: null,
      docs: [],
      sources: ["https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md"],
      lastVerified: "2026-05-16",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".gemini/skills",
    },
    command: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      axmSupport: "supported",
      notes:
        "Custom slash commands are TOML files under .gemini/commands (project) or ~/.gemini/commands (user); AXM bridges its command extension format to TOML.\n",
      docs: [],
      sources: [
        "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/custom-commands.md",
      ],
      lastVerified: "2026-05-18",
      scopes: ["user", "project"],
      directory: ".gemini/commands",
    },
    "mcp-server": {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      axmSupport: "supported",
      notes: null,
      docs: [],
      sources: ["https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md"],
      lastVerified: "2026-05-16",
      scopes: ["user", "project"],
      standardsCompliance: "full",
      convention: "universal",
      transports: ["stdio"],
      mcpEnvExpansion: {
        variables: "none",
        defaults: false,
      },
      config: {
        serversKey: "mcpServers",
        nativeEnabled: false,
        targets: [
          {
            scope: "project",
            path: ".gemini/settings.json",
            format: "json",
          },
          {
            scope: "user",
            path: "~/.gemini/settings.json",
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
    subagent: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      axmSupport: "supported",
      notes:
        "Subagents are Markdown files with YAML frontmatter under .gemini/agents (project) or ~/.gemini/agents (user); shipped in Gemini CLI v0.38.1.\n",
      docs: [],
      sources: ["https://github.com/google-gemini/gemini-cli/blob/main/docs/core/subagents.md"],
      lastVerified: "2026-05-18",
      scopes: ["user", "project"],
      directory: ".gemini/agents",
      layout: "directory",
    },
    files: {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      axmSupport: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
    rule: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      axmSupport: "supported",
      notes:
        "Consumer access (free, AI Pro, AI Ultra) ends 2026-06-18; Antigravity CLI succeeds Gemini CLI for those tiers. Enterprise customers on paid API keys retain access.\n",
      docs: [],
      sources: [
        "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/configuration.md",
        "https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/",
      ],
      lastVerified: "2026-05-20",
      scopes: ["user", "project"],
      standardsCompliance: "parity",
      convention: "vendor",
      kind: "own-file",
      files: ["GEMINI.md"],
      nestedDiscovery: true,
      importSyntax: null,
    },
    hook: {
      availability: { via: "none" },
      vendorStatus: { state: "active" },
      axmSupport: "unsupported",
      notes: null,
      docs: [],
      sources: [],
    },
  },
  permissions: {
    availability: { via: "native" },
    vendorStatus: { state: "active" },
    axmSupport: "supported",
    notes: null,
    docs: [],
    sources: [
      "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/settings.md",
      "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md",
      "https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/shell.md",
      "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/trusted-folders.md",
    ],
    lastVerified: "2026-05-18",
    scopes: ["user", "project"],
    mechanism: ["config-file", "cli-flag"],
    configFiles: [
      {
        scope: "user",
        path: "~/.gemini/settings.json",
        format: "json",
        gitignored: false,
      },
      {
        scope: "project",
        path: ".gemini/settings.json",
        format: "json",
        gitignored: false,
      },
    ],
    grammar: {
      style: "prefix",
      example: "run_shell_command(axm)",
      notes:
        "tools.core is prefix-matched and currently documented in docs/tools/shell.md. The newer Policy Engine is replacing --allowed-tools; tools.core is still functional but transitional.\n",
    },
    prerequisites: [
      {
        key: "security.folderTrust.enabled",
        value: "true",
        scope: "user",
        note: "Untrusted folders disable all auto-acceptance regardless of other settings.",
      },
    ],
    cliFlags: [
      {
        flag: "--approval-mode=yolo",
        note: "Broad bypass; not tool-scoped. Blocked when security.disableYoloMode=true.",
      },
      {
        flag: "--yolo",
        note: "Alias for --approval-mode=yolo.",
      },
    ],
    grants: {
      shell: {
        target: "~/.gemini/settings.json",
        patch: {
          security: {
            folderTrust: {
              enabled: true,
            },
            enablePermanentToolApproval: true,
          },
          tools: {
            core: ["run_shell_command(${tool})"],
          },
        },
        template: null,
      },
    },
  },
} as const satisfies Agent;
