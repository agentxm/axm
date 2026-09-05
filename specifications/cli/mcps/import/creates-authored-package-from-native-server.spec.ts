import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  importedRemote,
  makeMcpPackageImportProcessFixture,
  readImportedMcpDeclaration,
  readImportedMcpManifest,
  readMcpImportResolution,
  readNativeMcpServers,
  writeNativeRemoteMcp,
} from "../../../support/mcp-package-import-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/import/creates-authored-package-from-native-server",
  title: "A native MCP server can become an authored package",
  statement:
    "Given one unmanaged native server defined by an HTTP URL and optional non-secret literal headers, mcps import --as shall create a workspace-authored MCP package under the supplied fully qualified MCP name with the same URL and headers.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "The built CLI reads native configuration, runs the package creation and managed validation path, and persists a schema-valid authored manifest and workspace declaration under the supplied identity.",
  methods: ["example", "decision-table"],
  derivedFrom: [
    "packages/cli/src/root/mcps/import.ts",
    "packages/cli-e2e/src/fork-import.e2e.test.ts",
    "cli/creation-uses-configured-workspace-ownership",
    "cli/authoring-uses-project-workspace",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Which native transports and configuration fields beyond the represented HTTP URL and headers must package conversion support without loss?",
    "What selection or refusal behavior is required when discovery finds no eligible server, several distinct servers, or conflicting definitions?",
    "How must package conversion preserve existing input references and credentials? The MCP secret owner governs managed secret storage; these examples use only non-secret literal headers.",
    "May a conversion replace an existing configured connection under the target name, and how should existing authored content be treated? The current configured-source transition is an observation, not a new fallback policy.",
  ],
  limitations: [
    {
      limitation:
        "These examples verify conversion of connection configuration without contacting the remote MCP service or exercising credentials.",
      retirementCondition:
        "Add evidence under accepted transport and credential obligations when those additional conversion conditions are decided.",
    },
  ],
});

describe("Converting a native MCP server into an authored package", () => {
  for (const targetName of ["native-context", "context"])
    it(`creates the requested ${targetName} package with the complete remote definition`, async () => {
      const fixture = makeMcpPackageImportProcessFixture();
      try {
        // Identical declarations in two agent files represent the same server.
        writeNativeRemoteMcp(fixture.selected, ".cursor/mcp.json");
        expect(readNativeMcpServers(fixture.selected)["native-context"]).toEqual(importedRemote);
        expect(
          readNativeMcpServers(fixture.selected, ".cursor/mcp.json")["native-context"],
        ).toEqual(importedRemote);

        const result = await fixture.importPackage([], `@acme/mcps/${targetName}`);

        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        expect(readMcpImportResolution(result.stdout)).toMatchObject({ outcome: "applied" });
        const manifest = readImportedMcpManifest(fixture.selected, targetName);
        expect(manifest).toMatchObject({ owner: "@acme", type: "mcp-server", name: targetName });
        expect(manifest.server.remotes).toHaveLength(1);
        const remote = manifest.server.remotes?.[0];
        if (remote === undefined) throw new Error("Expected the converted remote definition");
        expect(remote.url).toBe(importedRemote.url);
        expect(
          Object.fromEntries((remote.headers ?? []).map(({ name, value }) => [name, value])),
        ).toEqual(importedRemote.headers);
        expect(readImportedMcpDeclaration(fixture.selected, targetName).source).toBe("workspace");
      } finally {
        fixture.cleanup();
      }
    });
});
