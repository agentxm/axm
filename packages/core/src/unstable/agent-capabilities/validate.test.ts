import * as fs from "node:fs";
import * as path from "node:path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { CONFIGURABLE_AGENT_IDS } from "../agents/types.js";
import { AgentIdSchema, AGENTS } from "./__generated__/catalog.js";
import { AgentSchema, type Agent } from "./schema.js";
import { validateCatalogSources, type CatalogSource } from "./validate.js";

const AGENTS_DIR = path.join(import.meta.dirname, "data/agents");
const decodeAgent = (input: unknown): Agent =>
  Schema.decodeUnknownSync(AgentSchema)(input, { onExcessProperty: "error" });

const readYamlAgent = (filename: string): CatalogSource => {
  const document = YAML.parseDocument(fs.readFileSync(path.join(AGENTS_DIR, filename), "utf8"));
  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join("; "));
  }
  const parsed: unknown = document.toJSON();
  return { filename, agent: decodeAgent(parsed) };
};

const makeAgent = (input: unknown): Agent => decodeAgent(input);
const sortedStrings = (values: ReadonlyArray<string>): ReadonlyArray<string> => [...values].sort();

describe("agent capability catalog validation", () => {
  it("decodes and validates every source YAML file", () => {
    const sources = fs
      .readdirSync(AGENTS_DIR)
      .filter((filename) => filename.endsWith(".yaml"))
      .sort()
      .map(readYamlAgent);

    expect(validateCatalogSources(sources)).toEqual([]);
  });

  it("generated agents conform to the schema", () => {
    expect(sortedStrings(AGENTS.map((agent) => decodeAgent(agent).id))).toEqual(
      sortedStrings(CONFIGURABLE_AGENT_IDS),
    );
  });

  it("generated AgentIdSchema rejects ids outside the verified catalog", () => {
    const decode = Schema.decodeUnknownResult(AgentIdSchema);
    expect(Result.isSuccess(decode("claude-code"))).toBe(true);
    expect(Result.isFailure(decode("unknown-agent"))).toBe(true);
  });

  it("requires filenames to match agent ids", () => {
    const agent = makeAgent({
      id: "codex",
      name: "Codex",
      vendor: "OpenAI",
      homepage: "https://developers.openai.com/codex",
      interfaces: ["cli"],
    });

    expect(validateCatalogSources([{ filename: "openai-codex.yaml", agent }])).toContainEqual({
      path: "openai-codex.yaml",
      message: "Agent id codex must match filename codex.yaml.",
    });
  });

  it("rejects spec axes on non-spec capabilities", () => {
    expect(() =>
      makeAgent({
        id: "sample-agent",
        name: "Sample Agent",
        vendor: "Example",
        homepage: "https://example.com",
        interfaces: ["cli"],
        commands: {
          standardsCompliance: "full",
          convention: "vendor",
          scopes: ["project"],
          directory: ".sample/commands",
          sources: ["https://example.com/docs"],
          lastVerified: "2026-05-16",
        },
      }),
    ).toThrow("standardsCompliance");
  });

  it("requires spec axes on spec-tracked capabilities", () => {
    expect(() =>
      makeAgent({
        id: "sample-agent",
        name: "Sample Agent",
        vendor: "Example",
        homepage: "https://example.com",
        interfaces: ["cli"],
        skills: {
          scopes: ["project"],
          directory: ".sample/skills",
          sources: ["https://example.com/docs"],
          lastVerified: "2026-05-16",
        },
      }),
    ).toThrow("standardsCompliance");
  });

  it("validates instruction kind invariants", () => {
    const agent = makeAgent({
      id: "sample-agent",
      name: "Sample Agent",
      vendor: "Example",
      homepage: "https://example.com",
      interfaces: ["cli"],
      instructions: {
        standardsCompliance: "full",
        convention: "universal",
        scopes: ["project"],
        kind: "agents-md",
        files: ["SAMPLE.md"],
        nestedDiscovery: false,
        sources: ["https://example.com/docs"],
        lastVerified: "2026-05-16",
      },
    });

    expect(validateCatalogSources([{ filename: "sample-agent.yaml", agent }])).toContainEqual({
      path: "sample-agent.yaml:instructions.files",
      message: 'instructions.kind "agents-md" requires files [AGENTS.md].',
    });
  });

  it("requires sourced capability claims", () => {
    const agent = makeAgent({
      id: "sample-agent",
      name: "Sample Agent",
      vendor: "Example",
      homepage: "https://example.com",
      interfaces: ["cli"],
      skills: {
        standardsCompliance: "full",
        convention: "vendor",
        scopes: ["project"],
      },
    });

    expect(validateCatalogSources([{ filename: "sample-agent.yaml", agent }])).toEqual([
      {
        path: "sample-agent.yaml:skills",
        message: "Capability claims require at least one source.",
      },
      {
        path: "sample-agent.yaml:skills",
        message: "Capability claims require lastVerified.",
      },
    ]);
  });

  it("requires command directory when commands are available", () => {
    const agent = makeAgent({
      id: "sample-agent",
      name: "Sample Agent",
      vendor: "Example",
      homepage: "https://example.com",
      interfaces: ["cli"],
      commands: {
        scopes: ["project"],
        sources: ["https://example.com/docs"],
        lastVerified: "2026-05-16",
      },
    });

    expect(validateCatalogSources([{ filename: "sample-agent.yaml", agent }])).toContainEqual({
      path: "sample-agent.yaml:commands.directory",
      message: "Supported commands require directory.",
    });
  });

  it("requires config for full MCP standards compliance", () => {
    const agent = makeAgent({
      id: "sample-agent",
      name: "Sample Agent",
      vendor: "Example",
      homepage: "https://example.com",
      interfaces: ["cli"],
      mcp: {
        standardsCompliance: "full",
        convention: "universal",
        scopes: ["project"],
        transports: ["stdio"],
        sources: ["https://example.com/docs"],
        lastVerified: "2026-05-18",
      },
    });

    expect(validateCatalogSources([{ filename: "sample-agent.yaml", agent }])).toContainEqual({
      path: "sample-agent.yaml:mcp.config",
      message: "Full MCP standards compliance must declare config.",
    });
  });

  it("requires MCP config coverage for declared transports", () => {
    const agent = makeAgent({
      id: "sample-agent",
      name: "Sample Agent",
      vendor: "Example",
      homepage: "https://example.com",
      interfaces: ["cli"],
      mcp: {
        standardsCompliance: "full",
        convention: "universal",
        scopes: ["project"],
        transports: ["stdio", "http"],
        config: {
          serversKey: "mcpServers",
          nativeEnabled: false,
          targets: [{ scope: "project", path: ".mcp.json", format: "json" }],
        },
        sources: ["https://example.com/docs"],
        lastVerified: "2026-05-18",
      },
    });

    expect(validateCatalogSources([{ filename: "sample-agent.yaml", agent }])).toEqual(
      expect.arrayContaining([
        {
          path: "sample-agent.yaml:mcp.config.stdio",
          message: "MCP stdio config is required when stdio transport is supported.",
        },
        {
          path: "sample-agent.yaml:mcp.config.remote",
          message: "MCP remote config is required when http or sse transport is supported.",
        },
      ]),
    );
  });
});
