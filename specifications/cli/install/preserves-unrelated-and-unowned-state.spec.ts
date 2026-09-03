import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../support/install-harness.js";

export const specification = defineSpecification({
  requirement: "cli/install/preserves-unrelated-and-unowned-state",
  title: "Install leaves unrelated configuration and unowned content untouched",
  statement:
    "When an extension is installed, the install command shall leave hand-authored content in agent directories and unrelated project files byte-for-byte intact and shall preserve every unrelated setting while adding the new declaration.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Install preserves surrounding state", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("keeps unowned native content and unrelated settings intact", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace();
      cleanups.push(workspace.cleanup);

      const unownedSkillPath = path.join(workspace.root, ".claude", "skills", "hand-written");
      fs.mkdirSync(unownedSkillPath, { recursive: true });
      fs.writeFileSync(
        path.join(unownedSkillPath, "SKILL.md"),
        "# Hand written\n\nAuthored directly in the agent directory.\n",
      );
      const noteFilePath = path.join(workspace.root, "NOTES.md");
      fs.writeFileSync(noteFilePath, "unrelated project file\n");
      const ownerBefore = JSON.stringify(workspace.readSettings());

      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({
        source: Option.some(skillPackage),
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      expect(fs.readFileSync(path.join(unownedSkillPath, "SKILL.md"), "utf8")).toBe(
        "# Hand written\n\nAuthored directly in the agent directory.\n",
      );
      expect(fs.readFileSync(noteFilePath, "utf8")).toBe("unrelated project file\n");

      const settingsAfter = workspace.readSettings();
      expect(settingsAfter).toMatchObject({ skills: { "code-review": expect.anything() } });
      expect(JSON.stringify(settingsAfter)).not.toBe(ownerBefore);
      expect(settingsAfter).toMatchObject({ agents: ["claude-code"], owner: "@acme" });
    }),
  );
});
