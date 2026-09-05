import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { JsonErrorEnvelopeSchema } from "axm.sh/specification-harness";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  importedRemote,
  makeMcpPackageImportProcessFixture,
  readImportedMcpDeclaration,
  readImportedMcpManifest,
  readMcpImportResolution,
  readNativeMcpServers,
} from "../../../support/mcp-package-import-fixture.js";
import { snapshotProtectedState } from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/import/package-enablement-is-explicit",
  title: "Imported packages are enabled only by an explicit request",
  statement:
    "The --enable option of mcps import shall apply only to --as package conversion, enabling the converted package when supplied and leaving it disabled when omitted.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  boundary: "process",
  boundaryRationale:
    "Actual CLI invocations distinguish the registered option combinations and observe persisted activation state plus the resulting native configurations.",
  methods: ["example", "decision-table"],
  derivedFrom: [
    "packages/cli/src/root/mcps/import.ts",
    "packages/cli/src/root/mcps/import.internal.test.ts",
    "packages/cli-e2e/src/fork-import.e2e.test.ts",
    "cli/mcps/projects-to-every-configured-agent",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Opt-in activation of an imported MCP package", () => {
  for (const enabled of [false, true])
    it(`persists ${enabled ? "enabled" : "disabled"} authored state and reconciles native entries`, async () => {
      const fixture = makeMcpPackageImportProcessFixture();
      try {
        expect(readNativeMcpServers(fixture.selected)["native-context"]).toEqual(importedRemote);

        const result = await fixture.importPackage(enabled ? ["--enable"] : []);

        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        expect(readMcpImportResolution(result.stdout)).toMatchObject({ outcome: "applied" });
        expect(readImportedMcpManifest(fixture.selected).name).toBe("context");
        expect(readImportedMcpDeclaration(fixture.selected)).toEqual({
          source: "workspace",
          enabled,
        });
        for (const relative of [".mcp.json", ".cursor/mcp.json"]) {
          const servers = readNativeMcpServers(fixture.selected, relative);
          expect(servers, relative).not.toHaveProperty("native-context");
          if (enabled) expect(servers["context"], relative).toMatchObject(importedRemote);
          else expect(servers, relative).not.toHaveProperty("context");
        }
      } finally {
        fixture.cleanup();
      }
    });

  it("refuses --enable without --as before changing a discoverable native server", async () => {
    const fixture = makeMcpPackageImportProcessFixture();
    try {
      expect(readNativeMcpServers(fixture.selected)["native-context"]).toEqual(importedRemote);
      const before = snapshotProtectedState(fixture.selected);
      const result = await fixture.run([
        "-C",
        fixture.selected,
        "mcps",
        "import",
        "--enable",
        "--non-interactive",
        "--json",
      ]);

      expect(result.exitCode).not.toBe(0);
      const input: unknown = JSON.parse(result.stdout);
      const refusal = Schema.decodeUnknownSync(JsonErrorEnvelopeSchema)(input);
      expect(refusal).toMatchObject({ code: "usage" });
      expect(refusal.detail).toContain("--enable");
      expect(refusal.detail).toContain("--as");
      expect(snapshotProtectedState(fixture.selected)).toEqual(before);
    } finally {
      fixture.cleanup();
    }
  });
});
