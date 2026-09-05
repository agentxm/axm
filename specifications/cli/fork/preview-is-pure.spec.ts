import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleFork } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";
import { probeFlag } from "../../support/parser-probe.js";
import {
  WORKSPACE_PROTECTED_STATE,
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/fork/preview-is-pure",
  title: "Fork preview describes the new authored package without changing any state",
  statement:
    "When fork runs in preview mode against a resolvable source package, it shall report the authored package it would create with a previewed outcome and shall not create authored content or change settings, the lockfile, or the source package.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** Fork protects the workspace and the source package it copies from. */
const protectedPaths = [...WORKSPACE_PROTECTED_STATE, "vendor"];

describe("Fork preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const forkableWorkspace = () => {
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      recordWrites: true,
      settings: { owner: "@acme" },
    });
    cleanups.push(workspace.cleanup);
    const source = writeLocalSkillPackage(workspace.root, { name: "code-review" });
    const before = snapshotProtectedState(workspace.root, protectedPaths);
    workspace.writes.splice(0);
    workspace.rendererState.results.splice(0);
    return { workspace, source, before };
  };

  it.effect("a previewed fork changes no protected state", () =>
    Effect.gen(function* () {
      const { workspace, source, before } = forkableWorkspace();

      yield* handleFork({
        source,
        target: "@acme/skills/code-review-fork",
        from: Option.none(),
        enable: false,
        preview: true,
      }).pipe(Effect.scoped, Effect.provide(workspace.layer));

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
        protectedPaths,
      });
      expect(workspace.exists("skills/code-review-fork")).toBe(false);
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: { outcome: "previewed", counts: { total: 1, committed: 0 } },
      });
    }),
  );

  it.effect("a previewed fork under a foreign owner reports the conflict and changes nothing", () =>
    Effect.gen(function* () {
      const { workspace, source, before } = forkableWorkspace();

      const failure = yield* handleFork({
        source,
        target: "@other/skills/code-review-fork",
        from: Option.none(),
        enable: false,
        preview: true,
      }).pipe(Effect.scoped, Effect.provide(workspace.layer), Effect.flip);

      expect(getAppError(failure).code).toBe("conflict");
      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
        protectedPaths,
      });
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
    }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["fork"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["fork"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["fork"], "-y")).toBe("unrecognized");
    }),
  );
});
