import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/install/reinstall-is-idempotent",
  title: "Installing an already desired extension at the same constraint is a successful no-op",
  statement:
    "When a person reinstalls an extension the workspace already desires at the same constraint, the install shall succeed with a no-op outcome and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Repeat installs are safe", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("repeating an install reports an unchanged no-op", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      const install = handleInstall({
        source: Option.some(skillPackage),
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      yield* install;
      const settingsAfterFirst = JSON.stringify(workspace.readSettings());
      const lockAfterFirst = workspace.readLockfileText();
      const canonicalAfterFirst = workspace.snapshotTree("agent_extensions");
      const projectionAfterFirst = workspace.snapshotTree(".claude");

      yield* install;

      const [, secondResult] = workspace.rendererState.results;
      expect(secondResult).toBeDefined();
      expect(secondResult?.data).toMatchObject({ result: { outcome: "no-op" } });

      expect(JSON.stringify(workspace.readSettings())).toBe(settingsAfterFirst);
      expect(workspace.readLockfileText()).toBe(lockAfterFirst);
      expect(workspace.snapshotTree("agent_extensions")).toEqual(canonicalAfterFirst);
      expect(workspace.snapshotTree(".claude")).toEqual(projectionAfterFirst);
    }),
  );
});
