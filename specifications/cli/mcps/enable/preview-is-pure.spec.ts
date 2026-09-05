import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  expectNoOpPlanResult,
  handleDisableMcpServer,
  handleEnableMcpServer,
  handleMcpsAdd,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/mcps/enable/preview-is-pure",
  title: "MCP server enable preview describes the activation without changing any state",
  statement:
    "When mcps enable runs in preview mode against a disabled MCP server, it shall report the activation it would apply with a previewed outcome and shall not change settings, the lockfile, or agent MCP configuration.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/mcps/inline-lifecycle-is-idempotent", "cli/skills/enable/preview-is-pure"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("MCP server enable preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const disabledWorkspace = () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
      });
      cleanups.push(workspace.cleanup);
      yield* handleMcpsAdd({
        name: "demo",
        command: Option.some("node server.js"),
        url: Option.none(),
        env: [],
        header: [],
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      yield* handleDisableMcpServer({ name: "demo", preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      expect(workspace.readSettings()).toMatchObject({ mcpServers: { demo: { enabled: false } } });
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);
      return workspace;
    });

  it.effect("a previewed enable of a disabled MCP server changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* disabledWorkspace();
      const before = snapshotProtectedState(workspace.root);

      yield* handleEnableMcpServer({ name: "demo", preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.readSettings()).toMatchObject({ mcpServers: { demo: { enabled: false } } });
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          planName: "Enable MCP server",
          units: [{ label: "demo", state: "ready" }],
        },
      });
    }),
  );

  it.effect("a previewed enable of an unconfigured name reports nothing to do", () =>
    Effect.gen(function* () {
      const workspace = yield* disabledWorkspace();
      const before = snapshotProtectedState(workspace.root);

      yield* handleEnableMcpServer({ name: "missing", preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      expectNoOpPlanResult(workspace.rendererState.results[0]?.data, {
        planName: "Enable MCP server",
        message: 'MCP server "missing" is not configured',
      });
    }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["mcps", "enable"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["mcps", "enable"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["mcps", "enable"], "-y")).toBe("unrecognized");
    }),
  );
});
