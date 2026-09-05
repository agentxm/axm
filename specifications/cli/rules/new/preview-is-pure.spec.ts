import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleRulesNew } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/rules/new/preview-is-pure",
  title: "New rule preview describes the scaffold without changing any state",
  statement:
    "When rules new runs in preview mode for a name that is not yet authored, it shall report the package it would create with a previewed outcome and shall not change settings, the authored source root, or agent instruction files.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  methods: ["example"],
  derivedFrom: ["cli/hooks/new/preview-is-pure"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("New rule preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const previewNew = (
    workspace: ReturnType<typeof makeSpecWorkspace>,
    owner: Option.Option<string>,
  ) =>
    handleRulesNew({
      name: "commit-style",
      owner,
      title: Option.none(),
      preview: true,
    }).pipe(Effect.provide(workspace.layer));

  it.effect("a previewed scaffold changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
      });
      cleanups.push(workspace.cleanup);
      const before = snapshotProtectedState(workspace.root);

      yield* previewNew(workspace, Option.none());

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.exists("rules")).toBe(false);
      expect(workspace.exists("AGENTS.md")).toBe(false);
      expect(JSON.stringify(workspace.readSettings())).not.toContain("commit-style");
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          planName: "New rule",
          units: [{ label: "@acme/rules/commit-style", state: "ready" }],
        },
      });
    }),
  );

  it.effect(
    "a previewed scaffold under a foreign owner reports the conflict and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          recordWrites: true,
        });
        cleanups.push(workspace.cleanup);
        const before = snapshotProtectedState(workspace.root);

        const failure = yield* previewNew(workspace, Option.some("@other")).pipe(Effect.flip);

        expect(getAppError(failure).detail).toContain("does not match workspace owner");
        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
        });
        expect(workspace.exists("rules")).toBe(false);
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["rules", "new"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["rules", "new"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["rules", "new"], "-y")).toBe("unrecognized");
    }),
  );
});
