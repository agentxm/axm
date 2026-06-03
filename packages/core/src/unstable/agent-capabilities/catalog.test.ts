import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import { CONFIGURABLE_AGENT_IDS } from "../agents/types.js";
import { AgentIdSchema, AGENTS } from "./catalog.js";
import { AgentSchema, type Agent } from "./schema.js";

const decodeAgent = (input: unknown): Agent =>
  Schema.decodeUnknownSync(AgentSchema)(input, { onExcessProperty: "error" });

const makeAgentInput = (overrides: Record<string, unknown> = {}) => ({
  id: "sample-agent",
  name: "Sample Agent",
  vendor: "Example",
  homepage: "https://example.com",
  interfaces: ["cli"],
  family: null,
  rootDir: ".sample",
  detection: { projectDirs: [], userDirs: [] },
  docs: [],
  skills: {
    lifecycle: "available",
    notes: null,
    docs: [],
    sources: ["https://example.com/skills"],
    lastVerified: "2026-05-16",
    scopes: ["project"],
    standardsCompliance: "full",
    convention: "vendor",
    directory: ".sample/skills",
  },
  commands: { lifecycle: "unsupported", notes: null, docs: [], sources: [] },
  mcp: { lifecycle: "unsupported", notes: null, docs: [], sources: [] },
  subagents: { lifecycle: "unsupported", notes: null, docs: [], sources: [] },
  instructions: { lifecycle: "unsupported", notes: null, docs: [], sources: [] },
  rules: { lifecycle: "unsupported", notes: null, docs: [], sources: [] },
  hooks: { lifecycle: "unsupported", notes: null, docs: [], sources: [] },
  permissions: { lifecycle: "unsupported", notes: null, docs: [], sources: [] },
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

  it("AgentIdSchema rejects ids outside the verified catalog", () => {
    const decode = Schema.decodeUnknownResult(AgentIdSchema);
    expect(Result.isSuccess(decode("claude-code"))).toBe(true);
    expect(Result.isFailure(decode("unknown-agent"))).toBe(true);
  });

  it("rejects invalid URLs on catalog URL fields", () => {
    expect(() =>
      decodeAgent(
        makeAgentInput({
          homepage: "not-a-url",
        }),
      ),
    ).toThrow("Expected URL");
  });

  it("rejects spec axes on non-spec capabilities", () => {
    expect(() =>
      decodeAgent(
        makeAgentInput({
          commands: {
            lifecycle: "available",
            notes: null,
            docs: [],
            sources: ["https://example.com/docs"],
            lastVerified: "2026-05-16",
            scopes: ["project"],
            standardsCompliance: "full",
            convention: "vendor",
            directory: ".sample/commands",
          },
        }),
      ),
    ).toThrow("standardsCompliance");
  });

  it("requires spec axes on spec-tracked capabilities", () => {
    expect(() =>
      decodeAgent(
        makeAgentInput({
          skills: {
            lifecycle: "available",
            notes: null,
            docs: [],
            sources: ["https://example.com/docs"],
            lastVerified: "2026-05-16",
            scopes: ["project"],
            directory: ".sample/skills",
          },
        }),
      ),
    ).toThrow("standardsCompliance");
  });

  it("validates instruction kind invariants structurally", () => {
    expect(() =>
      decodeAgent(
        makeAgentInput({
          instructions: {
            lifecycle: "available",
            notes: null,
            docs: [],
            sources: ["https://example.com/docs"],
            lastVerified: "2026-05-16",
            scopes: ["project"],
            standardsCompliance: "full",
            convention: "universal",
            kind: "agents-md",
            files: ["SAMPLE.md"],
            nestedDiscovery: false,
            importSyntax: null,
          },
        }),
      ),
    ).toThrow("AGENTS.md");
  });

  it("requires sourced active capability claims", () => {
    expect(() =>
      decodeAgent(
        makeAgentInput({
          skills: {
            lifecycle: "available",
            notes: null,
            docs: [],
            sources: [],
            lastVerified: "2026-05-16",
            scopes: ["project"],
            standardsCompliance: "full",
            convention: "vendor",
            directory: ".sample/skills",
          },
        }),
      ),
    ).toThrow("sources");
  });

  it("requires rules.directory for rules-dir instructions", () => {
    expect(() =>
      decodeAgent(
        makeAgentInput({
          instructions: {
            lifecycle: "available",
            notes: null,
            docs: [],
            sources: ["https://example.com/docs"],
            lastVerified: "2026-05-16",
            scopes: ["project"],
            standardsCompliance: "partial",
            convention: "vendor",
            kind: "rules-dir",
            files: ["RULES.md"],
            nestedDiscovery: false,
            importSyntax: null,
          },
        }),
      ),
    ).toThrow('instructions.kind "rules-dir" requires rules.directory');
  });

  it("requires config for full MCP standards compliance", () => {
    expect(() =>
      decodeAgent(
        makeAgentInput({
          mcp: {
            lifecycle: "available",
            notes: null,
            docs: [],
            sources: ["https://example.com/docs"],
            lastVerified: "2026-05-18",
            scopes: ["project"],
            standardsCompliance: "full",
            convention: "universal",
            transports: ["stdio"],
          },
        }),
      ),
    ).toThrow("config");
  });

  it("requires MCP config coverage for declared transports", () => {
    expect(() =>
      decodeAgent(
        makeAgentInput({
          mcp: {
            lifecycle: "available",
            notes: null,
            docs: [],
            sources: ["https://example.com/docs"],
            lastVerified: "2026-05-18",
            scopes: ["project"],
            standardsCompliance: "full",
            convention: "universal",
            transports: ["stdio", "http"],
            config: {
              serversKey: "mcpServers",
              nativeEnabled: false,
              targets: [{ scope: "project", path: ".mcp.json", format: "json" }],
              stdio: null,
              remote: null,
              transform: null,
            },
          },
        }),
      ),
    ).toThrow("MCP stdio config is required");
  });
});
