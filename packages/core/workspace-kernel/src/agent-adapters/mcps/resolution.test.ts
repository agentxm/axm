import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { McpServerManifestSchema } from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import { selectMcpDistribution } from "./distribution.js";
import { resolveMcpInvocation } from "./resolution.js";

const source = (pkg: Record<string, unknown>) =>
  Schema.decodeUnknownSync(McpServerManifestSchema)({
    owner: "@acme",
    type: "mcp-server",
    name: "context",
    version: "1.0.0",
    server: {
      name: "io.example/context",
      description: "Fixture",
      version: "1.0.0",
      packages: [{ transport: { type: "stdio" }, ...pkg }],
    },
  });
describe("qualified runner resolution", () => {
  for (const [registryType, identifier, command, args] of [
    ["npm", "@acme/context", "npx", ["-y", "--runtime", "@acme/context@1.2.3", "--server"]],
    ["pypi", "context", "uvx", ["--runtime", "context==1.2.3", "--server"]],
    ["nuget", "Context", "dnx", ["--yes", "--runtime", "Context@1.2.3", "--", "--server"]],
    ["oci", "context", "docker", ["run", "-i", "--rm", "--runtime", "context:1.2.3", "--server"]],
  ] as const) {
    it(`keeps ${registryType} runtime and server argument order`, () => {
      const manifest = source({
        registryType,
        identifier,
        version: "1.2.3",
        runtimeArguments: [{ type: "positional", value: "--runtime" }],
        packageArguments: [{ type: "positional", value: "--server" }],
      });
      const selected = selectMcpDistribution({ manifest, allowUnambiguous: true });
      if (selected._tag !== "selected") throw new Error("Fixture selection failed");
      expect(
        resolveMcpInvocation({ manifest, distribution: selected.candidate.selector }),
      ).toMatchObject({ _tag: "resolved", connection: { transport: "stdio", command, args } });
    });
  }
  it("refuses integrity it cannot enforce", () => {
    const manifest = source({
      registryType: "npm",
      identifier: "context",
      fileSha256: "a".repeat(64),
    });
    const selected = selectMcpDistribution({ manifest, allowUnambiguous: true });
    if (selected._tag !== "selected") throw new Error("Fixture selection failed");
    expect(
      resolveMcpInvocation({ manifest, distribution: selected.candidate.selector }),
    ).toMatchObject({ _tag: "blocked", reason: expect.stringContaining("integrity") });
  });
});
