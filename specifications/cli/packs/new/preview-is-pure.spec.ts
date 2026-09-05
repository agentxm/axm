import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { extensionName, getAppError, handlePacksNew } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/packs/new/preview-is-pure",
  title: "Pack new preview describes the scaffold without creating any state",
  statement:
    "When packs new runs in preview mode for a pack name the workspace does not yet author, it shall report the pack it would create with a previewed outcome and shall not write the authored package, settings, or any other workspace state.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  methods: ["example"],
  derivedFrom: ["cli/packs/new/records-workspace-authorship"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Pack new preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const newPack = (preview: boolean) =>
    handlePacksNew({ name: extensionName("toolkit"), owner: Option.none(), preview });

  it.effect("a previewed scaffold of a new pack changes no protected state", () =>
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

      yield* newPack(true).pipe(Effect.provide(workspace.layer));

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.exists("packs/toolkit")).toBe(false);
      expect(workspace.readSettings()).not.toMatchObject({ packs: expect.anything() });
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          units: [expect.objectContaining({ state: "ready" })],
        },
      });
    }),
  );

  it.effect(
    "a previewed scaffold of an already authored pack reports the conflict and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          recordWrites: true,
        });
        cleanups.push(workspace.cleanup);
        yield* newPack(false).pipe(Effect.provide(workspace.layer));
        expect(workspace.exists("packs/toolkit/pack.json")).toBe(true);
        const before = snapshotProtectedState(workspace.root);
        workspace.writes.splice(0);

        const failure = yield* newPack(true).pipe(Effect.provide(workspace.layer), Effect.flip);

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
      expect(yield* probeFlag(["packs", "new"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["packs", "new"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["packs", "new"], "-y")).toBe("unrecognized");
    }),
  );
});
