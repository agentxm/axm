import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { getAppError, handleSetup } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { probeFlag } from "../../support/parser-probe.js";
import {
  WORKSPACE_PROTECTED_STATE,
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../support/preview-purity.js";
import { makeSetupSpecContext } from "../../support/setup-harness.js";

export const specification = defineSpecification({
  requirement: "cli/setup/preview-is-pure",
  title: "Setup preview describes the workspace it would create without creating it",
  statement:
    "When setup runs in preview mode against an uninitialized directory, it shall report the setup candidate it would apply with a previewed outcome and shall not create workspace settings, the lockfile, the runtime directory, instruction files, or agent projections, whether or not preapproval accompanies the preview.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "workspace-intent-fidelity"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

/** Setup's protected state: the workspace state plus the runtime directory it would create. */
const SETUP_PROTECTED_STATE = [...WORKSPACE_PROTECTED_STATE, ".axm"];

const expectNoPrompt = (context: ReturnType<typeof makeSetupSpecContext>): void => {
  expect(context.promptState.selectAgentsCalls).toEqual([]);
  expect(context.promptState.confirmInstructionSyncCalls).toEqual([]);
  expect(context.promptState.selectInstructionSourceCalls).toEqual([]);
  expect(context.promptState.confirmSetupPlanCalls).toEqual([]);
};

describe("Setup preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect("a previewed setup of a fresh directory changes no protected state", () =>
    Effect.gen(function* () {
      const context = makeSetupSpecContext({
        machine: true,
        flags: { json: true },
        recordWrites: true,
      });
      cleanups.push(context.cleanup);
      const before = snapshotProtectedState(context.root, SETUP_PROTECTED_STATE);

      yield* handleSetup({
        scope: "project",
        scopeExplicit: true,
        agents: ["claude-code"],
        preview: true,
      }).pipe(Effect.provide(context.layer));

      expectProtectedStateUntouched({
        root: context.root,
        before,
        writes: context.writes,
        protectedPaths: SETUP_PROTECTED_STATE,
      });
      expect(context.exists("axm.json")).toBe(false);
      expect(context.exists(".axm")).toBe(false);
      expect(context.exists("AGENTS.md")).toBe(false);
      expectNoPrompt(context);
      const [entry] = context.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: {
          outcome: "previewed",
          status: "preview",
          changed: false,
          defaultSkillInstalled: false,
          agents: [{ id: "claude-code", name: "Claude Code" }],
          steps: [
            expect.objectContaining({ label: "Workspace configuration", status: "ready" }),
            expect.objectContaining({ label: "Instruction files", status: "ready" }),
            expect.objectContaining({ label: "@agentxm/skills/axm", status: "ready" }),
          ],
        },
      });
    }),
  );

  it.effect(
    "preapproval changes nothing about a preview: same candidate, no prompt, no write",
    () =>
      Effect.gen(function* () {
        const unapproved = makeSetupSpecContext({
          machine: true,
          flags: { json: true },
          recordWrites: true,
        });
        const approved = makeSetupSpecContext({
          machine: true,
          flags: { json: true },
          recordWrites: true,
        });
        cleanups.push(unapproved.cleanup, approved.cleanup);

        yield* handleSetup({ scope: "project", scopeExplicit: true, preview: true }).pipe(
          Effect.provide(unapproved.layer),
        );
        yield* handleSetup({
          scope: "project",
          scopeExplicit: true,
          preview: true,
          yes: true,
        }).pipe(Effect.provide(approved.layer));

        expect(approved.rendererState.results[0]?.data).toEqual(
          unapproved.rendererState.results[0]?.data,
        );
        expect(approved.rendererState.suggestions).toEqual(unapproved.rendererState.suggestions);
        for (const context of [unapproved, approved]) {
          expectNoPrompt(context);
          expect(context.writes).toEqual([]);
          expect(context.exists("axm.json")).toBe(false);
          expect(context.exists(".axm")).toBe(false);
        }
      }),
  );

  it.effect("a preview naming an unrecognized agent reports the failure and changes nothing", () =>
    Effect.gen(function* () {
      const context = makeSetupSpecContext({
        machine: true,
        flags: { json: true },
        recordWrites: true,
      });
      cleanups.push(context.cleanup);
      const before = snapshotProtectedState(context.root, SETUP_PROTECTED_STATE);

      const failure = yield* handleSetup({
        scope: "project",
        scopeExplicit: true,
        agents: ["not-an-agent"],
        preview: true,
      }).pipe(Effect.provide(context.layer), Effect.flip);

      const error = getAppError(failure);
      expect(error.code).toBe("validation");
      expect(error.detail).toContain("not-an-agent");
      expectProtectedStateUntouched({
        root: context.root,
        before,
        writes: context.writes,
        protectedPaths: SETUP_PROTECTED_STATE,
      });
      expect(context.rendererState.results).toEqual([]);
    }),
  );

  it.effect("the route offers preview and the preapproval it can use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["setup"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["setup"], "--yes")).toBe("accepted");
      expect(yield* probeFlag(["setup"], "-y")).toBe("accepted");
    }),
  );
});
