import * as fs from "node:fs";
import * as path from "node:path";

import { afterEach } from "vitest";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { handleInstall, handleSkillsInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "../../../support/contract.js";
import { makeLintSpecWorkspace, runProjectLint } from "../../../support/lint-harness.js";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { writeAuthoredSkill } from "../../../support/publish-harness.js";
import { makeSpecRegistry } from "../../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/skills/install/bundled-recovery-converges",
  title: "Bundled official-skill recovery converges without changing source authority",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition", "actionable-diagnostics"],
  methods: ["example"],
});

const bundledInstall = (preview: boolean, force = false) =>
  handleSkillsInstall(
    { source: Option.some("@agentxm/skills/axm"), skills: [], all: false, bundled: true },
    { yes: !preview, force, preview },
  );

describe("Bundled official-skill recovery", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("retires a superseded accepted resolution and leaves a lint-clean workspace", () =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill("review-helper", [{ version: "1.0.0", body: "Review guidance." }]);
      const workspace = makeLintSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: {
          sources: [registry.source],
          skills: { axm: "agentxm:@agentxm/skills/axm" },
          lockfileSkills: {
            axm: {
              type: "registry",
              owner: "@agentxm",
              name: "axm",
              resolvedVersion: "0.28.3",
              integrity: `sha512-${Buffer.alloc(64).toString("base64")}`,
              sourceName: "agentxm",
              publisherBindingId: "hbnd_agentxm",
            },
          },
        },
      });
      cleanups.push(workspace.cleanup);

      yield* handleInstall({
        source: Option.some("@acme/skills/review-helper"),
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      const lockBefore = workspace.readLockfileText();
      expect(lockBefore).toContain("axm:");
      expect(lockBefore).toContain("review-helper:");

      yield* bundledInstall(false).pipe(Effect.provide(workspace.layer));

      const settingsAfter = workspace.readSettings();
      const lockAfter = workspace.readLockfileText();
      const canonicalAfter = workspace.readFile(
        "agent_extensions/agentxm/@agentxm/skills/axm/src/SKILL.md",
      );
      const projectionAfter = workspace.readFile(".claude/skills/axm/SKILL.md");
      expect(settingsAfter).toMatchObject({
        skills: { axm: { source: "workspace", origin: "bundled" } },
      });
      expect(lockAfter).not.toContain("axm:");
      expect(lockAfter).toContain("review-helper:");

      const lint = yield* runProjectLint(workspace, false);
      expect(lint.result.findings).toEqual([]);
      expect(lint.ok).toBe(true);

      yield* bundledInstall(false).pipe(Effect.provide(workspace.layer));
      expect(workspace.readSettings()).toEqual(settingsAfter);
      expect(workspace.readLockfileText()).toBe(lockAfter);
      expect(workspace.readFile("agent_extensions/agentxm/@agentxm/skills/axm/src/SKILL.md")).toBe(
        canonicalAfter,
      );
      expect(workspace.readFile(".claude/skills/axm/SKILL.md")).toBe(projectionAfter);
    }),
  );

  it.effect("blocks preview and apply before overwriting an authored official skill", () =>
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

      yield* bundledInstall(true).pipe(Effect.provide(workspace.layer));
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
