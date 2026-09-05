import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  ResolvePlanInteractionLive,
  SetupDocumentSchema,
  classifyError,
  getAppError,
  handleDemote,
  handleSetup,
  handleSkillsInstall,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace, writeLocalSkillPackage } from "../support/install-harness.js";
import { writeAuthoredSkill } from "../support/publish-harness.js";
import { makeSetupSpecContext } from "../support/setup-harness.js";
import { snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/machine-mode-never-prompts",
  title: "Machine output reports missing input or approval without prompting",
  statement:
    "When machine output mode is on, a command that cannot proceed without interactive input or approval shall stop without prompting, identify what it needs, and change no workspace state even from an interactive terminal, while with machine output off and an interactive prompt available the same request shall prompt and honor the answer.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  limitations: [
    {
      limitation:
        "The skill-selection prompt has no in-memory interaction port, so the evidence that the same request prompts and honors the answer when machine output is off is carried by the setup command only.",
      retirementCondition:
        "An in-memory interaction port for the skill-selection prompt lets the harness record that prompt and its answer for install.",
    },
  ],
});

const decodeDocument = Schema.decodeUnknownEffect(SetupDocumentSchema);

/** A local source holding two skills, so an install must choose which to take. */
const writeTwoSkillSource = (workspaceRoot: string): string => {
  const sourceRoot = path.join(workspaceRoot, "sources");
  writeLocalSkillPackage(sourceRoot, { name: "alpha" });
  writeLocalSkillPackage(sourceRoot, { name: "beta" });
  return path.join(sourceRoot, "vendor");
};

describe("Machine mode never prompts", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect(
    "a setup that needs interactive input reports approval required without raising any prompt",
    () =>
      Effect.gen(function* () {
        // The session itself is interactive-capable: only machine output mode
        // may force the deterministic termination.
        const context = makeSetupSpecContext({
          machine: true,
          flags: { nonInteractive: false, json: true },
        });
        cleanups.push(context.cleanup);

        const exit = yield* handleSetup({ scope: "project", scopeExplicit: true }).pipe(
          Effect.provide(context.layer),
          Effect.exit,
        );

        expect(Exit.isFailure(exit)).toBe(true);
        expect(context.promptState.selectAgentsCalls).toEqual([]);
        expect(context.promptState.confirmSetupPlanCalls).toEqual([]);
        expect(context.promptState.confirmInstructionSyncCalls).toEqual([]);
        expect(context.promptState.selectInstructionSourceCalls).toEqual([]);

        const entry = context.rendererState.results.at(-1);
        expect(entry?.ok).toBe(false);
        const document = yield* decodeDocument(entry?.data);
        expect(document.result.status).toBe("approval-required");
        expect(document.result.outcome).toBe("failed");
        expect(document.result.changed).toBe(false);

        expect(context.exists("axm.json")).toBe(false);
        expect(context.exists(".axm")).toBe(false);
      }),
  );

  it.effect(
    "an install that needs a skill selection fails as a usage error without raising any prompt",
    () =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { nonInteractive: false, json: true },
        });
        cleanups.push(workspace.cleanup);
        const source = writeTwoSkillSource(workspace.root);
        const before = snapshotWorkspaceContent(workspace.root);

        const failure = yield* handleSkillsInstall(
          { source: Option.some(source), skills: [], all: false },
          { force: false, preview: false },
        ).pipe(Effect.provide(workspace.layer), Effect.flip);

        const error = getAppError(failure);
        expect(error.code).toBe("usage");
        expect(error.detail).toContain("Select skills to install");
        const classified = classifyError(failure, "json");
        expect(classified.exitCode).toBeGreaterThan(0);
        expect(JSON.parse(classified.stdout ?? "")).toMatchObject({ ok: false, code: "usage" });
        expect(workspace.rendererState.results).toEqual([]);
        expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
      }),
  );

  it.effect("the same install completes in machine mode once the selection is supplied", () =>
    Effect.gen(function* () {
      const workspace = makeSpecWorkspace({
        machine: true,
        flags: { nonInteractive: false, json: true },
      });
      cleanups.push(workspace.cleanup);
      const source = writeTwoSkillSource(workspace.root);

      yield* handleSkillsInstall(
        { source: Option.some(source), skills: ["alpha"], all: false },
        { force: false, preview: false },
      ).pipe(Effect.provide(workspace.layer));

      expect(workspace.rendererState.results.at(-1)?.data).toMatchObject({
        result: { outcome: "applied" },
      });
      expect(workspace.exists(".claude/skills/alpha")).toBe(true);
      expect(workspace.exists(".claude/skills/beta")).toBe(false);
    }),
  );

  it.effect(
    "an apply that needs approval reports approval required without raising any prompt, even from an interactive terminal",
    () =>
      Effect.gen(function* () {
        // The session is interactive-capable and no non-interactive flag is
        // given: machine output alone must keep the confirmation closed. The
        // application's own interaction port decides whether a prompt can
        // open, so a canned answer stands ready to expose any prompt raised.
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { nonInteractive: false, json: true },
          prompt: { confirmResponses: [true] },
          settings: { owner: "@acme", skills: { review: "workspace" } },
        });
        cleanups.push(workspace.cleanup);
        writeAuthoredSkill(workspace.root, { name: "review" });
        const replacement = writeLocalSkillPackage(workspace.root, {
          name: "review",
          body: "Replacement guidance.",
        });
        const before = snapshotWorkspaceContent(workspace.root);

        yield* handleDemote({
          fqn: "@acme/skills/review",
          source: replacement,
          yes: false,
          preview: false,
        }).pipe(Effect.provide(Layer.provideMerge(ResolvePlanInteractionLive, workspace.layer)));

        expect(workspace.promptState.confirmCalls).toEqual([]);
        const [entry] = workspace.rendererState.results;
        expect(entry?.ok).toBe(false);
        expect(entry?.data).toMatchObject({
          result: {
            outcome: "blocked",
            counts: { committed: 0 },
            blocking: {
              class: "approval-required",
              subject: "replace-workspace-authority",
              escape: { cmd: expect.stringContaining("--yes") },
            },
          },
        });
        expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
      }),
  );

  it.effect("the same request prompts and honors the answer when machine output is off", () =>
    Effect.gen(function* () {
      const context = makeSetupSpecContext({
        machine: false,
        flags: { nonInteractive: false, json: false },
        interaction: { selectAgents: [], confirmSetupPlan: false },
      });
      cleanups.push(context.cleanup);

      yield* handleSetup({ scope: "project", scopeExplicit: true }).pipe(
        Effect.provide(context.layer),
      );

      expect(context.promptState.confirmSetupPlanCalls.length).toBeGreaterThanOrEqual(1);
      expect(context.exists("axm.json")).toBe(false);
      expect(context.exists(".axm")).toBe(false);
    }),
  );
});
