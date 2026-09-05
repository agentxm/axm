import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  extensionName,
  getAppError,
  handlePackActivation,
  handlePacksNew,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";

export const specification = defineSpecification({
  requirement: "cli/packs/enable/preview-is-pure",
  title: "Pack enable preview describes the activation without changing any state",
  statement:
    "When packs enable runs in preview mode against a disabled pack, it shall report the activation it would apply with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/skills/enable/preview-is-pure"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Pack enable preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const disabledPackWorkspace = Effect.gen(function* () {
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      recordWrites: true,
    });
    cleanups.push(workspace.cleanup);
    yield* handlePacksNew({
      name: extensionName("toolkit"),
      owner: Option.none(),
      preview: false,
    }).pipe(Effect.provide(workspace.layer));
    yield* handlePackActivation({ name: "toolkit", enabled: false, preview: false }).pipe(
      Effect.provide(workspace.layer),
    );
    expect(workspace.readSettings()).toMatchObject({
      packs: { toolkit: expect.objectContaining({ enabled: false }) },
    });
    return workspace;
  });

  it.effect("a previewed enable of a disabled pack changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* disabledPackWorkspace;
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* handlePackActivation({ name: "toolkit", enabled: true, preview: true }).pipe(
        Effect.provide(workspace.layer),
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.readSettings()).toMatchObject({
        packs: { toolkit: expect.objectContaining({ enabled: false }) },
      });
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
    "a previewed enable of an unconfigured pack reports the failure and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = yield* disabledPackWorkspace;
        const before = snapshotProtectedState(workspace.root);
        workspace.writes.splice(0);

        const failure = yield* handlePackActivation({
          name: "absent-pack",
          enabled: true,
          preview: true,
        }).pipe(Effect.provide(workspace.layer), Effect.flip);

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
      expect(yield* probeFlag(["packs", "enable"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["packs", "enable"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["packs", "enable"], "-y")).toBe("unrecognized");
    }),
  );
});
