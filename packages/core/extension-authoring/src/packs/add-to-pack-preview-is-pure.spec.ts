import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-operations";

import {
  applyExecution,
  authoringWorkspaceEnvironment,
  previewExecution,
  type AuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import { makePackWorkspace } from "../test-support/pack-membership.js";
import { ChangePackMembership } from "./change-pack-membership.js";

export const specification = defineSpecification({
  requirement: "cli/packs/add/preview-is-pure",
  title: "Pack add preview describes the dependency without changing any state",
  statement:
    "When packs add runs in preview mode against an installed extension, it shall report the dependency it would record with a previewed outcome and shall not change the pack manifest, settings, the lockfile, or any installed content.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "Purity is a property of the membership use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write that could have happened.",
  derivedFrom: ["cli/packs/add/records-member-as-pack-dependency"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Pack add preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** A workspace with one acquired Registry skill and one empty authored pack. */
  const authoredPackWorkspace = () => {
    const { created, seed } = makePackWorkspace({
      pack: "toolkit",
      members: [{ type: "skill", name: "member-skill", version: "1.0.0", source: "registry" }],
    });
    cleanups.push(created.cleanup);
    return { created, seed };
  };

  const membership = (created: AuthoringWorkspace, selector: string, mode: "preview" | "apply") => {
    const environment = authoringWorkspaceEnvironment(created);
    return {
      environment,
      run: Effect.gen(function* () {
        const candidate = yield* ChangePackMembership.prepare({
          change: "add",
          pack: "toolkit",
          selector,
        });
        if (candidate._tag === "NoChange") return candidate;
        return yield* ChangePackMembership.previewOrApply(
          candidate,
          mode === "preview" ? previewExecution : applyExecution,
        );
      }).pipe(Effect.provide(environment.layer)),
    };
  };

  it.effect("a previewed add of an installed extension changes no protected state", () =>
    Effect.gen(function* () {
      const { created, seed } = authoredPackWorkspace();
      yield* seed;
      const before = created.snapshot();
      const { environment, run } = membership(created, "@acme/skills/member-skill", "preview");

      const resolution = yield* run;

      if (resolution._tag === "NoChange") throw new Error("Expected a membership change");
      expect(deriveOperationOutcome(resolution)).toBe("previewed");
      expect(resolution.units).toEqual([expect.objectContaining({ state: "ready" })]);
      expect(created.snapshot()).toEqual(before);
      expect(environment.interaction.confirmApplyChangesCalls).toEqual([]);
    }),
  );

  it.effect(
    "a previewed add of an extension that is not installed reports the failure and changes nothing",
    () =>
      Effect.gen(function* () {
        const { created, seed } = authoredPackWorkspace();
        yield* seed;
        const before = created.snapshot();
        const { environment, run } = membership(created, "@acme/skills/absent-skill", "preview");

        const failure = yield* run.pipe(Effect.flip);

        expect(failure).toMatchObject({
          _tag: "PackMemberNotFound",
          selector: "@acme/skills/absent-skill",
        });
        expect(created.snapshot()).toEqual(before);
        expect(environment.interaction.confirmApplyChangesCalls).toEqual([]);
      }),
  );

  it.effect("an already-matching dependency is settled with no change and no writes", () =>
    Effect.gen(function* () {
      const { created, seed } = authoredPackWorkspace();
      yield* seed;
      yield* membership(created, "@acme/skills/member-skill", "apply").run;
      const before = created.snapshot();
      const { environment, run } = membership(created, "@acme/skills/member-skill", "preview");

      const outcome = yield* run;

      expect(outcome).toMatchObject({ _tag: "NoChange", change: "add", pack: "toolkit" });
      expect(created.snapshot()).toEqual(before);
      expect(environment.interaction.confirmApplyChangesCalls).toEqual([]);
    }),
  );
});
