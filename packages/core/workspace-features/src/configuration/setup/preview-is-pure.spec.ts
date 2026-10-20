import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { defineSpecification } from "@agentxm/specification-metadata";

import { makeSetupFixture, type SetupFixture } from "../testing.js";
import { runSetup } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/setup/preview-is-pure",
  title: "Setup preview describes the workspace it would create without creating it",
  statement:
    "When setup runs in preview mode, it shall report the workspace it would initialize with a previewed outcome and shall not create settings, the lockfile, the runtime directory, instruction files, or any agent output, whether or not preapproval accompanies the preview.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  boundaryRationale:
    "Production setup runs against native temporary project and user directories; persisted state and untouched scope are observed on disk.",
  boundary: "platform",
  methods: ["example"],
  derivedFrom: ["cli/setup/preview-resolves-inputs-without-prompts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const expectNoPrompt = (fixture: SetupFixture): void => {
  const state = fixture.promptState();
  expect(state.selectAgentsCalls).toEqual([]);
  expect(state.confirmInstructionSyncCalls).toEqual([]);
  expect(state.selectInstructionSourceCalls).toEqual([]);
  expect(state.confirmSetupPlanCalls).toEqual([]);
};

describe("Setup preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const request = (
    fixture: SetupFixture,
    over: { readonly agents?: ReadonlyArray<string>; readonly yes?: boolean } = {},
  ) => ({
    scope: "project" as const,
    scopeExplicit: true,
    preview: true,
    nonInteractive: true,
    projectRoot: decodeAbsolutePathSync(fixture.root),
    telemetryEnabled: false,
    ...over,
  });

  it.effect("a previewed setup of a fresh directory changes no protected state", () => {
    const fixture = makeSetupFixture();
    cleanups.push(fixture.cleanup);
    const before = fixture.snapshot();

    return fixture
      .provide(
        Effect.gen(function* () {
          const settled = yield* runSetup(request(fixture, { agents: ["claude-code"] }));

          expect(fixture.snapshot()).toEqual(before);
          expect(fixture.exists("axm.json")).toBe(false);
          expect(fixture.exists(".axm")).toBe(false);
          expect(fixture.exists("AGENTS.md")).toBe(false);
          expectNoPrompt(fixture);
          expect(settled).toMatchObject({
            outcome: {
              outcome: "previewed",
              status: "preview",
              changed: false,
              defaultSkillInstalled: false,
              agents: [{ id: "claude-code", name: "Claude Code" }],
              steps: [
                expect.objectContaining({ label: "Workspace configuration", status: "ready" }),
                expect.objectContaining({ label: "Instruction files", status: "unchanged" }),
                expect.objectContaining({ label: "@agentxm/skills/axm", status: "ready" }),
              ],
            },
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  // Preapproval cannot make a preview do anything: preapproval is the one
  // difference between the two requests, so the settled candidate, the
  // transition it describes, and the reported outcome must all match, and
  // neither run may prompt or write.
  it.effect(
    "preapproval changes nothing about a preview: same candidate, no prompt, no write",
    () => {
      const fixture = makeSetupFixture();
      cleanups.push(fixture.cleanup);
      const before = fixture.snapshot();

      return fixture
        .provide(
          Effect.gen(function* () {
            const unapproved = yield* runSetup(request(fixture));
            const approved = yield* runSetup(request(fixture, { yes: true }));

            if (!("transition" in unapproved) || !("transition" in approved)) {
              throw new Error("Expected both previews to settle a candidate");
            }
            expect(approved.outcome).toEqual(unapproved.outcome);
            expect(approved.transition).toEqual(unapproved.transition);
            expect(approved.candidate.settingsExist).toBe(unapproved.candidate.settingsExist);
            expect(approved.candidate.settingsPath).toBe(unapproved.candidate.settingsPath);
            expect(approved.candidate.workspaceDir).toBe(unapproved.candidate.workspaceDir);

            expectNoPrompt(fixture);
            expect(fixture.snapshot()).toEqual(before);
            expect(fixture.exists("axm.json")).toBe(false);
            expect(fixture.exists(".axm")).toBe(false);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "a preview naming an unrecognized agent reports the failure and changes nothing",
    () => {
      const fixture = makeSetupFixture();
      cleanups.push(fixture.cleanup);
      const before = fixture.snapshot();

      return fixture
        .provide(
          Effect.gen(function* () {
            const failure = yield* runSetup(request(fixture, { agents: ["not-an-agent"] })).pipe(
              Effect.flip,
            );

            expect(failure).toMatchObject({
              _tag: "OperationRefused",
              diagnostic: { kind: "workspace-configuration-failed" },
            });
            expect(JSON.stringify(failure)).toContain("not-an-agent");
            expect(fixture.snapshot()).toEqual(before);
            expect(fixture.exists("axm.json")).toBe(false);
            expect(fixture.exists(".axm")).toBe(false);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
  it.effect("the machine report preserves the human plan's blocked target and reason", () => {
    const fixture = makeSetupFixture({
      files: {
        "AGENTS.md": "Canonical instructions\n",
        "CLAUDE.md": "Unrelated authored content\n",
      },
    });
    cleanups.push(fixture.cleanup);
    return fixture
      .provide(
        Effect.gen(function* () {
          const before = fixture.snapshot();
          const settled = yield* runSetup(request(fixture, { agents: ["claude-code"] }));
          expect(settled.outcome).toMatchObject({
            outcome: "previewed",
            blockedCount: 1,
            failedCount: 0,
          });
          const human = fixture
            .promptState()
            .presentSetupPlanCalls[0]?.find((row) => row.target === "CLAUDE.md");
          const step = settled.outcome.steps.find((step) => step.label === "Instruction files");
          expect(human).toMatchObject({
            action: "blocked",
            detail: { blocked: true, reason: expect.any(String) },
          });
          expect(step).toMatchObject({ status: "blocked" });
          expect(
            step?.artifact?.targets?.find((target) => target.path === "CLAUDE.md"),
          ).toMatchObject({ action: human?.action, detail: human?.detail, change: "unchanged" });
          expect(fixture.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
  for (const nativeTarget of [".claude/skills/axm", ".agents/skills/axm"]) {
    it.effect(`an unowned ${nativeTarget} blocks both views without changing it`, () => {
      const fixture = makeSetupFixture({
        files: { [`${nativeTarget}/SKILL.md`]: "Authored skill, preserve me\n" },
      });
      cleanups.push(fixture.cleanup);
      return fixture
        .provide(
          Effect.gen(function* () {
            const before = fixture.snapshot();
            const settled = yield* runSetup(request(fixture, { agents: ["claude-code"] }));
            expect(settled.outcome).toMatchObject({
              outcome: "previewed",
              blockedCount: 1,
              failedCount: 0,
            });
            const human = fixture
              .promptState()
              .presentSetupPlanCalls[0]?.find((row) => row.target === nativeTarget);
            expect(human).toMatchObject({
              action: "blocked",
              detail: { _tag: "bundledSkill", reason: expect.stringContaining("unowned") },
            });
            const step = settled.outcome.steps.find((step) => step.label === "@agentxm/skills/axm");
            expect(step).toMatchObject({ status: "blocked" });
            expect(
              step?.artifact?.targets?.find((target) => target.path === nativeTarget),
            ).toMatchObject({ action: human?.action, detail: human?.detail, change: "unchanged" });
            expect(fixture.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });
  }
});
