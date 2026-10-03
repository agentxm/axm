import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { defineSpecification } from "@agentxm/specification-metadata";
import { McpServerManifestSchema } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import {
  mcpDistributionCandidates,
  selectMcpDistribution,
  resolveMcpInvocation,
} from "../index.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/source-distribution-selection-is-stable",
  title: "MCP source distribution choice is explicit and stable",
  statement:
    "AXM shall select one distribution per local MCP connection independently of agent order, persist a selector based on stable distribution properties, and refuse unresolved, disappearing or ambiguous selections before projection.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});
const manifest = (packages: unknown[], remotes: unknown[] = []) =>
  Schema.decodeUnknownSync(McpServerManifestSchema)({
    type: "mcp-server",
    owner: "@acme",
    name: "tool",
    version: "1.0.0",
    description: "Test tool",
    server: {
      name: "io.example/tool",
      description: "Test tool",
      version: "1.0.0",
      packages,
      remotes,
    },
  });
const pkg = {
  registryType: "npm",
  identifier: "@example/tool",
  version: "1.0.0",
  transport: { type: "stdio" },
};
const remote = { type: "streamable-http", url: "https://example.test/mcp" };

describe("stable distribution choice", () => {
  it("allows only an authorizing install to choose the sole candidate", () => {
    const source = manifest([pkg]);
    expect(selectMcpDistribution({ manifest: source })._tag).toBe("blocked");
    expect(selectMcpDistribution({ manifest: source, allowUnambiguous: true })._tag).toBe(
      "selected",
    );
  });
  it("requires choice when both package and remote candidates exist", () => {
    const source = manifest([pkg], [remote]);
    expect(mcpDistributionCandidates(source)).toHaveLength(2);
    expect(selectMcpDistribution({ manifest: source, allowUnambiguous: true })._tag).toBe(
      "blocked",
    );
  });
  it("retains choice when package version and array order change", () => {
    const source = manifest([pkg, { ...pkg, identifier: "another" }]);
    const selected = selectMcpDistribution({
      manifest: source,
      id: mcpDistributionCandidates(source)[0]?.id,
    });
    expect(selected._tag).toBe("selected");
    if (selected._tag !== "selected") return;
    const next = manifest([
      { ...pkg, identifier: "another" },
      { ...pkg, version: "2.0.0" },
    ]);
    const result = resolveMcpInvocation({
      manifest: next,
      distribution: selected.candidate.selector,
    });
    expect(result._tag).toBe("resolved");
    if (result._tag === "resolved" && result.connection.transport === "stdio")
      expect(result.connection.args).toContain("@example/tool@2.0.0");
    expect(
      selectMcpDistribution({ manifest: manifest([]), selector: selected.candidate.selector })._tag,
    ).toBe("blocked");
  });
  it("refuses duplicate selectors and package-launched remote lifecycles", () => {
    expect(
      selectMcpDistribution({
        manifest: manifest([pkg, { ...pkg, version: "2.0.0" }]),
        allowUnambiguous: true,
      })._tag,
    ).toBe("blocked");
    const source = manifest([{ ...pkg, transport: remote }]);
    const selected = selectMcpDistribution({ manifest: source, allowUnambiguous: true });
    if (selected._tag !== "selected") throw new Error("Expected one candidate");
    expect(
      resolveMcpInvocation({ manifest: source, distribution: selected.candidate.selector })._tag,
    ).toBe("blocked");
  });
});
