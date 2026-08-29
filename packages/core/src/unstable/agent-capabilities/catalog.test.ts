import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { CONFIGURABLE_AGENT_IDS } from "../agents/types.js";
import {
  AgentIdSchema,
  AGENTS,
  AGENT_IDS,
  CONFIGURABLE_AGENTS_BY_ID,
  HOSTED_AGENTS_BY_ID,
  HOSTED_AGENT_IDS,
} from "./catalog.js";
import {
  deriveAgentDescriptor,
  deriveSkillConvention,
  isCapabilitySupported,
  toNativeAgent,
} from "./derive.js";
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
import { capabilityVerificationAgeReport } from "./verification.js";
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
const ORIGINAL_SKILL_DIRS: Readonly<Record<string, string>> = {
  adal: ".adal/skills",
  "aider-desk": ".aider-desk/skills",
  amp: ".agents/skills",
  antigravity: ".agents/skills",
  augment: ".augment/skills",
  "claude-code": ".claude/skills",
  cline: ".cline/skills",
  "codearts-agent": ".codeartsdoer/skills",
  codebuddy: ".codebuddy/skills",
  codestudio: ".codestudio/skills",
  codex: ".agents/skills",
  "command-code": ".commandcode/skills",
  continue: ".continue/skills",
  cortex: ".cortex/skills",
  crush: ".agents/skills",
  cursor: ".cursor/skills",
  deepagents: ".agents/skills",
  devin: ".devin/skills",
  dexto: ".agents/skills",
  droid: ".factory/skills",
  firebender: ".firebender/skills",
  forgecode: ".forge/skills",
  "gemini-cli": ".agents/skills",
  "github-copilot-cli": ".github/skills",
  goose: ".agents/skills",
  "grok-cli": ".grok/skills",
  hermes: ".hermes/skills",
  "ibm-bob": ".bob/skills",
  junie: ".junie/skills",
  kilo: ".kilo/skills",
  "kimi-cli": ".agents/skills",
  "kiro-cli": ".kiro/skills",
  kode: ".kode/skills",
  mcpjam: ".mcpjam/skills",
  "mistral-vibe": ".vibe/skills",
  mux: ".mux/skills",
  neovate: ".neovate/skills",
  openclaw: "skills",
  opencode: ".opencode/skills",
  openhands: ".agents/skills",
  pi: ".pi/skills",
  pochi: ".pochi/skills",
  qoder: ".qoder/skills",
  "qwen-code": ".qwen/skills",
  replit: ".agents/skills",
  roo: ".roo/skills",
  rovodev: ".rovodev/skills",
  "tabnine-cli": ".tabnine/agent/skills",
  "trae-cn": ".trae/skills",
  trae: ".trae/skills",
  warp: ".agents/skills",
  windsurf: ".windsurf/skills",
  zencoder: ".agents/skills",
};
describe("agent capability catalog", () => {
  it("registers 62 configurable agents", () => {
    expect(CONFIGURABLE_AGENT_IDS).toHaveLength(62);
  });

  it("decodes every typed catalog entry through the schema", () => {
    const decoded = Schema.decodeUnknownSync(Schema.Array(AgentSchema))(AGENTS, {
      onExcessProperty: "error",
    });
    expect(sortedStrings(decoded.map((agent) => agent.id))).toEqual(sortedStrings(AGENT_IDS));
  });
  it("keeps every original agent's primary Skill write directory byte-identical", () => {
    const actual = Object.fromEntries(
      AGENTS.flatMap((agent) => {
        if (!Object.hasOwn(ORIGINAL_SKILL_DIRS, agent.id)) return [];
        const skills = deriveAgentDescriptor(agent).skills;
        return skills === undefined ? [] : [[agent.id, skills.dir]];
      }),
    );
    expect(Object.keys(actual)).toHaveLength(53);
    expect(actual).toEqual(ORIGINAL_SKILL_DIRS);
  });
  it("accepts omitted Skill read paths and rejects invalid statuses", () => {
    const decoded = decodeAgent(makeAgentInput());
    expect(
      "additionalReadPaths" in decoded.capabilities.skill.native
        ? decoded.capabilities.skill.native.additionalReadPaths
        : undefined,
    ).toEqual([]);

    const input = makeAgentInput();
    const capabilities = makeCapabilitiesInput();
    expect(() =>
      decodeAgent({
        ...input,
        capabilities: {
          ...capabilities,
          skill: {
            ...capabilities.skill,
            native: {
              ...capabilities.skill.native,
              additionalReadPaths: [{ path: ".other/skills", status: "legacy" }],
            },
          },
        },
      }),
    ).toThrow("Expected SkillReadPathStatus");
  });
  it("keeps authored Skill conventions equal to the primary-directory convention", () => {
    const mismatches = AGENTS.flatMap((agent) => {
      const native = agent.capabilities.skill.native;
      if (!("directory" in native)) return [];
      return native.convention === deriveSkillConvention(native.directory)
        ? []
        : [`${agent.id}: ${native.convention} != ${deriveSkillConvention(native.directory)}`];
    });
    expect(mismatches).toEqual([]);
  });
  it("requires an explicit rootDir decision for universal Skill write paths", () => {
    const missing = AGENTS.flatMap((agent) => {
      const native = agent.capabilities.skill.native;
      return "directory" in native &&
        deriveSkillConvention(native.directory) === "universal" &&
        !Object.hasOwn(agent, "rootDir")
        ? [agent.id]
        : [];
    });
    expect(missing).toEqual([]);
  });
  it("keeps hosted agents out of the configurable filesystem registry", () => {
    expect(HOSTED_AGENT_IDS).toEqual(["chatgpt", "claude-ai", "cowork", "gemini-app"]);
    const configurableIds = new Set<string>(CONFIGURABLE_AGENT_IDS);
    for (const id of HOSTED_AGENT_IDS) {
      expect(configurableIds.has(id)).toBe(false);
    }

    for (const id of HOSTED_AGENT_IDS) {
      const agent = HOSTED_AGENTS_BY_ID[id];
      expect(agent.rootDir).toBeNull();
      expect(agent.detection).toEqual({ project: { markers: [] }, user: { markers: [] } });
      expect(agent.installTarget).toMatchObject({ kind: "hosted" });
      for (const capability of [
        ...Object.values(agent.capabilities),
        agent.instructions,
        agent.permissions,
      ]) {
        expect(capability.axm.writer).toBeNull();
      }
      expect(agent.capabilities.skill.axm).toMatchObject({
        status: "supported",
        writer: null,
      });
      expect(isCapabilitySupported(agent.capabilities.skill)).toBe(true);
      expect(toNativeAgent(agent).installTarget).toEqual(agent.installTarget);
    }
  });
  it("requires hosted-only agents to declare a hosted install target", () => {
    expect(() =>
      decodeAgent(
        makeAgentInput({
          interfaces: ["chat"],
          rootDir: null,
          detection: { project: { markers: [] }, user: { markers: [] } },
        }),
      ),
    ).toThrow("Agents with a hosted interface require installTarget");
  });
  it("rejects filesystem state on hosted-only agents", () => {
    expect(() =>
      decodeAgent(
        makeAgentInput({
          interfaces: ["hosted-agent"],
          rootDir: ".sample",
          installTarget: {
            kind: "hosted",
            delivery: ["upload"],
            artifact: "zip",
            instructions: "Upload the validated ZIP in the hosted agent settings.",
            docs: "https://example.com/hosted-install",
          },
        }),
      ),
    ).toThrow("Hosted-only agents cannot declare rootDir");
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
  it("keeps active configurable agents covered by a dated AXM verification", () => {
    const retiredWithoutVerifiedCapabilities: Array<string> = [];
    for (const id of CONFIGURABLE_AGENT_IDS) {
      const agent = CONFIGURABLE_AGENTS_BY_ID[id];
      const capabilities = [
        ...Object.values(agent.capabilities),
        agent.instructions,
        agent.permissions,
      ];
      const hasVerifiedCapability = capabilities.some(
        (capability) => capability.axm.lastVerified !== null,
      );
      if (!hasVerifiedCapability && agent.lifecycle.state !== "active") {
        retiredWithoutVerifiedCapabilities.push(id);
        continue;
      }
      expect(hasVerifiedCapability, `${id} has no verified AXM capability slots`).toBe(true);
    }
    expect(retiredWithoutVerifiedCapabilities).toEqual(["codemaker"]);
  });
  it("keeps supported Skill claims within the documented verification budget", () => {
    const asOf = new Date().toISOString().slice(0, 10);
    const report = capabilityVerificationAgeReport(AGENTS, asOf);
    const overdue = report
      .filter((entry) => entry.overdue)
      .map((entry) => `${entry.agentId}:${entry.capability} (${entry.ageDays ?? "never"} days)`);
    expect(overdue, `Overdue capability verification:\n${overdue.join("\n")}`).toEqual([]);
  });
  it("reports verification age per agent and capability", () => {
    const report = capabilityVerificationAgeReport(AGENTS, "2026-08-05");
    expect(report).toHaveLength(AGENTS.length * 6);
    expect(report).toContainEqual({
      agentId: "cursor",
      capability: "skill",
      status: "supported",
      lastVerified: "2026-08-05",
      ageDays: 0,
      budgetDays: 90,
      overdue: false,
    });
  });
  it("does not claim a permission writer without a concrete grant", () => {
    for (const agent of AGENTS) {
      const writer = agent.permissions.axm.writer;
      if (writer === null) continue;
      expect(
        Object.keys(writer.grants).length,
        `${agent.id} has an empty permission writer`,
      ).toBeGreaterThan(0);
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
                    targets: [
                      {
                        scope: "project",
                        path: ".mcp.json",
                        format: "json",
                        attribution: "shared",
                      },
                    ],
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
      expect(new Set(members.map((member) => member.target.attribution))).toEqual(
        new Set(["shared"]),
      );
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
  it("marks every universal project .mcp.json reader as shared", () => {
    const readers = AGENTS.flatMap((agent) => {
      const writer = agent.capabilities["mcp-server"].axm.writer;
      if (writer === null) return [];
      return writer.config.targets.flatMap((target) =>
        target.scope === "project" && target.path === ".mcp.json"
          ? [{ agentId: agent.id, attribution: target.attribution }]
          : [],
      );
    });

    expect(readers.length).toBeGreaterThanOrEqual(5);
    expect(readers.every((reader) => reader.attribution === "shared")).toBe(true);
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
