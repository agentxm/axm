import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { AGENTS, CONFIGURABLE_AGENTS_BY_ID, HOSTED_AGENTS_BY_ID } from "./catalog.js";
import { AgentIdSchema, AGENT_IDS, CONFIGURABLE_AGENT_IDS, HOSTED_AGENT_IDS } from "./identity.js";
import { deriveSkillConvention, isCapabilitySupported, toNativeAgent } from "./derive.js";
import {
  AgentLifecycleSchema,
  AgentSchema,
  CANONICAL_HOOK_EVENT_IDS,
  DetectionMarkerSchema,
  DetectionSchema,
  type Agent,
  type NativeReadLocation,
} from "./schema.js";
import { LEAF_EXTENSION_TYPES } from "../extension-types/schema.js";
import { capabilityVerificationAgeReport } from "./verification.js";
const projectLocation = (
  path: string,
  shape: "file" | "directory" = "directory",
): NativeReadLocation => ({
  scope: "project",
  root: "project",
  path,
  shape,
  role: "primary",
  status: "canonical",
  applicability: { kind: "always" },
  provenance: { kind: "capability-sources" },
});
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
      locations: [projectLocation(".sample/skills")],
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
describe("agent capability catalog", () => {
  it("registers each configurable identity exactly once", () => {
    expect(Object.keys(CONFIGURABLE_AGENTS_BY_ID).sort()).toEqual(
      [...CONFIGURABLE_AGENT_IDS].sort(),
    );
    expect(new Set(CONFIGURABLE_AGENT_IDS).size).toBe(CONFIGURABLE_AGENT_IDS.length);
  });

  it("decodes every typed catalog entry through the schema", () => {
    const decoded = Schema.decodeUnknownSync(Schema.Array(AgentSchema))(AGENTS, {
      onExcessProperty: "error",
    });
    expect(sortedStrings(decoded.map((agent) => agent.id))).toEqual(sortedStrings(AGENT_IDS));
  });
  it("requires explicit Skill locations and rejects invalid status claims", () => {
    const decoded = decodeAgent(makeAgentInput());
    expect(
      "locations" in decoded.capabilities.skill.native
        ? decoded.capabilities.skill.native.locations
        : undefined,
    ).toEqual([projectLocation(".sample/skills")]);
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
              locations: [{ ...projectLocation(".other/skills"), status: "legacy" }],
            },
          },
        },
      }),
    ).toThrow("status");
    expect(() =>
      decodeAgent({
        ...input,
        capabilities: {
          ...capabilities,
          skill: {
            ...capabilities.skill,
            native: { ...capabilities.skill.native, directory: ".legacy/skills" },
          },
        },
      }),
    ).toThrow("directory");
  });
  it("keeps authored Skill conventions equal to the primary-directory convention", () => {
    const mismatches = AGENTS.flatMap((agent) => {
      const native = agent.capabilities.skill.native;
      if (!("locations" in native)) return [];
      const primary = native.locations.find(
        (location) => location.scope === "project" && location.role === "primary",
      );
      if (primary === undefined) return [];
      return native.convention === deriveSkillConvention(primary.path)
        ? []
        : [`${agent.id}: ${native.convention} != ${deriveSkillConvention(primary.path)}`];
    });
    expect(mismatches).toEqual([]);
  });
  it("requires an explicit rootDir decision for universal Skill write paths", () => {
    const missing = AGENTS.flatMap((agent) => {
      const native = agent.capabilities.skill.native;
      return "locations" in native &&
        native.locations.some(
          (location) =>
            location.scope === "project" &&
            location.role === "primary" &&
            deriveSkillConvention(location.path) === "universal",
        ) &&
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
  it("keeps recorded native capability reviews within the research freshness budget", () => {
    const asOf = new Date().toISOString().slice(0, 10);
    const report = capabilityVerificationAgeReport(AGENTS, asOf);
    const overdue = report
      .filter((entry) => entry.reviewedAt !== null && entry.reviewOverdue)
      .map((entry) => `${entry.agentId}:${entry.capability} (${entry.reviewAgeDays} days)`);
    expect(overdue, `Overdue recorded capability reviews:\n${overdue.join("\n")}`).toEqual([]);
  });
  it("reports verification age per agent and capability", () => {
    const report = capabilityVerificationAgeReport([decodeAgent(makeAgentInput())], "2026-05-17");
    expect(report).toHaveLength(6);
    expect(report).toContainEqual({
      agentId: "sample-agent",
      capability: "skill",
      status: "supported",
      legacyLastVerified: "2026-05-16",
      legacyAgeDays: 1,
      reviewedAt: null,
      reviewAgeDays: null,
      reviewMissing: true,
      verifiedAt: null,
      verificationAgeDays: null,
      verificationMissing: true,
      verificationBoundary: null,
      budgetDays: 90,
      reviewOverdue: true,
      verificationOverdue: true,
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
    expect(hook?.native).toHaveProperty("entryDialect.serializer", "command-stdin");
    expect(hook?.axm).toMatchObject({
      status: "supported",
      writer: {
        locationIds: ["project"],
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
                locations: [projectLocation(".sample/agents")],
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
                locations: [projectLocation(".sample/skills")],
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
              locations: [projectLocation("SAMPLE.md", "file")],
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
                locations: [projectLocation(".sample/skills")],
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
  it("requires primary directory locations for rules-dir instructions", () => {
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
              locations: [projectLocation("RULES.md", "file")],
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

              locations: [],

              entryDialect: null,
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
  it("reports the native locations path for invalid agents-md instruction files", () => {
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
              locations: [projectLocation("README.md", "file")],
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
    ).toThrow('["instructions"]["native"]["locations"]');
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

                locations: [
                  {
                    id: "project-0",
                    scope: "project",
                    root: "project",
                    path: ".mcp.json",
                    shape: "file",
                    role: "primary",
                    status: "canonical",
                    applicability: { kind: "always" },
                    provenance: { kind: "capability-sources" },
                    format: "json",
                    attribution: "shared",
                    keyPath: ["mcpServers"],
                  },
                ],

                entryDialect: {
                  activationField: {
                    required: null,
                    accepted: [null],
                  },
                  stdio: null,
                  remote: null,
                },
              },
              axm: {
                status: "supported",
                lastVerified: "2026-05-18",
                writer: {
                  config: {
                    locationIds: ["project-0"],
                  },
                },
              },
            },
          }),
        }),
      ),
    ).toThrow("MCP stdio config is required");
  });
  it("marks every universal project .mcp.json reader as shared", () => {
    const readers = AGENTS.flatMap((agent) => {
      const native = agent.capabilities["mcp-server"].native;
      if (!("locations" in native)) return [];
      return native.locations.flatMap((target) =>
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
      const native = agent.capabilities["mcp-server"].native;
      if (!("entryDialect" in native) || native.entryDialect === null) continue;
      const dialect = native.entryDialect;
      const policies = [
        dialect.activationField,
        ...(dialect.stdio === null ? [] : [dialect.stdio.typeField]),
        ...(dialect.remote === null ? [] : [dialect.remote.typeField]),
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
