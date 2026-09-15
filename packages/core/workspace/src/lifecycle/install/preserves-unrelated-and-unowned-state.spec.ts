import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { writeLocalSkillPackage } from "../testing.js";
import { applyInstall, installRequest, makeInstallWorld, readSettings } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/install/preserves-unrelated-and-unowned-state",
  title: "Install leaves unrelated configuration and unowned content untouched",
  statement:
    "When an extension is installed, the install shall leave hand-authored content in agent directories and unrelated project files byte-for-byte intact and shall preserve every unrelated setting while adding the new declaration.",
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
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("keeps unowned native content and unrelated settings intact", () => {
    const { workspace, cleanup } = makeInstallWorld();
    cleanups.push(cleanup);

    const unownedSkillPath = nodePath.join(workspace.root, ".claude", "skills", "hand-written");
    fs.mkdirSync(unownedSkillPath, { recursive: true });
    fs.writeFileSync(
      nodePath.join(unownedSkillPath, "SKILL.md"),
      "# Hand written\n\nAuthored directly in the agent directory.\n",
    );
    const noteFilePath = nodePath.join(workspace.root, "NOTES.md");
    fs.writeFileSync(noteFilePath, "unrelated project file\n");
    const settingsBefore = JSON.stringify(readSettings(workspace));
    const source = writeLocalSkillPackage(workspace.root, { name: "code-review" });

    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applyInstall(
            installRequest({ type: "skill", subject: { kind: "source", source } }),
          );

          expect(fs.readFileSync(nodePath.join(unownedSkillPath, "SKILL.md"), "utf8")).toBe(
            "# Hand written\n\nAuthored directly in the agent directory.\n",
          );
          expect(fs.readFileSync(noteFilePath, "utf8")).toBe("unrelated project file\n");

          const settingsAfter = readSettings(workspace);
          expect(settingsAfter).toMatchObject({ skills: { "code-review": expect.anything() } });
          expect(JSON.stringify(settingsAfter)).not.toBe(settingsBefore);
          expect(settingsAfter).toMatchObject({ agents: ["claude-code"], owner: "@acme" });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
