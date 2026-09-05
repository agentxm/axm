import * as fs from "node:fs";
import * as path from "node:path";

import { afterEach } from "vitest";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { handleSkillsInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { writeAuthoredSkill } from "../../../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/skills/install/preserves-authored-official-skill",
  title: "Bundled official-skill recovery never overwrites a workspace-authored official skill",
  statement:
    "When the workspace authors a skill named axm, installing the bundled official AXM skill shall be blocked before any change in preview and in a forced apply, shall name the authored skill as the cause, and shall leave configuration, lock state, and the authored source byte-for-byte intact.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["cli/skills/install/bundled-recovery-converges"],
  supersedes: ["cli/skills/install/bundled-recovery-converges"],
  assumptions: [],
  openQuestions: [],
});

const bundledInstall = (preview: boolean, force: boolean) =>
  handleSkillsInstall(
    { source: Option.some("@agentxm/skills/axm"), skills: [], all: false, bundled: true },
    { force, preview },
  );

describe("Bundled official-skill recovery over an authored official skill", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("is blocked in preview and forced apply before any change", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: { skills: { axm: "workspace" } },
      });
      cleanups.push(workspace.cleanup);
      writeAuthoredSkill(workspace.root, {
        name: "axm",
        version: "0.0.1",
        description: "Authored official-skill guidance.",
      });
      const settingsPath = path.join(workspace.root, "axm.json");
      const lockPath = path.join(workspace.root, "axm-lock.yaml");
      const authoredPath = path.join(workspace.root, "skills", "axm", "src", "SKILL.md");
      const before = {
        settings: fs.readFileSync(settingsPath, "utf8"),
        lock: fs.readFileSync(lockPath, "utf8"),
        authored: fs.readFileSync(authoredPath, "utf8"),
      };

      yield* bundledInstall(true, false).pipe(Effect.provide(workspace.layer));
      const preview = workspace.rendererState.results.at(-1);
      yield* bundledInstall(false, true).pipe(Effect.provide(workspace.layer));
      const apply = workspace.rendererState.results.at(-1);

      for (const result of [preview, apply]) {
        expect(result?.ok).toBe(false);
        expect(result?.data).toMatchObject({
          result: {
            outcome: "blocked",
            counts: { committed: 0, failed: 0, blocked: 1 },
            blocking: {
              class: "precondition-unmet",
              causeCode: "conflict",
              subject: "bundled-axm-skill-authored",
            },
          },
        });
        expect(JSON.stringify(result?.data)).toContain("workspace-authored");
      }
      expect(fs.readFileSync(settingsPath, "utf8")).toBe(before.settings);
      expect(fs.readFileSync(lockPath, "utf8")).toBe(before.lock);
      expect(fs.readFileSync(authoredPath, "utf8")).toBe(before.authored);
      expect(workspace.exists("agent_extensions/agentxm/@agentxm/skills/axm")).toBe(false);
      expect(workspace.exists(".claude/skills/axm")).toBe(false);
    }),
  );
});
