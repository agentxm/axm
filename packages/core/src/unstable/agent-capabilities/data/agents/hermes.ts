import type { Agent } from "../../schema.js";
export const hermesAgent = {
  id: "hermes",
  name: "Hermes Agent",
  vendor: "Nous Research",
  homepage: "https://hermes-agent.nousresearch.com",
  interfaces: ["cli"],
  family: null,
  rootDir: ".hermes",
  lifecycle: { state: "active" },
  detection: {
    project: { markers: [] },
    user: { markers: [] },
  },
  docs: [
    {
      label: "Hermes Agent documentation",
      url: "https://hermes-agent.nousresearch.com/docs",
    },
  ],
  capabilities: {
    skill: {
      native: {
        availability: { via: "native" },
        vendorStatus: { state: "active" },
        notes:
          "Hermes reads SKILL.md skills from ~/.hermes/skills as the source of truth. Additional external skill directories can be configured in ~/.hermes/config.yaml for shared team use.\n",
        docs: [],
        sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/skills"],
        scopes: ["user"],
        standardsCompliance: "full",
        convention: "vendor",
        directory: ".hermes/skills",
      },
      axm: {
        status: "supported",
        lastVerified: "2026-07-22",
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
          "Hermes declares MCP servers under mcp_servers in ~/.hermes/config.yaml. AXM writes that YAML file directly with per-entry x-axm metadata, preserving user-authored servers and coexisting with hermes mcp commands.\n",
        docs: [],
        sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp"],
        scopes: ["user"],
        standardsCompliance: "partial",
        convention: "vendor",
        transports: ["stdio", "http"],
      },
      axm: {
        status: "supported",
        lastVerified: "2026-07-22",
        writer: {
          config: {
            serversKey: "mcp_servers",
            nativeEnabled: true,
            targets: [{ scope: "user", path: "~/.hermes/config.yaml", format: "yaml" }],
            stdio: { typeField: null, command: "split", envKey: "env" },
            remote: {
              typeField: null,
              urlKey: { "streamable-http": "url" },
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
          "Hermes supports config-declared shell hooks and Python plugin callbacks. Shell hooks are command-based, accept event data, and are gated by a local allowlist.",
        docs: [],
        sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks"],
        scopes: ["user"],
        mechanism: ["command-stdin"],
        configFiles: [
          {
            scope: "user",
            path: "~/.hermes/config.yaml",
            format: "yaml",
            gitignored: false,
          },
          {
            scope: "user",
            path: "~/.hermes/shell-hooks-allowlist.json",
            format: "json",
            gitignored: false,
          },
        ],
        events: [
          {
            nativeName: "pre_tool_call",
            canonical: "tool.pre",
            matcher: { kind: "regex", example: "terminal|read_file|write_file", notes: null },
            decision: [{ kind: "observe" }, { kind: "block", outcomes: ["deny"] }],
            sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "post_tool_call",
            canonical: "tool.post",
            matcher: { kind: "regex", example: "terminal|read_file|write_file", notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "pre_llm_call",
            canonical: "prompt.submit",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }, { kind: "modify", operations: ["inject-context"] }],
            sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "post_llm_call",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "on_session_start",
            canonical: "session.start",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "subagent_stop",
            canonical: "subagent.stop",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "observe" }],
            sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks"],
            lastVerified: "2026-07-22",
          },
          {
            nativeName: "transform_llm_output",
            canonical: "turn.end",
            matcher: { kind: "none-imperative", example: null, notes: null },
            decision: [{ kind: "modify", operations: ["modify-output"] }],
            sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks"],
            lastVerified: "2026-07-22",
          },
        ],
        tools: [],
      },
      axm: {
        status: "unsupported",
        writer: null,
        lastVerified: null,
      },
    },
  },
  instructions: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes:
        "Hermes reads AGENTS.md as a recursive project instruction source. .hermes.md and SOUL.md are higher-priority native alternatives at the git root, but AGENTS.md is the cross-tool standard AXM writes.\n",
      docs: [],
      sources: ["https://hermes-agent.nousresearch.com/docs/user-guide/configuration"],
      scopes: ["project"],
      standardsCompliance: "full",
      convention: "universal",
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
} as const satisfies Agent;
