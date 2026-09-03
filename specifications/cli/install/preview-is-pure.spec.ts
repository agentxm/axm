import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/install/preview-is-pure",
  title: "Install preview describes the plan without changing any state",
  statement:
    "When the install command runs in preview mode, it shall report the planned closure with a previewed outcome and shall not change settings, the lockfile, canonical content, or agent projections.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Install preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("a previewed install writes no settings, lock, content, or projection state", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      const settingsBefore = JSON.stringify(workspace.readSettings());

      yield* handleInstall({
        source: Option.some(skillPackage),
        yes: true,
        force: false,
        preview: true,
      }).pipe(Effect.provide(workspace.layer));

      expect(JSON.stringify(workspace.readSettings())).toBe(settingsBefore);
      expect(workspace.readLockfileText()).not.toContain("code-review");
      expect(workspace.exists("agent_extensions")).toBe(false);
      expect(workspace.exists(".claude/skills/code-review")).toBe(false);

      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({ result: { outcome: "previewed" } });
    }),
  );
});
