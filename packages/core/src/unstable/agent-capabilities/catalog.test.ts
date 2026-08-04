import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { CONFIGURABLE_AGENT_IDS } from "../agents/types.js";
import { AgentIdSchema, AGENTS, AGENT_IDS } from "./catalog.js";
import {
  AgentLifecycleSchema,
  AgentSchema,
  CANONICAL_HOOK_EVENT_IDS,
  DetectionMarkerSchema,
  DetectionSchema,
  LEAF_EXTENSION_TYPES,
  type Agent,
} from "./schema.js";
import {
  resolveSharedMcpTarget,
  type SharedMcpTargetMember,
  type SharedMcpTransport,
} from "../mcps/shared-target.js";
const decodeAgent = (input: unknown): Agent =>
  Schema.decodeUnknownSync(AgentSchema)(input, { onExcessProperty: "error" });
const unsupportedCapability = {
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
} as const;
const unsupportedHookCapability = {
  ...unsupportedCapability,
  axm: {
    status: "unsupported",
    writer: null,
    lastVerified: null,
  },
} as const;
const makeCapabilitiesInput = (overrides: Record<string, unknown> = {}) => ({
  skill: {
    native: {
      availability: { via: "native" },
      vendorStatus: { state: "active" },
      notes: null,
      docs: [],
      sources: ["https://example.com/skills"],
      scopes: ["project"],
      standardsCompliance: "full",
      convention: "vendor",
      directory: ".sample/skills",
    },
    axm: {
      status: "supported",
      lastVerified: "2026-05-16",
      writer: null,
    },
  },
  command: unsupportedCapability,
  "mcp-server": unsupportedCapability,
  subagent: unsupportedCapability,
  hook: unsupportedHookCapability,
  ...overrides,
});
const makeAgentInput = (overrides: Record<string, unknown> = {}) => ({
  id: "sample-agent",
  name: "Sample Agent",
  vendor: "Example",
  homepage: "https://example.com",
  interfaces: ["cli"],
  family: null,
  rootDir: ".sample",
  lifecycle: { state: "active" },
  detection: { project: { markers: [] }, user: { markers: [] } },
  docs: [],
  capabilities: makeCapabilitiesInput(),
  instructions: unsupportedCapability,
  permissions: unsupportedCapability,
  ...overrides,
});
const sortedStrings = (values: ReadonlyArray<string>): ReadonlyArray<string> => [...values].sort();
describe("agent capability catalog", () => {
  it("decodes every typed catalog entry through the schema", () => {
    const decoded = Schema.decodeUnknownSync(Schema.Array(AgentSchema))(AGENTS, {
      onExcessProperty: "error",
    });
    expect(sortedStrings(decoded.map((agent) => agent.id))).toEqual(
      sortedStrings(CONFIGURABLE_AGENT_IDS),
    );
  });
  it("exposes native and AXM blocks on every decoded capability", () => {
    const decoded = Schema.decodeUnknownSync(Schema.Array(AgentSchema))(AGENTS, {
      onExcessProperty: "error",
    });
    for (const agent of decoded) {
      for (const capability of Object.values(agent.capabilities)) {
        expect(Object.keys(capability).sort()).toEqual(["axm", "native"]);
      }
    }
  });
  it("models native hooks for Codex with an AXM writer", () => {
    const decoded = Schema.decodeUnknownSync(Schema.Array(AgentSchema))(AGENTS, {
      onExcessProperty: "error",
    });
    const byId = new Map(decoded.map((agent) => [agent.id, agent]));
    const hook = byId.get("codex")?.capabilities.hook;
    expect(hook?.native.availability).toEqual({ via: "native" });
    expect(hook?.native).toHaveProperty("events");
    expect(hook?.axm).toMatchObject({
      status: "supported",
      writer: {
        serializer: "command-stdin",
        settingsKey: "hooks",
      },
    });
  });
  it("models native hooks for Cursor and OpenCode without AXM writers", () => {
    const decoded = Schema.decodeUnknownSync(Schema.Array(AgentSchema))(AGENTS, {
      onExcessProperty: "error",
    });
    const byId = new Map(decoded.map((agent) => [agent.id, agent]));
    for (const id of ["cursor", "opencode"]) {
      const hook = byId.get(id)?.capabilities.hook;
      expect(hook?.native.availability).toEqual({ via: "native" });
      expect(hook?.native).toMatchObject({ modeling: "native-unmodeled" });
      expect(hook?.axm).toMatchObject({
        writer: null,
      });
      expect(hook?.axm).toHaveProperty("reason");
    }
  });
  it("keeps the canonical hook registry equal to witnessed native hook events", () => {
    const ids = new Set<string>(CANONICAL_HOOK_EVENT_IDS);
    const witnessed = new Set<string>();
    const decoded = Schema.decodeUnknownSync(Schema.Array(AgentSchema))(AGENTS, {
      onExcessProperty: "error",
    });
    for (const agent of decoded) {
      const hook = agent.capabilities.hook;
      if (!("events" in hook.native)) continue;
      for (const event of hook.native.events) {
        expect(ids, `${agent.id} hook event ${event.nativeName}`).toContain(event.canonical);
        witnessed.add(event.canonical);
      }
    }
    expect([...witnessed].sort()).toEqual([...ids].sort());
  });
  it("AgentIdSchema rejects ids outside the verified catalog", () => {
    const decode = Schema.decodeUnknownResult(AgentIdSchema);
    expect(Result.isSuccess(decode("claude-code"))).toBe(true);
    expect(Result.isFailure(decode("unknown-agent"))).toBe(true);
  });
  it("decodes typed detection markers", () => {
    const marker = {
      kind: "executable",
      name: "codex",
      signal: "definitive",
      note: "CLI on PATH.",
    };
    expect(Schema.decodeUnknownSync(DetectionMarkerSchema)(marker)).toEqual(marker);
  });
  it("rejects duplicate detection markers by kind and path", () => {
    expect(() =>
      Schema.decodeUnknownSync(DetectionSchema)({
        project: {
          markers: [
            { kind: "file", path: "AGENTS.md", signal: "ambiguous", note: null },
            { kind: "file", path: "AGENTS.md", signal: "supporting", note: null },
          ],
        },
        user: { markers: [] },
      }),
    ).toThrow("Detection markers must be unique");
  });
  it("rejects legacy detection directory arrays", () => {
    expect(() =>
      Schema.decodeUnknownSync(DetectionSchema)({
        projectDirs: [".sample"],
        userDirs: ["~/.sample"],
      }),
    ).toThrow();
  });
  it("rejects invalid URLs on catalog URL fields", () => {
    expect(() => decodeAgent(makeAgentInput({ homepage: "not-a-url" }))).toThrow("Expected URL");
  });
  it("rejects spec axes on non-spec capabilities", () => {
    expect(() =>
      decodeAgent(
        makeAgentInput({
          capabilities: makeCapabilitiesInput({
            command: {
              native: {
                availability: { via: "native" },
                vendorStatus: { state: "active" },
                notes: null,
                docs: [],
                sources: ["https://example.com/docs"],
                scopes: ["project"],
                standardsCompliance: "full",
                convention: "vendor",
                directory: ".sample/commands",
              },
              axm: {
                status: "supported",
                lastVerified: "2026-05-16",
                writer: null,
              },
            },
          }),
        }),
      ),
    ).toThrow("standardsCompliance");
    expect(() =>
      decodeAgent(
        makeAgentInput({
          capabilities: makeCapabilitiesInput({
            subagent: {
              native: {
                availability: { via: "native" },
                vendorStatus: { state: "active" },
                notes: null,
                docs: [],
                sources: ["https://example.com/docs"],
                scopes: ["project"],
                standardsCompliance: "full",
                convention: "vendor",
                directory: ".sample/agents",
                layout: "directory",
              },
              axm: {
                status: "supported",
                lastVerified: "2026-05-16",
                writer: null,
              },
            },
          }),
        }),
      ),
    ).toThrow("standardsCompliance");
  });
  it("requires spec axes on spec-tracked capabilities", () => {
    expect(() =>
      decodeAgent(
        makeAgentInput({
          capabilities: makeCapabilitiesInput({
            skill: {
              native: {
                availability: { via: "native" },
                vendorStatus: { state: "active" },
                notes: null,
                docs: [],
                sources: ["https://example.com/docs"],
                scopes: ["project"],
                directory: ".sample/skills",
              },
              axm: {
                status: "supported",
                lastVerified: "2026-05-16",
                writer: null,
              },
            },
          }),
        }),
      ),
    ).toThrow("standardsCompliance");
  });
  it("validates instruction kind invariants structurally", () => {
    expect(() =>
      decodeAgent(
        makeAgentInput({
          instructions: {
            native: {
              availability: { via: "native" },
              vendorStatus: { state: "active" },
              notes: null,
              docs: [],
              sources: ["https://example.com/docs"],
              scopes: ["project"],
              standardsCompliance: "full",
              convention: "universal",
              kind: "agents-md",
              files: ["SAMPLE.md"],
              nestedDiscovery: false,
              importSyntax: null,
            },
            axm: {
              status: "supported",
              lastVerified: "2026-05-16",
              writer: null,
            },
          },
        }),
      ),
    ).toThrow("AGENTS.md");
  });
  it("requires sourced active AXM support claims", () => {
    expect(() =>
      decodeAgent(
        makeAgentInput({
          capabilities: makeCapabilitiesInput({
            skill: {
              native: {
                availability: { via: "native" },
                vendorStatus: { state: "active" },
                notes: null,
                docs: [],
                sources: [],
                scopes: ["project"],
                standardsCompliance: "full",
                convention: "vendor",
                directory: ".sample/skills",
              },
              axm: {
                status: "supported",
                lastVerified: "2026-05-16",
                writer: null,
              },
            },
          }),
        }),
      ),
    ).toThrow("sources");
  });
  it("requires rules.directory for rules-dir instructions", () => {
    expect(() =>
      decodeAgent(
        makeAgentInput({
          instructions: {
            native: {
              availability: { via: "native" },
              vendorStatus: { state: "active" },
              notes: null,
              docs: [],
              sources: ["https://example.com/docs"],
              scopes: ["project"],
              standardsCompliance: "partial",
              convention: "vendor",
              kind: "rules-dir",
              files: ["RULES.md"],
              nestedDiscovery: false,
              importSyntax: null,
            },
            axm: {
              status: "supported",
              lastVerified: "2026-05-16",
              writer: null,
            },
          },
        }),
      ),
    ).toThrow("directory");
  });
  it("allows full MCP standards compliance without writer config", () => {
    const decoded = decodeAgent(
      makeAgentInput({
        capabilities: makeCapabilitiesInput({
          "mcp-server": {
            native: {
              availability: { via: "native" },
              vendorStatus: { state: "active" },
              notes: null,
              docs: [],
              sources: ["https://example.com/docs"],
              scopes: ["project"],
              standardsCompliance: "full",
              convention: "universal",
              transports: ["stdio"],
            },
            axm: {
              status: "supported",
              lastVerified: "2026-05-18",
              writer: null,
            },
          },
        }),
      }),
    );
    expect(decoded.capabilities["mcp-server"].axm.status).toBe("supported");
  });
  it("reports the real native files path for invalid agents-md rule files", () => {
    expect(() =>
      decodeAgent(
        makeAgentInput({
          instructions: {
            native: {
              availability: { via: "native" },
              vendorStatus: { state: "active" },
              notes: null,
              docs: [],
              sources: ["https://example.com/docs"],
              scopes: ["project"],
              standardsCompliance: "full",
              convention: "universal",
              kind: "agents-md",
              files: ["README.md"],
              nestedDiscovery: true,
              importSyntax: null,
            },
            axm: {
              status: "supported",
              lastVerified: "2026-05-16",
              writer: null,
            },
          },
        }),
      ),
    ).toThrow('["instructions"]["native"]["files"]');
  });
  it("requires MCP config coverage for declared transports", () => {
    expect(() =>
      decodeAgent(
        makeAgentInput({
          capabilities: makeCapabilitiesInput({
            "mcp-server": {
              native: {
                availability: { via: "native" },
                vendorStatus: { state: "active" },
                notes: null,
                docs: [],
                sources: ["https://example.com/docs"],
                scopes: ["project"],
                standardsCompliance: "full",
                convention: "universal",
                transports: ["stdio", "http"],
              },
              axm: {
                status: "supported",
                lastVerified: "2026-05-18",
                writer: {
                  config: {
                    serversKey: "mcpServers",
                    activationField: {
                      required: null,
                      accepted: [null],
                    },
                    targets: [{ scope: "project", path: ".mcp.json", format: "json" }],
                    stdio: null,
                    remote: null,
                  },
                },
              },
            },
          }),
        }),
      ),
    ).toThrow("MCP stdio config is required");
  });
  it("keeps every shared MCP writer target compatible", () => {
    const groups = new Map<string, Array<SharedMcpTargetMember>>();
    for (const agent of AGENTS) {
      const writer = agent.capabilities["mcp-server"].axm.writer;
      if (writer === null) continue;
      for (const target of writer.config.targets) {
        const key = target.scope + ":" + target.path;
        const members = groups.get(key) ?? [];
        members.push({ agentId: agent.id, config: writer.config, target });
        groups.set(key, members);
      }
    }
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      const transports = new Set<SharedMcpTransport>();
      for (const member of members) {
        if (member.config.stdio !== null) transports.add("stdio");
        if (member.config.remote?.urlKey["streamable-http"] !== undefined) {
          transports.add("streamable-http");
        }
        if (member.config.remote?.urlKey.sse !== undefined) transports.add("sse");
      }
      for (const transport of transports) {
        const resolution = resolveSharedMcpTarget({ members, transport });
        expect(
          resolution._tag,
          resolution._tag === "conflict" ? resolution.reason : undefined,
        ).toBe("resolved");
      }
    }
  });
  it("keeps every required MCP writer representation in its accepted set", () => {
    for (const agent of AGENTS) {
      const writer = agent.capabilities["mcp-server"].axm.writer;
      if (writer === null) continue;
      const policies = [
        writer.config.activationField,
        ...(writer.config.stdio === null ? [] : [writer.config.stdio.typeField]),
        ...(writer.config.remote === null ? [] : [writer.config.remote.typeField]),
      ];
      for (const policy of policies) {
        expect(policy.accepted, agent.id).toContainEqual(policy.required);
      }
    }
  });
  it("defaults every catalog agent to an active lifecycle unless retired or deprecated", () => {
    for (const agent of AGENTS) {
      expect(["active", "deprecated", "retired"]).toContain(agent.lifecycle.state);
    }
  });
  it("requires since, note, and supersededBy on inactive lifecycle states", () => {
    const decode = (input: unknown) =>
      Schema.decodeUnknownResult(AgentLifecycleSchema)(input, { onExcessProperty: "error" });
    expect(Result.isSuccess(decode({ state: "active" }))).toBe(true);
    expect(
      Result.isSuccess(
        decode({
          state: "retired",
          since: "2025-11-01",
          note: "Merged into another agent.",
          supersededBy: "cursor",
        }),
      ),
    ).toBe(true);
    // active carries no metadata
    expect(Result.isFailure(decode({ state: "active", supersededBy: "cursor" }))).toBe(true);
    // retired/deprecated must spell out the inactive fields
    expect(Result.isFailure(decode({ state: "retired" }))).toBe(true);
    expect(Result.isFailure(decode({ state: "deprecated", since: "2025-11-01" }))).toBe(true);
  });
  it("keeps supersededBy references valid: known agent, not self, no cycles", () => {
    const agents = Schema.decodeUnknownSync(Schema.Array(AgentSchema))(AGENTS);
    const byId = new Map(agents.map((agent) => [agent.id, agent]));
    const ids = new Set<string>(AGENT_IDS);
    const successorOf = (id: string): string | null => {
      const lifecycle = byId.get(id)?.lifecycle;
      return lifecycle === undefined || lifecycle.state === "active"
        ? null
        : lifecycle.supersededBy;
    };
    for (const agent of agents) {
      if (agent.lifecycle.state === "active") continue;
      const successor = agent.lifecycle.supersededBy;
      if (successor === null) continue;
      expect(ids, `${agent.id} supersededBy unknown agent ${successor}`).toContain(successor);
      expect(successor, `${agent.id} supersededBy itself`).not.toBe(agent.id);
      // Walk the successor chain; it must terminate without revisiting a node.
      const seen = new Set<string>([agent.id]);
      let cursor: string | null = successor;
      while (cursor !== null) {
        expect(seen, `supersededBy cycle through ${cursor}`).not.toContain(cursor);
        seen.add(cursor);
        cursor = successorOf(cursor);
      }
    }
  });
  it("keeps supersededByType references valid", () => {
    const leafTypes = new Set<string>(LEAF_EXTENSION_TYPES);
    const agents = Schema.decodeUnknownSync(Schema.Array(AgentSchema))(AGENTS);
    for (const agent of agents) {
      for (const capability of [...Object.values(agent.capabilities), agent.permissions]) {
        if (capability.native.vendorStatus.state === "active") continue;
        const successor = capability.native.vendorStatus.supersededByType;
        if (successor === null) continue;
        expect(
          leafTypes,
          `${agent.id} supersededByType unknown extension type ${successor}`,
        ).toContain(successor);
      }
    }
  });
});
