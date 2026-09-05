import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleRootVersion } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import { probeFlag } from "../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../support/preview-purity.js";
import { writeAuthoredSkill } from "../../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/version/preview-is-pure",
  title: "Version preview describes the manifest bump without changing any state",
  statement:
    "When version runs in preview mode against a workspace-authored extension, it shall report the version it would record with a previewed outcome and shall not change the manifest, settings, the lockfile, or any other authored content.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Version preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const authoredWorkspace = () => {
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      recordWrites: true,
      settings: { owner: "@acme", skills: { review: "workspace" } },
    });
    cleanups.push(workspace.cleanup);
    writeAuthoredSkill(workspace.root, { name: "review", version: "1.0.0" });
    const before = snapshotProtectedState(workspace.root);
    workspace.writes.splice(0);
    workspace.rendererState.results.splice(0);
    return { workspace, before };
  };

  it.effect("a previewed bump reports the next version and changes no protected state", () =>
    Effect.gen(function* () {
      const { workspace, before } = authoredWorkspace();

      yield* handleRootVersion({
        handle: "@acme/skills/review",
        bump: "patch",
        targetVersion: Option.none(),
        preview: true,
      }).pipe(Effect.provide(workspace.layer));

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.readFile("skills/review/skill.json")).toContain('"version":"1.0.0"');
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          units: [{ label: "@acme/skills/review", state: "ready", message: "1.0.0 -> 1.0.1" }],
        },
      });
    }),
  );

  it.effect(
    "a previewed bump of a non-authored extension reports the conflict and changes nothing",
    () =>
      Effect.gen(function* () {
        const { workspace, before } = authoredWorkspace();

        const failure = yield* handleRootVersion({
          handle: "@acme/skills/missing",
          bump: "patch",
          targetVersion: Option.none(),
          preview: true,
        }).pipe(Effect.provide(workspace.layer), Effect.flip);

        expect(getAppError(failure).code).toBe("conflict");
        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
        });
      }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["version"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["version"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["version"], "-y")).toBe("unrecognized");
    }),
  );
});
