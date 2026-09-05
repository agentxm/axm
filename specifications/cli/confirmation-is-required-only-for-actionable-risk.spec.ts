import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  handleDemote,
  handleInstall,
  handleSkillsDisable,
  handleSkillsEnable,
  handleSkillsInstall,
  handleSkillsUpdate,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  makeSpecWorkspace,
  writeLocalSkillPackage,
  type SpecWorkspaceOptions,
} from "../support/install-harness.js";
import { writeAuthoredSkill } from "../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/confirmation-is-required-only-for-actionable-risk",
  title: "A person is asked to confirm only when the plan carries a risk worth confirming",
  statement:
    "An apply whose plan carries no confirmable risk shall proceed without asking, an apply with nothing to do shall finish without asking, and an apply whose plan carries a confirmable risk shall ask when a prompt can open, honor a declined answer by changing nothing, and stop as approval required when no prompt can open.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: ["cli/machine-mode-never-prompts", "cli/preview-does-not-consume-approval"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const SKILL = "review";
const FQN = `@acme/skills/${SKILL}`;

describe("Confirmation and actionable risk", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /**
   * An interactive session with no canned answer: any confirmation the
   * product raised would have no answer to consume and would fail the test,
   * so a completed apply is proof that nothing was asked.
   */
  const interactiveWorkspace = (
    options: {
      readonly answers?: ReadonlyArray<boolean>;
      readonly settings?: SpecWorkspaceOptions["settings"];
    } = {},
  ) => {
    const workspace = makeSpecWorkspace({
      machine: false,
      flags: { nonInteractive: false, json: false },
      prompt: { confirmResponses: options.answers ?? [] },
      ...(options.settings === undefined ? {} : { settings: options.settings }),
    });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  const expectNothingAsked = (workspace: ReturnType<typeof makeSpecWorkspace>): void => {
    expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
    expect(workspace.promptState.confirmCalls).toEqual([]);
  };

  const lastOutcome = (workspace: ReturnType<typeof makeSpecWorkspace>): unknown => {
    const entry = workspace.rendererState.results.at(-1)?.data;
    return typeof entry === "object" && entry !== null && "result" in entry ? entry.result : entry;
  };

  it.effect("an install of a local package applies without asking", () =>
    Effect.gen(function* () {
      const workspace = interactiveWorkspace();
      const packageRoot = writeLocalSkillPackage(workspace.root, { name: SKILL });

      yield* handleSkillsInstall(
        { source: Option.some(packageRoot), skills: [], all: false },
        { force: false, preview: false },
      ).pipe(Effect.provide(workspace.layer));

      expectNothingAsked(workspace);
      expect(lastOutcome(workspace)).toMatchObject({
        outcome: "applied",
        counts: { committed: 1 },
      });
      expect(workspace.exists(`.claude/skills/${SKILL}`)).toBe(true);
    }),
  );

  it.effect("disabling and re-enabling an installed skill applies without asking", () =>
    Effect.gen(function* () {
      const workspace = interactiveWorkspace();
      const packageRoot = writeLocalSkillPackage(workspace.root, { name: SKILL });
      yield* handleInstall({ source: Option.some(packageRoot), force: false, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );

      yield* handleSkillsDisable({ name: SKILL, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      expect(lastOutcome(workspace)).toMatchObject({ outcome: "applied" });
      expect(workspace.exists(`.claude/skills/${SKILL}`)).toBe(false);

      yield* handleSkillsEnable({ name: SKILL, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      expect(lastOutcome(workspace)).toMatchObject({ outcome: "applied" });
      expect(workspace.exists(`.claude/skills/${SKILL}`)).toBe(true);
      expectNothingAsked(workspace);
    }),
  );

  it.effect("work with nothing to do finishes without asking", () =>
    Effect.gen(function* () {
      const workspace = interactiveWorkspace();
      const packageRoot = writeLocalSkillPackage(workspace.root, { name: SKILL });
      yield* handleInstall({ source: Option.some(packageRoot), force: false, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );

      yield* handleSkillsEnable({ name: SKILL, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      expect(lastOutcome(workspace)).toMatchObject({ outcome: "no-op" });

      yield* handleSkillsUpdate({
        source: Option.some("no-such-skill"),
        skills: [],
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      expect(lastOutcome(workspace)).toMatchObject({ outcome: "no-op" });
      expectNothingAsked(workspace);
    }),
  );

  describe("a plan that replaces workspace authority", () => {
    const authoredSettings = { owner: "@acme", skills: { [SKILL]: "workspace" } };

    const withReplacement = (workspace: ReturnType<typeof makeSpecWorkspace>) => {
      writeAuthoredSkill(workspace.root, { name: SKILL });
      return writeLocalSkillPackage(workspace.root, { name: SKILL, body: "Replacement guidance." });
    };

    it.effect("asks when a prompt can open and changes nothing when the answer is no", () =>
      Effect.gen(function* () {
        const workspace = interactiveWorkspace({ answers: [false], settings: authoredSettings });
        const replacement = withReplacement(workspace);

        yield* handleDemote({ fqn: FQN, source: replacement, yes: false, preview: false }).pipe(
          Effect.provide(workspace.layer),
        );

        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toHaveLength(1);
        expect(lastOutcome(workspace)).toMatchObject({
          outcome: "cancelled",
          counts: { committed: 0 },
        });
        expect(workspace.readSettings()).toMatchObject({ skills: { [SKILL]: "workspace" } });
        expect(workspace.exists(`skills/${SKILL}/skill.json`)).toBe(true);
      }),
    );

    it.effect("asks when a prompt can open and applies when the answer is yes", () =>
      Effect.gen(function* () {
        const workspace = interactiveWorkspace({ answers: [true], settings: authoredSettings });
        const replacement = withReplacement(workspace);

        yield* handleDemote({ fqn: FQN, source: replacement, yes: false, preview: false }).pipe(
          Effect.provide(workspace.layer),
        );

        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toHaveLength(1);
        expect(lastOutcome(workspace)).toMatchObject({
          outcome: "applied",
          counts: { committed: 1 },
        });
        expect(workspace.readSettings()).not.toMatchObject({ skills: { [SKILL]: "workspace" } });
        expect(workspace.exists(`skills/${SKILL}`)).toBe(false);
      }),
    );

    it.effect("stops as approval required when no prompt can open", () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          settings: authoredSettings,
        });
        cleanups.push(workspace.cleanup);
        const replacement = withReplacement(workspace);

        yield* handleDemote({ fqn: FQN, source: replacement, yes: false, preview: false }).pipe(
          Effect.provide(workspace.layer),
        );

        expectNothingAsked(workspace);
        expect(lastOutcome(workspace)).toMatchObject({
          outcome: "blocked",
          counts: { committed: 0 },
          blocking: { class: "approval-required", subject: "replace-workspace-authority" },
        });
        expect(workspace.readSettings()).toMatchObject({ skills: { [SKILL]: "workspace" } });
        expect(workspace.exists(`skills/${SKILL}/skill.json`)).toBe(true);
      }),
    );
  });
});
