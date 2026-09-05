import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  handleAgentsAdd,
  handleInstall,
  handleSkillsDisable,
  SettingsSchema,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../../../support/install-harness.js";
import { snapshotWorkspaceContent } from "../../../support/workspace-fixtures.js";
import { writeLocalHookPackage } from "../../../support/extension-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/agents/add/records-membership-and-realizes-outputs",
  title: "Adding a coding agent records it durably and realizes installed extensions for it",
  statement:
    "When a coding agent is added to the workspace, AXM shall record it in the configured agent set and realize installed extensions on its supported native and shared surfaces as permitted by workspace activation and instruction settings in one operation.",
  class: "functional",
  role: "experience",
  goals: ["agent-interoperability", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: ["cli/agents/membership-changes-realize-affected-outputs"],
  supersedes: ["cli/agents/membership-changes-realize-affected-outputs"],
  assumptions: [],
  openQuestions: [],
});

describe("Adding a coding agent", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const workspaceWithInstalledSkill = () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({ machine: true });
      cleanups.push(workspace.cleanup);
      const skillPackage = writeLocalSkillPackage(workspace.root, { name: "code-review" });
      yield* handleInstall({
        source: Option.some(skillPackage),
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      return workspace;
    });

  it.effect(
    "adding an agent records it as a durable target and realizes installed extensions for it",
    () =>
      Effect.gen(function* () {
        const workspace = yield* workspaceWithInstalledSkill();
        expect(workspace.exists(".opencode/skills/code-review")).toBe(false);

        yield* handleAgentsAdd({
          ids: ["opencode"],
          detected: false,
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));

        expect(workspace.readSettings()).toMatchObject({
          agents: ["claude-code", "opencode"],
        });
        expect(workspace.readFile(".opencode/skills/code-review/SKILL.md")).toBe(
          workspace.readFile("agent_extensions/local/vendor/code-review/src/SKILL.md"),
        );
      }),
  );
  it.effect(
    "realizes enabled Skills while preserving a disabled Skill and existing agent output",
    () =>
      Effect.gen(function* () {
        const workspace = yield* workspaceWithInstalledSkill();
        const disabledSource = writeLocalSkillPackage(workspace.root, { name: "disabled-review" });
        yield* handleInstall({
          source: Option.some(disabledSource),
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));
        yield* handleSkillsDisable({ name: "disabled-review", preview: false }).pipe(
          Effect.provide(workspace.layer),
        );
        const declarationsBefore = Schema.decodeUnknownSync(SettingsSchema)(
          workspace.readSettings(),
        ).skills;
        const canonicalBefore = snapshotWorkspaceContent(
          path.join(workspace.root, "agent_extensions"),
        );
        const oldAgentBefore = snapshotWorkspaceContent(path.join(workspace.root, ".claude"));
        const lockBefore = workspace.readLockfileText();
        const instructions = workspace.readFile(
          "agent_extensions/local/vendor/code-review/src/SKILL.md",
        );
        expect(workspace.exists(".opencode/skills/code-review")).toBe(false);
        expect(workspace.exists(".claude/skills/disabled-review")).toBe(false);

        yield* handleAgentsAdd({
          ids: ["opencode"],
          detected: false,
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));

        expect(workspace.rendererState.results.at(-1)).toMatchObject({
          ok: true,
          data: { result: { outcome: "applied", counts: { failed: 0, blocked: 0 } } },
        });
        expect(Schema.decodeUnknownSync(SettingsSchema)(workspace.readSettings()).agents).toEqual([
          "claude-code",
          "opencode",
        ]);
        expect(Schema.decodeUnknownSync(SettingsSchema)(workspace.readSettings()).skills).toEqual(
          declarationsBefore,
        );
        expect(workspace.readFile(".opencode/skills/code-review/SKILL.md")).toBe(instructions);
        expect(workspace.exists(".opencode/skills/disabled-review")).toBe(false);
        expect(workspace.exists(".agents/skills/disabled-review")).toBe(false);
        expect(snapshotWorkspaceContent(path.join(workspace.root, "agent_extensions"))).toEqual(
          canonicalBefore,
        );
        expect(snapshotWorkspaceContent(path.join(workspace.root, ".claude"))).toEqual(
          oldAgentBefore,
        );
        expect(workspace.readLockfileText()).toBe(lockBefore);
      }),
  );

  it.effect(
    "adds a Skill-capable agent without inventing an unsupported native Hook representation",
    () =>
      Effect.gen(function* () {
        const workspace = yield* workspaceWithInstalledSkill();
        const hookSource = writeLocalHookPackage(workspace.root, { name: "review-guard" });
        yield* handleInstall({
          source: Option.some(hookSource),
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));
        expect(workspace.readFile(".claude/settings.json")).toContain("hook:review-guard");
        const hookBefore = workspace.readFile(".claude/settings.json");
        const canonicalBefore = snapshotWorkspaceContent(
          path.join(workspace.root, "agent_extensions"),
        );
        const lockBefore = workspace.readLockfileText();
        const agentRoot = path.join(workspace.root, ".opencode");
        fs.mkdirSync(agentRoot, { recursive: true });
        fs.writeFileSync(path.join(agentRoot, "keep.txt"), "Existing native agent content.\n");
        const nativeBefore = snapshotWorkspaceContent(agentRoot);

        yield* handleAgentsAdd({
          ids: ["opencode"],
          detected: false,
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));

        expect(workspace.rendererState.results.at(-1)).toMatchObject({
          ok: true,
          data: { result: { outcome: "applied", counts: { failed: 0, blocked: 0 } } },
        });
        expect(Schema.decodeUnknownSync(SettingsSchema)(workspace.readSettings()).agents).toEqual([
          "claude-code",
          "opencode",
        ]);
        expect(workspace.readFile(".opencode/skills/code-review/SKILL.md")).toBe(
          workspace.readFile("agent_extensions/local/vendor/code-review/src/SKILL.md"),
        );
        expect(
          Object.fromEntries(
            Object.entries(snapshotWorkspaceContent(agentRoot)).filter(
              ([relative]) => relative !== "skills" && !relative.startsWith("skills/"),
            ),
          ),
        ).toEqual(nativeBefore);
        expect(workspace.readFile(".claude/settings.json")).toBe(hookBefore);
        expect(snapshotWorkspaceContent(path.join(workspace.root, "agent_extensions"))).toEqual(
          canonicalBefore,
        );
        expect(workspace.readLockfileText()).toBe(lockBefore);
      }),
  );
});
