import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall, handleSync } from "axm.sh/specification-harness";
import { defineSpecification } from "../../support/contract.js";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/sync/preserves-unowned-agent-content",
  title: "Sync never removes agent-native content without AXM ownership proof",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
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
        yes: true,
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
