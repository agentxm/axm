import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { countUnitStates, deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ExtensionLifecycleFailed } from "../errors.js";
import { applyInstall, installRequest, readSettings } from "../install/test-helpers.js";
import { makePackWorld, previewUnpack, type PackWorld } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/packs/unpack/preview-is-pure",
  title: "Pack unpack preview describes the promotions without changing any state",
  statement:
    "When packs unpack runs in preview mode against an installed pack, it shall report the members it would promote to direct entries and the pack it would remove with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections; and when the named pack is not configured it shall report that and change nothing.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/install/preview-is-pure"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

// Route flag grammar (`--preview` accepted, `--yes` unrecognized) is owned by
// cli/preview-uses-the-canonical-flag and
// cli/confirmation-flags-have-a-supported-purpose, which sweep every route
// from the command-route allocation.

const PACK = "toolkit";
const MEMBER = "member-skill";

describe("Pack unpack preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A workspace with one Registry pack and its member skill installed. */
  const installedPack = (world: PackWorld) =>
    Effect.gen(function* () {
      world.registry.writeSkill(MEMBER, [{ version: "1.0.0", body: "Member guidance." }]);
      world.registry.writePack(PACK, [
        { version: "1.0.0", dependencies: { [`@acme/skills/${MEMBER}`]: "^1.0.0" } },
      ]);
      yield* applyInstall(
        installRequest({
          type: "pack",
          subject: { kind: "source", source: `@acme/packs/${PACK}` },
        }),
      );
      expect(readSettings(world.workspace)).toMatchObject({
        packs: { [PACK]: expect.anything() },
      });
    });

  it.effect("a previewed unpack of an installed pack changes no protected state", () => {
    const world = makePackWorld(cleanups);
    return world.workspace
      .provide(
        Effect.gen(function* () {
          yield* installedPack(world);
          const settingsBefore = JSON.stringify(readSettings(world.workspace));
          const before = world.workspace.snapshot();

          const resolution = yield* previewUnpack({ name: PACK });

          expect(deriveOperationOutcome(resolution)).toBe("previewed");
          expect(countUnitStates(resolution.units).committed).toBe(0);
          expect(resolution.units).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                label: expect.stringContaining(PACK),
                state: "ready",
              }),
            ]),
          );
          expect(world.workspace.snapshot()).toEqual(before);
          expect(JSON.stringify(readSettings(world.workspace))).toBe(settingsBefore);
          expect(world.workspace.readFile("axm-lock.yaml")).toContain(PACK);
          expect(world.workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "a previewed unpack of an unconfigured pack reports the failure and changes nothing",
    () => {
      const world = makePackWorld(cleanups);
      return world.workspace
        .provide(
          Effect.gen(function* () {
            yield* installedPack(world);
            const before = world.workspace.snapshot();

            const failure = yield* previewUnpack({ name: "absent-pack" }).pipe(Effect.flip);

            expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
            if (failure instanceof ExtensionLifecycleFailed) {
              expect(failure.category).toBe("not_found");
              expect(failure.detail).toContain("absent-pack");
            }
            expect(world.workspace.snapshot()).toEqual(before);
            expect(world.workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
