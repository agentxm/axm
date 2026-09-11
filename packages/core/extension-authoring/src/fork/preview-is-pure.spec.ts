import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
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
import { ForkExtension } from "./fork-extension.js";

export const specification = defineSpecification({
  requirement: "cli/fork/preview-is-pure",
  title: "Fork preview describes the new authored package without changing any state",
  statement:
    "When fork runs in preview mode against a resolvable source package, it shall report the authored package it would create with a previewed outcome and shall not create authored content or change settings, the lockfile, or the source package.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "Purity is a property of the fork use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write that could have happened.",
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Fork preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const forkableWorkspace = () => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
    cleanups.push(created.cleanup);
    const source = writeAuthoringPackage(created.root, authoringTypeFor("skill"), "code-review");
    return { created, source, before: created.snapshot() };
  };

  const previewFork = (target: AuthoringWorkspace, source: string, fqn: string) => {
    const environment = authoringWorkspaceEnvironment(target);
    return {
      environment,
      run: Effect.gen(function* () {
        const candidate = yield* ForkExtension.prepare({
          source,
          target: fqn,
          from: Option.none(),
          enable: false,
          nonInteractive: true,
        });
        return yield* ForkExtension.previewOrApply(candidate, previewExecution);
      }).pipe(Effect.scoped, Effect.provide(environment.layer)),
    };
  };

  it.effect("a previewed fork changes no protected state", () =>
    Effect.gen(function* () {
      const { created, source, before } = forkableWorkspace();
      const { environment, run } = previewFork(created, source, "@acme/skills/code-review-fork");

      const resolution = yield* run;

      expect(deriveOperationOutcome(resolution)).toBe("previewed");
      expect(resolution.units).toEqual([
        expect.objectContaining({
          label: "Fork @acme/skills/code-review -> @acme/skills/code-review-fork",
          state: "ready",
        }),
      ]);
      expect(created.snapshot()).toEqual(before);
      expect(created.exists("skills/code-review-fork")).toBe(false);
      expect(environment.interaction.confirmApplyChangesCalls).toEqual([]);
    }),
  );

  it.effect("a previewed fork under a foreign owner reports the conflict and changes nothing", () =>
    Effect.gen(function* () {
      const { created, source, before } = forkableWorkspace();
      const { environment, run } = previewFork(created, source, "@other/skills/code-review-fork");

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
