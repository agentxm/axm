import { afterEach } from "vitest";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { handleSkillsInstall, handleUpdate } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/update/bundled-source-routes-to-recovery",
  title: "Targeted update routes bundled source to its converging recovery",
  statement:
    "When a targeted update names an extension whose source is bundled with the AXM executable, the update shall be blocked in preview and apply without contacting any Registry or changing workspace state, and shall suggest reinstalling the bundled skill as the recovery path.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Targeted update of a bundled official skill", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("is blocked without Registry access and suggests the bundled reinstall", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: {
          sources: [
            {
              type: "registry",
              name: "agentxm",
              location: "file:///path-that-must-not-be-read",
            },
          ],
        },
      });
      cleanups.push(workspace.cleanup);
      yield* handleSkillsInstall(
        { source: Option.some("@agentxm/skills/axm"), skills: [], all: false, bundled: true },
        { force: false, preview: false },
      ).pipe(Effect.provide(workspace.layer));
      const before = {
        settings: JSON.stringify(workspace.readSettings()),
        lock: workspace.readLockfileText(),
        canonical: workspace.readFile("agent_extensions/agentxm/@agentxm/skills/axm/src/SKILL.md"),
        projection: workspace.readFile(".claude/skills/axm/SKILL.md"),
      };

      for (const preview of [true, false]) {
        yield* handleUpdate({
          source: Option.some("@agentxm/skills/axm"),
          force: false,
          preview,
        }).pipe(Effect.provide(workspace.layer));
        const result = workspace.rendererState.results.at(-1);
        expect(result?.ok).toBe(false);
        expect(result?.data).toMatchObject({ result: { outcome: "blocked" } });
      }

      expect(workspace.rendererState.suggestions).toContainEqual({
        description: "Reinstall the compatible skill embedded in this AXM executable",
        cmd: "axm skills install @agentxm/skills/axm --bundled",
      });
      expect(JSON.stringify(workspace.readSettings())).toBe(before.settings);
      expect(workspace.readLockfileText()).toBe(before.lock);
      expect(workspace.readFile("agent_extensions/agentxm/@agentxm/skills/axm/src/SKILL.md")).toBe(
        before.canonical,
      );
      expect(workspace.readFile(".claude/skills/axm/SKILL.md")).toBe(before.projection);
    }),
  );
});
