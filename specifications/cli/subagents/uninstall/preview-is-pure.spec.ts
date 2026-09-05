import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall, handleSubagentsUninstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { writeLocalSubagentPackage } from "../../../support/extension-fixtures.js";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/subagents/uninstall/preview-is-pure",
  title: "Subagent uninstall preview describes the removal without changing any state",
  statement:
    "When subagents uninstall runs in preview mode against an installed subagent, it shall report the removal it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [
    "cli/skills/uninstall/preview-is-pure",
    "packages/cli/src/root/subagents/uninstall/handler.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Subagent uninstall preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A workspace with one installed local subagent rendered for Claude Code. */
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

  it.effect("a previewed uninstall of an installed subagent changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* installedWorkspace();
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* handleSubagentsUninstall({ subagent: "reviewer" }, { preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({ root: workspace.root, before, writes: workspace.writes });
      expect(workspace.exists(".claude/agents/reviewer.md")).toBe(true);
      expect(workspace.readLockfileText()).toContain("reviewer");
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
    "a previewed uninstall matching no installed subagent reports nothing to do and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = yield* installedWorkspace();
        const before = snapshotProtectedState(workspace.root);
        workspace.writes.splice(0);
        workspace.rendererState.results.splice(0);

        yield* handleSubagentsUninstall({ subagent: "planner-*" }, { preview: true }).pipe(
          Effect.provide(workspace.layer),
        );

        expectProtectedStateUntouched({ root: workspace.root, before, writes: workspace.writes });
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
        const [entry] = workspace.rendererState.results;
        expect(entry?.data).toMatchObject({ result: { outcome: "no-op" } });
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["subagents", "uninstall"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["subagents", "uninstall"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["subagents", "uninstall"], "-y")).toBe("unrecognized");
    }),
  );
});
