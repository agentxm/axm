import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall, handleSync } from "axm.sh/specification-harness";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/sync/preserves-unowned-agent-content",
  title: "Sync never removes agent-native content without AXM ownership proof",
  statement:
    "When sync retires agent-native content that desired state no longer reaches, it shall remove only content AXM can prove it owns and shall leave hand-authored neighbors in the same agent directory untouched.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Sync preserves unowned agent content", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("removes owned universal residue while preserving a hand-authored neighbor", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({
        source: Option.some(skillPackage),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      const manualDir = path.join(workspace.root, ".agents", "skills", "hand-authored");
      fs.mkdirSync(manualDir, { recursive: true });
      fs.writeFileSync(path.join(manualDir, "SKILL.md"), "# Authored by hand\n");
      workspace.writeSettings({ owner: "@acme", agents: ["claude-code"], skills: {} });

      yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

      expect(workspace.exists(".agents/skills/code-review")).toBe(false);
      expect(workspace.readFile(".agents/skills/hand-authored/SKILL.md")).toBe(
        "# Authored by hand\n",
      );
    }),
  );
});
