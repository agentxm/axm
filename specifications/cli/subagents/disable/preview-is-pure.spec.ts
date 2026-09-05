import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleDisableSubagent, handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { writeLocalSubagentPackage } from "../../../support/extension-fixtures.js";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/subagents/disable/preview-is-pure",
  title: "Subagent disable preview describes the deactivation without changing any state",
  statement:
    "When subagents disable runs in preview mode against an enabled subagent, it shall report the deactivation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/skills/disable/preview-is-pure", "cli/activation-follows-desired-state"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Subagent disable preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A workspace with one installed, enabled local subagent rendered for Claude Code. */
  const installedWorkspace = () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
      });
      cleanups.push(workspace.cleanup);
      const packageRoot = writeLocalSubagentPackage(workspace.root, { name: "reviewer" });
      yield* handleInstall({ source: Option.some(packageRoot), force: false, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      expect(workspace.exists(".claude/agents/reviewer.md")).toBe(true);
      return workspace;
    });

  it.effect("a previewed disable of an enabled subagent changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* installedWorkspace();
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* handleDisableSubagent({ name: "reviewer", preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({ root: workspace.root, before, writes: workspace.writes });
      expect(workspace.exists(".claude/agents/reviewer.md")).toBe(true);
      expect(JSON.stringify(workspace.readSettings())).not.toContain('"enabled":false');
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          units: [expect.objectContaining({ label: "reviewer", state: "ready" })],
        },
      });
    }),
  );

  it.effect(
    "a previewed disable of a subagent that is not installed is refused and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = yield* installedWorkspace();
        const before = snapshotProtectedState(workspace.root);
        workspace.writes.splice(0);

        const error = yield* handleDisableSubagent({ name: "planner", preview: true }).pipe(
          Effect.provide(workspace.layer),
          Effect.flip,
        );

        expect(getAppError(error).code).toBe("not_found");
        expectProtectedStateUntouched({ root: workspace.root, before, writes: workspace.writes });
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["subagents", "disable"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["subagents", "disable"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["subagents", "disable"], "-y")).toBe("unrecognized");
    }),
  );
});
