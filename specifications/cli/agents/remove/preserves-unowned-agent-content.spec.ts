import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleAgentsAdd, handleAgentsRemove, handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/agents/remove/preserves-unowned-agent-content",
  title: "Removing a coding agent never removes agent-native content without AXM ownership proof",
  statement:
    "When a coding agent is removed from the workspace, AXM shall remove only agent-native content it can prove it owns and shall leave hand-authored content in the same agent directory untouched.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "agent-interoperability"],
  methods: ["example"],
  derivedFrom: ["cli/agents/membership-changes-realize-affected-outputs"],
  supersedes: ["cli/agents/membership-changes-realize-affected-outputs"],
  assumptions: [],
  openQuestions: [],
});

describe("Removing a coding agent preserves unowned content", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("removing an agent preserves native content it cannot prove it owns", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({
        source: Option.some(skillPackage),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      yield* handleAgentsAdd({
        ids: ["opencode"],
        detected: false,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      const unownedSkill = path.join(workspace.root, ".opencode", "skills", "hand-authored");
      fs.mkdirSync(unownedSkill, { recursive: true });
      fs.writeFileSync(path.join(unownedSkill, "SKILL.md"), "# Authored by hand\n");

      yield* handleAgentsRemove({
        ids: ["opencode"],
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      expect(workspace.exists(".opencode/skills/code-review")).toBe(false);
      expect(workspace.readFile(".opencode/skills/hand-authored/SKILL.md")).toBe(
        "# Authored by hand\n",
      );
    }),
  );
});
