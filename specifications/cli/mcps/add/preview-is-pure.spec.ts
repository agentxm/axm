import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleMcpsAdd } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/add/preview-is-pure",
  title: "Inline MCP server add preview describes the configuration without changing any state",
  statement:
    "When mcps add runs in preview mode with a new inline server definition, it shall report the configuration and agent realization it would apply with a previewed outcome and shall not change settings, the lockfile, or agent MCP configuration.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/mcps/add/records-and-realizes-inline-configuration"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Inline MCP server add preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const addDemo = (
    workspace: ReturnType<typeof makeSpecWorkspace>,
    command: Option.Option<string>,
  ) =>
    handleMcpsAdd({
      name: "demo",
      command,
      url: Option.none(),
      env: [],
      header: [],
      force: false,
      preview: true,
    }).pipe(Effect.provide(workspace.layer));

  it.effect("a previewed add of a new inline server changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
      });
      cleanups.push(workspace.cleanup);
      const before = snapshotProtectedState(workspace.root);

      yield* addDemo(workspace, Option.some("node server.js"));

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.exists(".mcp.json")).toBe(false);
      expect(JSON.stringify(workspace.readSettings())).not.toContain("demo");
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          planName: "Add MCP server",
          units: [
            { label: "Configure demo", state: "ready" },
            { label: "Sync demo to configured agents", state: "ready" },
          ],
        },
      });
    }),
  );

  it.effect("a previewed add without a transport reports the usage error and changes nothing", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
      });
      cleanups.push(workspace.cleanup);
      const before = snapshotProtectedState(workspace.root);

      const failure = yield* addDemo(workspace, Option.none()).pipe(Effect.flip);

      expect(getAppError(failure).detail).toContain("only configures inline MCP servers");
      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
    }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["mcps", "add"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["mcps", "add"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["mcps", "add"], "-y")).toBe("unrecognized");
    }),
  );
});
