import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  extensionName,
  handleSkillsNew,
  handleSync,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { planTargets } from "../../../support/plan-targets.js";

export const specification = defineSpecification({
  requirement: "cli/skills/new/scaffolds-for-every-configured-agent",
  title: "A new skill is scaffolded for the universal location and every configured agent",
  statement:
    "When a skill is created, AXM shall create its manifest, content, and enabled settings entry together, shall materialize it for the universal location and every configured agent that can represent it, shall list the same targets in preview and apply, and a following reconciliation shall report no change.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "agent-interoperability", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [
    "cli/sync/realizes-desired-state",
    "cli/install/preview-is-pure",
    "packages/cli/src/root/skills/new.internal.test.ts",
    "packages/cli-e2e/src/cli-commands/skills/new/command.e2e.ts",
  ],
  supersedes: [],
  assumptions: [
    "Claude Code and Cursor declare distinct native project skill directories, so two agent locations observe two configured agents beside the universal location.",
  ],
  openQuestions: [],
});

const SKILL = "review-helper";
const AUTHORED_ROOT = `skills/${SKILL}`;
const UNIVERSAL_LOCATION = `.agents/skills/${SKILL}`;
const AGENT_LOCATIONS = {
  "claude-code": `.claude/skills/${SKILL}`,
  cursor: `.cursor/skills/${SKILL}`,
} as const;

type SpecWorkspace = ReturnType<typeof makeSpecWorkspace>;

/** The targets a creation lists beyond the authored content and settings. */
const projectionTargets = (payload: unknown) =>
  planTargets(payload).filter(
    (target) => !target.path.startsWith(AUTHORED_ROOT) && target.path !== "axm.json",
  );

describe("Creating a skill", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const workspace = () => {
    const created = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      settings: { agents: ["claude-code", "cursor"] },
    });
    cleanups.push(created.cleanup);
    return created;
  };

  const createSkill = (target: SpecWorkspace, preview: boolean) =>
    handleSkillsNew({
      name: extensionName(SKILL),
      owner: Option.none(),
      preview,
    }).pipe(Effect.provide(target.layer));

  it.effect("records the manifest, content, and enabled settings entry together", () =>
    Effect.gen(function* () {
      const created = workspace();

      yield* createSkill(created, false);

      expectAppliedPlanResult(created.rendererState.results.at(-1)?.data, {
        planName: "New skill",
      });
      const manifest: unknown = JSON.parse(created.readFile(`${AUTHORED_ROOT}/skill.json`));
      expect(manifest).toMatchObject({ owner: "@acme", type: "skill", name: SKILL });
      expect(created.readFile(`${AUTHORED_ROOT}/src/SKILL.md`)).toContain(`name: ${SKILL}`);
      expect(created.readSettings()).toMatchObject({ skills: { [SKILL]: expect.anything() } });
      expect(JSON.stringify(created.readSettings())).not.toContain('"enabled":false');
    }),
  );

  it.effect("materializes the skill for the universal location and every configured agent", () =>
    Effect.gen(function* () {
      const created = workspace();

      yield* createSkill(created, false);

      expect(created.exists(UNIVERSAL_LOCATION)).toBe(true);
      for (const location of Object.values(AGENT_LOCATIONS)) {
        expect(created.exists(location), location).toBe(true);
      }
    }),
  );

  it.effect("previews exactly the targets that apply realizes", () =>
    Effect.gen(function* () {
      const created = workspace();

      yield* createSkill(created, true);
      const previewed = created.rendererState.results.at(-1)?.data;
      expectPreviewedPlanResult(previewed, { planName: "New skill", totalSteps: 1 });
      expect(created.exists(AUTHORED_ROOT)).toBe(false);

      yield* createSkill(created, false);
      const applied = created.rendererState.results.at(-1)?.data;

      expect(projectionTargets(applied)).toEqual(projectionTargets(previewed));
      const appliedByPath = new Map(
        projectionTargets(applied).map((target) => [target.path, target.agentIds]),
      );
      expect(appliedByPath.has(UNIVERSAL_LOCATION)).toBe(true);
      for (const [agentId, location] of Object.entries(AGENT_LOCATIONS)) {
        expect(appliedByPath.get(location), location).toContain(agentId);
      }
    }),
  );

  it.effect("a following reconciliation reports no change", () =>
    Effect.gen(function* () {
      const created = workspace();
      yield* createSkill(created, false);

      yield* handleSync({ preview: false }).pipe(Effect.provide(created.layer));

      expectNoOpPlanResult(created.rendererState.results.at(-1)?.data, {
        planName: "Sync workspace",
      });
    }),
  );
});
