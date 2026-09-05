import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  getAppError,
  handleKnowledgeInstall,
  setKnowledgeEnabled,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { writeLocalKnowledgePackage } from "../../../support/extension-fixtures.js";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/disable/preview-is-pure",
  title: "Knowledge disable preview describes the exclusion without changing any state",
  statement:
    "When knowledge disable runs in preview mode against an enabled Knowledge bundle, it shall report the exclusion it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/skills/enable/preview-is-pure"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Knowledge disable preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const enabledWorkspace = Effect.gen(function* () {
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      recordWrites: true,
    });
    cleanups.push(workspace.cleanup);
    const packageRoot = writeLocalKnowledgePackage(workspace.root, { name: "platform" });
    yield* handleKnowledgeInstall({ source: Option.some(packageRoot), preview: false }).pipe(
      Effect.provide(workspace.layer),
    );
    expect(workspace.readLockfileText()).toContain("platform");
    return workspace;
  });

  it.effect("a previewed disable of an enabled bundle changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* enabledWorkspace;
      const settingsBefore = JSON.stringify(workspace.readSettings());
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* setKnowledgeEnabled("platform", false, true).pipe(Effect.provide(workspace.layer));

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(JSON.stringify(workspace.readSettings())).toBe(settingsBefore);
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          units: [expect.objectContaining({ label: "platform", state: "ready" })],
        },
      });
    }),
  );

  it.effect(
    "a previewed disable of an unconfigured bundle reports the failure and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = yield* enabledWorkspace;
        const before = snapshotProtectedState(workspace.root);
        workspace.writes.splice(0);

        const failure = yield* setKnowledgeEnabled("absent-bundle", false, true).pipe(
          Effect.provide(workspace.layer),
          Effect.flip,
        );

        expect(getAppError(failure).code).toBe("not_found");
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
      expect(yield* probeFlag(["knowledge", "disable"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["knowledge", "disable"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["knowledge", "disable"], "-y")).toBe("unrecognized");
    }),
  );
});
