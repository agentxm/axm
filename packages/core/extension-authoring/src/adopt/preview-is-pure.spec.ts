import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { deriveOperationOutcome } from "@agentxm/workspace-operations";

import {
  authoringWorkspaceEnvironment,
  makeAuthoringWorkspace,
  previewExecution,
  type AuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import { authoringTypeFor, writeAuthoringPackage } from "../test-support/authoring-packages.js";
import { AdoptExtension } from "./adopt-extension.js";

export const specification = defineSpecification({
  requirement: "cli/adopt/preview-is-pure",
  title: "Adopt preview describes the authorship transition without changing any state",
  statement:
    "When adopt runs in preview mode against a canonical package the workspace could author, or an undeclared authored package it could declare in place, it shall report the adoption it would apply with a previewed outcome and shall not move the package, create authored content, realize projections, or change settings or the lockfile.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "Purity is a property of the adoption use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write — and every move — that could have happened.",
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Adopt preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** A canonical package the workspace acquired and nothing configures yet. */
  const adoptableWorkspace = () => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
    cleanups.push(created.cleanup);
    writeAuthoringPackage(created.root, authoringTypeFor("skill"), "review", {
      parent: "agent_extensions/agentxm/@acme/skills",
    });
    return { created, before: created.snapshot() };
  };

  const previewAdoption = (target: AuthoringWorkspace, fqn: string) => {
    const environment = authoringWorkspaceEnvironment(target);
    return {
      environment,
      run: Effect.gen(function* () {
        const candidate = yield* AdoptExtension.prepare({ fqn, nonInteractive: true });
        return yield* AdoptExtension.previewOrApply(candidate, previewExecution);
      }).pipe(Effect.provide(environment.layer)),
    };
  };

  it.effect("a previewed adoption changes no protected state", () =>
    Effect.gen(function* () {
      const { created, before } = adoptableWorkspace();
      const { environment, run } = previewAdoption(created, "@acme/skills/review");

      const resolution = yield* run;

      expect(deriveOperationOutcome(resolution)).toBe("previewed");
      expect(resolution.units).toEqual([
        expect.objectContaining({ label: "Adopt @acme/skills/review", state: "ready" }),
      ]);
      expect(created.snapshot()).toEqual(before);
      expect(created.exists("skills/review")).toBe(false);
      expect(created.exists("agent_extensions/agentxm/@acme/skills/review/skill.json")).toBe(true);
      expect(environment.interaction.confirmApplyChangesCalls).toEqual([]);
    }),
  );

  it.effect("a previewed in-place adoption changes no protected state", () =>
    Effect.gen(function* () {
      const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
      cleanups.push(created.cleanup);
      writeAuthoringPackage(created.root, authoringTypeFor("skill"), "review", {
        parent: "skills",
      });
      const before = created.snapshot();
      const { environment, run } = previewAdoption(created, "@acme/skills/review");

      const resolution = yield* run;

      expect(deriveOperationOutcome(resolution)).toBe("previewed");
      expect(resolution.units).toEqual([
        expect.objectContaining({ label: "Adopt @acme/skills/review", state: "ready" }),
      ]);
      expect(created.snapshot()).toEqual(before);
      expect(created.exists(".claude/skills/review")).toBe(false);
      expect(environment.interaction.confirmApplyChangesCalls).toEqual([]);
    }),
  );

  it.effect(
    "a previewed adoption under a foreign owner reports the conflict and changes nothing",
    () =>
      Effect.gen(function* () {
        const { created, before } = adoptableWorkspace();
        const { environment, run } = previewAdoption(created, "@other/skills/review");

        const failure = yield* run.pipe(Effect.flip);

        expect(failure).toMatchObject({
          _tag: "AuthoringOwnerMismatch",
          requested: "@other",
          configured: "@acme",
        });
        expect(created.snapshot()).toEqual(before);
        expect(environment.interaction.confirmApplyChangesCalls).toEqual([]);
      }),
  );
});
