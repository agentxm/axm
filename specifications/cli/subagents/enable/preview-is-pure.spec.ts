import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  getAppError,
  handleDisableSubagent,
  handleEnableSubagent,
  handleInstall,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { writeLocalSubagentPackage } from "../../../support/extension-fixtures.js";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/subagents/enable/preview-is-pure",
  title: "Subagent enable preview describes the activation without changing any state",
  statement:
    "When subagents enable runs in preview mode against a disabled subagent, it shall report the activation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/skills/enable/preview-is-pure", "cli/activation-follows-desired-state"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Subagent enable preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A workspace with one installed local subagent that has since been disabled. */
  const disabledWorkspace = () =>
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
      yield* handleDisableSubagent({ name: "reviewer", preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      expect(workspace.exists(".claude/agents/reviewer.md")).toBe(false);
      return workspace;
    });

  it.effect("a previewed enable of a disabled subagent changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* disabledWorkspace();
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* handleEnableSubagent({ name: "reviewer", preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({ root: workspace.root, before, writes: workspace.writes });
      expect(workspace.exists(".claude/agents/reviewer.md")).toBe(false);
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
    "a previewed enable of a subagent that is not installed is refused and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = yield* disabledWorkspace();
        const before = snapshotProtectedState(workspace.root);
        workspace.writes.splice(0);

        const error = yield* handleEnableSubagent({ name: "planner", preview: true }).pipe(
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
      expect(yield* probeFlag(["subagents", "enable"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["subagents", "enable"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["subagents", "enable"], "-y")).toBe("unrecognized");
    }),
  );
});
