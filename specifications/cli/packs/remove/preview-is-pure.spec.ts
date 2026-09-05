import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  extensionName,
  getAppError,
  handleInstall,
  handlePacksAdd,
  handlePacksNew,
  handlePacksRemove,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { probeFlag } from "../../../support/parser-probe.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../../support/preview-purity.js";
import { makeSpecRegistry } from "../../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/packs/remove/preview-is-pure",
  title: "Pack remove preview describes the departing member without changing the manifest",
  statement:
    "When packs remove runs in preview mode for a member of a workspace-authored pack, it shall report the dependency it would remove with a previewed outcome and shall not change the pack manifest, settings, the lockfile, or any other workspace state.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  methods: ["example"],
  derivedFrom: ["cli/packs/add/records-member-as-pack-dependency"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Pack remove preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A workspace whose authored pack already records one installed Registry skill. */
  const packWithMemberWorkspace = Effect.gen(function* () {
    const registry = makeSpecRegistry();
    cleanups.push(registry.cleanup);
    registry.writeSkill("member-skill", [{ version: "1.0.0", body: "Member guidance." }]);
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      recordWrites: true,
      settings: { sources: [registry.source] },
    });
    cleanups.push(workspace.cleanup);
    yield* handleInstall({
      source: Option.some("@acme/skills/member-skill"),
      force: false,
      preview: false,
    }).pipe(Effect.provide(workspace.layer));
    yield* handlePacksNew({
      name: extensionName("toolkit"),
      owner: Option.none(),
      preview: false,
    }).pipe(Effect.provide(workspace.layer));
    yield* handlePacksAdd({
      pack: "toolkit",
      extension: "@acme/skills/member-skill",
      preview: false,
    }).pipe(Effect.provide(workspace.layer));
    expect(workspace.readFile("packs/toolkit/pack.json")).toContain("@acme/skills/member-skill");
    return workspace;
  });

  it.effect("a previewed remove of a recorded member changes no protected state", () =>
    Effect.gen(function* () {
      const workspace = yield* packWithMemberWorkspace;
      const manifestBefore = workspace.readFile("packs/toolkit/pack.json");
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);

      yield* handlePacksRemove({
        pack: "toolkit",
        extension: "@acme/skills/member-skill",
        preview: true,
      }).pipe(Effect.provide(workspace.layer));

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
      });
      expect(workspace.readFile("packs/toolkit/pack.json")).toBe(manifestBefore);
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
    "a previewed remove that matches no member reports the failure and changes nothing",
    () =>
      Effect.gen(function* () {
        const workspace = yield* packWithMemberWorkspace;
        const before = snapshotProtectedState(workspace.root);
        workspace.writes.splice(0);

        const failure = yield* handlePacksRemove({
          pack: "toolkit",
          extension: "@acme/skills/absent-*",
          preview: true,
        }).pipe(Effect.provide(workspace.layer), Effect.flip);

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
      expect(yield* probeFlag(["packs", "remove"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["packs", "remove"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["packs", "remove"], "-y")).toBe("unrecognized");
    }),
  );
});
