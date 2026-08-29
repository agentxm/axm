import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall, handleSkillsInstall } from "axm.sh/unstable/specification-harness";

import { defineSpecification } from "../../support/contract.js";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/install/reinstall-is-idempotent",
  title: "Installing an already desired extension at the same constraint is a successful no-op",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition"],
  methods: ["decision-table"],
});

interface RepeatCase {
  readonly label: string;
  readonly form: "root" | "type";
}

const repeatCases: readonly RepeatCase[] = [
  { label: "repeating a root install reports an unchanged no-op", form: "root" },
  { label: "repeating a type-command install reports an unchanged no-op", form: "type" },
];

describe("Repeat installs are safe", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect.each(repeatCases)("$label", (testCase) =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      const install =
        testCase.form === "root"
          ? handleInstall({
              source: Option.some(skillPackage),
              yes: true,
              force: false,
              preview: false,
            }).pipe(Effect.provide(workspace.layer))
          : handleSkillsInstall(
              { source: Option.some(skillPackage), skills: [], all: true },
              { yes: true, force: false, preview: false },
            ).pipe(Effect.provide(workspace.layer));

      yield* install;
      const settingsAfterFirst = JSON.stringify(workspace.readSettings());
      const lockAfterFirst = workspace.readLockfileText();
      const projectionAfterFirst = workspace.snapshotTree(".claude");

      yield* install;

      const [, secondResult] = workspace.rendererState.results;
      expect(secondResult).toBeDefined();
      expect(secondResult?.data).toMatchObject({ result: { outcome: "no-op" } });

      expect(JSON.stringify(workspace.readSettings())).toBe(settingsAfterFirst);
      expect(workspace.readLockfileText()).toBe(lockAfterFirst);
      expect(workspace.snapshotTree(".claude")).toEqual(projectionAfterFirst);
    }),
  );
});
