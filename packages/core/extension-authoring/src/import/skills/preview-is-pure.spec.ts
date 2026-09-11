import * as nodePath from "node:path";

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
} from "../../test-support/authoring-workspace.js";
import { ImportNativeExtension } from "../import-native-extension.js";

export const specification = defineSpecification({
  requirement: "cli/skills/import/preview-is-pure",
  title: "Skill import preview describes the conversion without changing any state",
  statement:
    "When skills import runs in preview mode against a native skill, it shall report the managed package it would create with a previewed outcome and shall not change settings, the lockfile, authored source, canonical content, agent projections, or the native source.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "authoring-and-creation"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "Purity is a property of the import use case: a preview stages the converted package into a temporary directory and returns before the workspace transaction opens, so a real project directory observes both that nothing under the workspace moved and that the native document is byte-identical.",
  derivedFrom: ["apps/cli-e2e/src/fork-import.e2e.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const SKILL = "native-review";
const NATIVE_DOCUMENT = `---\nname: ${SKILL}\ndescription: Review code\n---\n\nNative instructions.\n`;

describe("Skill import preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /** A project workspace authored by `@acme` holding one native Claude Code skill. */
  const workspaceWithNativeSkill = () => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
    cleanups.push(created.cleanup);
    created.write(`.claude/skills/${SKILL}/SKILL.md`, NATIVE_DOCUMENT);
    return {
      created,
      nativeDir: nodePath.join(created.root, ".claude", "skills", SKILL),
      before: created.snapshot(),
    };
  };

  const previewImport = (created: AuthoringWorkspace, source: string, target: string) => {
    const environment = authoringWorkspaceEnvironment(created);
    return {
      environment,
      run: Effect.gen(function* () {
        const candidate = yield* ImportNativeExtension.prepare({
          type: "skill",
          source,
          target,
          enable: false,
        });
        return yield* ImportNativeExtension.previewOrApply(candidate, previewExecution);
      }).pipe(Effect.scoped, Effect.provide(environment.layer)),
    };
  };

  it.effect("a previewed import of a native skill changes no protected state", () =>
    Effect.gen(function* () {
      const { created, nativeDir, before } = workspaceWithNativeSkill();
      const { environment, run } = previewImport(created, nativeDir, `@acme/skills/${SKILL}`);

      const resolution = yield* run;

      expect(deriveOperationOutcome(resolution)).toBe("previewed");
      expect(resolution.units).toEqual([
        expect.objectContaining({
          label: expect.stringContaining(`@acme/skills/${SKILL}`),
          state: "ready",
        }),
      ]);
      expect(created.snapshot()).toEqual(before);
      expect(created.exists(`skills/${SKILL}`)).toBe(false);
      expect(created.read(`.claude/skills/${SKILL}/SKILL.md`)).toBe(NATIVE_DOCUMENT);
      expect(JSON.stringify(created.settings())).not.toContain(SKILL);
      expect(environment.interaction.confirmApplyChangesCalls).toEqual([]);
    }),
  );

  it.effect("a previewed import onto a target of another type is refused and changes nothing", () =>
    Effect.gen(function* () {
      const { created, nativeDir, before } = workspaceWithNativeSkill();
      const { environment, run } = previewImport(created, nativeDir, `@acme/subagents/${SKILL}`);

      const failure = yield* run.pipe(Effect.flip);

      expect(failure).toMatchObject({
        _tag: "AuthoringFailed",
        category: "validation",
        detail: `Expected a skills target FQN, got @acme/subagents/${SKILL}`,
      });
      expect(created.snapshot()).toEqual(before);
      expect(environment.interaction.confirmApplyChangesCalls).toEqual([]);
    }),
  );
});
