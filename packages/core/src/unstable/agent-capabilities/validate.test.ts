import * as fs from "node:fs";
import * as path from "node:path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { CONFIGURABLE_AGENT_IDS } from "../agents/types.js";
import { AgentIdSchema, AGENTS } from "./catalog.generated.js";
import { AgentSchema, type Agent } from "./schema.js";
import { validateCatalogSources, type CatalogSource } from "./validate.js";

const AGENTS_DIR = path.join(import.meta.dirname, "data/agents");
const decodeAgent = Schema.decodeUnknownSync(AgentSchema);

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

  it("enforces standard instructions include AGENTS.md", () => {
    const agent = makeAgent({
      id: "sample-agent",
      name: "Sample Agent",
      vendor: "Example",
      homepage: "https://example.com",
      interfaces: ["cli"],
      instructions: {
        support: "standard",
        scopes: ["project"],
        kind: "agents-md",
        files: ["SAMPLE.md"],
        nestedDiscovery: false,
        sources: ["https://example.com/docs"],
        lastVerified: "2026-05-16",
      },
    });

    expect(validateCatalogSources([{ filename: "sample-agent.yaml", agent }])).toContainEqual({
      path: "sample-agent.yaml:instructions",
      message: "Standard instructions support must include AGENTS.md.",
    });
  });

  it("enforces bridged instructions omit AGENTS.md", () => {
    const agent = makeAgent({
      id: "sample-agent",
      name: "Sample Agent",
      vendor: "Example",
      homepage: "https://example.com",
      interfaces: ["cli"],
      instructions: {
        support: "bridged",
        scopes: ["project"],
        kind: "own-file",
        files: ["AGENTS.md", "SAMPLE.md"],
        nestedDiscovery: false,
        sources: ["https://example.com/docs"],
        lastVerified: "2026-05-16",
      },
    });

    expect(validateCatalogSources([{ filename: "sample-agent.yaml", agent }])).toContainEqual({
      path: "sample-agent.yaml:instructions",
      message: "Bridged instructions support must not include AGENTS.md.",
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
        support: "standard",
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

  it("requires config for standard MCP support", () => {
    const agent = makeAgent({
      id: "sample-agent",
      name: "Sample Agent",
      vendor: "Example",
      homepage: "https://example.com",
      interfaces: ["cli"],
      mcp: {
        support: "standard",
        scopes: ["project"],
        transports: ["stdio"],
        sources: ["https://example.com/docs"],
        lastVerified: "2026-05-18",
      },
    });

    expect(validateCatalogSources([{ filename: "sample-agent.yaml", agent }])).toContainEqual({
      path: "sample-agent.yaml:mcp.config",
      message: "Standard MCP support must declare config.",
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
        support: "standard",
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
