import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleMcpsImport } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/import/preview-is-pure",
  title: "MCP server import preview describes the adoption without changing any state",
  statement:
    "When mcps import runs in preview mode against an unmanaged native MCP server, it shall report the adoption it would apply with a previewed outcome and shall not change settings, the lockfile, or any native agent MCP configuration.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/mcps/import/adoption-reaches-every-configured-agent"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

type SpecWorkspace = ReturnType<typeof makeSpecWorkspace>;

const writeNativeConfig = (
  workspace: SpecWorkspace,
  relativePath: string,
  server: Readonly<Record<string, unknown>>,
): void => {
  const target = path.join(workspace.root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify({ mcpServers: { demo: server } }, null, 2)}\n`);
};

describe("MCP server import preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("a previewed import of an unmanaged server changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
        settings: { agents: ["claude-code"] },
      });
      cleanups.push(workspace.cleanup);
      writeNativeConfig(workspace, ".mcp.json", { command: "node", args: ["server.js"] });
      const before = snapshotProtectedState(workspace.root);

      yield* handleMcpsImport({ preview: true }).pipe(Effect.provide(workspace.layer));

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(JSON.stringify(workspace.readSettings())).not.toContain("demo");
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          planName: "Import MCP servers",
          units: [{ label: "Import 1 MCP server", state: "ready" }],
          imports: { imported: 0, skipped: 0, conflicting: 0 },
        },
      });
    }),
  );

  it.effect("a previewed import reports a conflicting candidate and changes nothing", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
        settings: { agents: ["claude-code", "cursor"] },
      });
      cleanups.push(workspace.cleanup);
      writeNativeConfig(workspace, ".mcp.json", { command: "node", args: ["one.js"] });
      writeNativeConfig(workspace, ".cursor/mcp.json", { command: "node", args: ["two.js"] });
      const before = snapshotProtectedState(workspace.root);

      yield* handleMcpsImport({ preview: true }).pipe(Effect.provide(workspace.layer));

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "blocked",
          planName: "Import MCP servers",
          blocking: { class: "precondition-unmet", subject: "demo", causeCode: "conflict" },
          counts: { committed: 0, blocked: 1 },
          units: [{ label: "demo", state: "blocked" }],
          imports: { imported: 0, skipped: 0, conflicting: 1 },
        },
      });
    }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["mcps", "import"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["mcps", "import"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["mcps", "import"], "-y")).toBe("unrecognized");
    }),
  );
});
