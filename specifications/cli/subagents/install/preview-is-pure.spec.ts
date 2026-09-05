import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleSubagentsInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { writeLocalSubagentPackage } from "../../../support/extension-fixtures.js";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/subagents/install/preview-is-pure",
  title: "Subagent install preview describes the acquisition without changing any state",
  statement:
    "When subagents install runs in preview mode against an installable source, it shall report the subagents it would install with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/install/preview-is-pure", "cli/skills/install/preview-is-pure"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Subagent install preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const workspace = () => {
    const created = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      recordWrites: true,
    });
    cleanups.push(created.cleanup);
    return created;
  };

  it.effect("a previewed install from a local package changes no protected state", () =>
    Effect.gen(function* () {
      const created = workspace();
      const packageRoot = writeLocalSubagentPackage(created.root, { name: "reviewer" });
      const before = snapshotProtectedState(created.root);
      created.writes.splice(0);
      created.rendererState.results.splice(0);

      yield* handleSubagentsInstall(
        { source: Option.some(packageRoot), subagents: [], all: false },
        { force: false, preview: true },
      ).pipe(Effect.provide(created.layer));

      expectProtectedStateUntouched({ root: created.root, before, writes: created.writes });
      expect(created.exists(".claude/agents/reviewer.md")).toBe(false);
      expect(created.readLockfileText()).not.toContain("reviewer");
      expect(created.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = created.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: { outcome: "previewed", units: [expect.objectContaining({ state: "ready" })] },
      });
    }),
  );

  it.effect(
    "a previewed install with an unusable request reports the problem and changes nothing",
    () =>
      Effect.gen(function* () {
        const created = workspace();
        const before = snapshotProtectedState(created.root);
        created.writes.splice(0);

        const error = yield* handleSubagentsInstall(
          { source: Option.none(), subagents: [], all: true },
          { force: false, preview: true },
        ).pipe(Effect.provide(created.layer), Effect.flip);

        expect(getAppError(error).code).toBe("usage");
        expect(getAppError(error).detail).toContain("--all");
        expectProtectedStateUntouched({ root: created.root, before, writes: created.writes });
        expect(created.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["subagents", "install"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["subagents", "install"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["subagents", "install"], "-y")).toBe("unrecognized");
    }),
  );
});
