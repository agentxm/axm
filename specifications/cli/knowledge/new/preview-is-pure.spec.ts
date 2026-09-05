import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleKnowledgeNew } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/knowledge/new/preview-is-pure",
  title: "Knowledge new preview describes the scaffold without creating any state",
  statement:
    "When knowledge new runs in preview mode for a bundle name the workspace does not yet author, it shall report the bundle it would create with a previewed outcome and shall not write the authored package, settings, or any other workspace state.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  methods: ["example"],
  derivedFrom: ["cli/skills/new/scaffolds-for-every-configured-agent"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Knowledge new preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const newBundle = (name: string, preview: boolean) =>
    handleKnowledgeNew({ name, owner: Option.none(), description: Option.none(), preview });

  it.effect("a previewed scaffold of a new bundle changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        recordWrites: true,
      });
      cleanups.push(workspace.cleanup);
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* newBundle("platform", true).pipe(Effect.provide(workspace.layer));

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.exists("knowledge/platform")).toBe(false);
      expect(workspace.readSettings()).not.toMatchObject({ knowledge: expect.anything() });
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          units: [expect.objectContaining({ label: "@acme/knowledge/platform", state: "ready" })],
        },
      });
    }),
  );

  it.effect(
    "a previewed scaffold of an already authored bundle reports the conflict and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          recordWrites: true,
        });
        cleanups.push(workspace.cleanup);
        yield* newBundle("platform", false).pipe(Effect.provide(workspace.layer));
        expect(workspace.exists("knowledge/platform/knowledge.json")).toBe(true);
        const before = snapshotProtectedState(workspace.root);
        workspace.writes.splice(0);

        const failure = yield* newBundle("platform", true).pipe(
          Effect.provide(workspace.layer),
          Effect.flip,
        );

        expect(getAppError(failure)._tag).toBe("AppError");
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
      expect(yield* probeFlag(["knowledge", "new"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["knowledge", "new"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["knowledge", "new"], "-y")).toBe("unrecognized");
    }),
  );
});
