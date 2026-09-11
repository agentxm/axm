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
import { ChangeAuthoredVersion } from "./change-authored-version.js";

export const specification = defineSpecification({
  requirement: "cli/version/preview-is-pure",
  title: "Version preview describes the manifest bump without changing any state",
  statement:
    "When version runs in preview mode against a workspace-authored extension, it shall report the version it would record with a previewed outcome and shall not change the manifest, settings, the lockfile, or any other authored content.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "Purity is a property of the version use case: a preview resolves the same candidate an apply would and returns before the workspace transaction opens, so a real project directory observes every write that could have happened.",
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Version preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const authoredWorkspace = () => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
    cleanups.push(created.cleanup);
    created.writeSettings({ owner: "@acme", agents: [], skills: { review: "workspace" } });
    writeAuthoringPackage(created.root, authoringTypeFor("skill"), "review", {
      parent: "skills",
      version: "1.0.0",
    });
    return { created, before: created.snapshot() };
  };

  const previewBump = (created: AuthoringWorkspace, fqn: string) => {
    const environment = authoringWorkspaceEnvironment(created);
    return {
      environment,
      run: Effect.gen(function* () {
        const candidate = yield* ChangeAuthoredVersion.prepare({
          fqn,
          change: { _tag: "Increment", rule: "patch" },
        });
        return yield* ChangeAuthoredVersion.previewOrApply(candidate, previewExecution);
      }).pipe(Effect.provide(environment.layer)),
    };
  };

  it.effect("a previewed bump reports the next version and changes no protected state", () =>
    Effect.gen(function* () {
      const { created, before } = authoredWorkspace();
      const { environment, run } = previewBump(created, "@acme/skills/review");

      const resolution = yield* run;

      expect(deriveOperationOutcome(resolution)).toBe("previewed");
      expect(resolution.units).toEqual([
        expect.objectContaining({
          label: "@acme/skills/review",
          state: "ready",
          message: "1.0.0 -> 1.0.1",
        }),
      ]);
      expect(created.read("skills/review/skill.json")).toContain('"version": "1.0.0"');
      expect(created.snapshot()).toEqual(before);
      expect(environment.interaction.confirmApplyChangesCalls).toEqual([]);
    }),
  );

  it.effect(
    "a previewed bump of a non-authored extension reports the conflict and changes nothing",
    () =>
      Effect.gen(function* () {
        const { created, before } = authoredWorkspace();
        const { environment, run } = previewBump(created, "@acme/skills/missing");

        const failure = yield* run.pipe(Effect.flip);

        expect(failure).toMatchObject({
          _tag: "VersionTargetNotAuthored",
          fqn: "@acme/skills/missing",
        });
        expect(created.snapshot()).toEqual(before);
        expect(environment.interaction.confirmApplyChangesCalls).toEqual([]);
      }),
  );
});
