import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleSetup } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSetupSpecContext } from "../../support/setup-harness.js";

export const specification = defineSpecification({
  requirement: "cli/setup/preview-resolves-inputs-without-prompts",
  title: "Setup preview resolves its inputs from documented defaults without asking",
  statement:
    "When setup runs in preview mode, it shall resolve coding-agent membership and instruction configuration from the explicit request or the documented defaults, shall raise no prompt even in an interactive session, shall resolve the same candidate with or without preapproval, and shall disclose which defaults it used.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const expectNoPrompt = (context: ReturnType<typeof makeSetupSpecContext>): void => {
  expect(context.promptState.selectAgentsCalls).toEqual([]);
  expect(context.promptState.confirmInstructionSyncCalls).toEqual([]);
  expect(context.promptState.selectInstructionSourceCalls).toEqual([]);
  expect(context.promptState.confirmSetupPlanCalls).toEqual([]);
};

describe("Setup preview input resolution", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it.effect(
    "an interactive project preview asks nothing and presents one candidate with or without preapproval",
    () =>
      Effect.gen(function* () {
        // Detection finds an agent in the project, and an existing instruction
        // file is the seed the default source would take: both are the inputs
        // an interactive setup would otherwise ask about.
        const unapproved = makeSetupSpecContext({ flags: { nonInteractive: false } });
        const approved = makeSetupSpecContext({ flags: { nonInteractive: false } });
        cleanups.push(unapproved.cleanup, approved.cleanup);
        for (const context of [unapproved, approved]) {
          fs.mkdirSync(path.join(context.root, ".claude"), { recursive: true });
          fs.writeFileSync(path.join(context.root, "CLAUDE.md"), "# Existing\n\nKeep this.\n");
        }

        yield* handleSetup({ scope: "project", scopeExplicit: true, preview: true }).pipe(
          Effect.provide(unapproved.layer),
        );
        yield* handleSetup({
          scope: "project",
          scopeExplicit: true,
          preview: true,
          yes: true,
        }).pipe(Effect.provide(approved.layer));

        for (const context of [unapproved, approved]) {
          expectNoPrompt(context);
          expect(context.promptState.presentSetupPlanCalls[0]).toEqual(
            expect.arrayContaining([
              { target: "axm.json", action: "create", detail: "agents: claude-code" },
              { target: "AGENTS.md", action: "create", detail: "seeded from CLAUDE.md" },
            ]),
          );
          expect(context.exists("axm.json")).toBe(false);
          expect(context.exists("AGENTS.md")).toBe(false);
        }
        expect(approved.promptState.presentSetupPlanCalls).toEqual(
          unapproved.promptState.presentSetupPlanCalls,
        );
        expect(approved.rendererState.logs).toEqual(unapproved.rendererState.logs);
      }),
  );

  it.effect("an interactive user-scope preview asks nothing and writes nothing", () =>
    Effect.gen(function* () {
      const context = makeSetupSpecContext({ flags: { nonInteractive: false } });
      cleanups.push(context.cleanup);

      yield* handleSetup({ scope: "user", scopeExplicit: true, preview: true }).pipe(
        Effect.provide(context.layer),
      );

      expectNoPrompt(context);
      expect(context.promptState.presentSetupPlanCalls).toHaveLength(1);
      expect(fs.existsSync(path.join(context.userWorkspaceRoot, "axm.json"))).toBe(false);
      expect(fs.existsSync(path.join(context.home, ".axm"))).toBe(false);
    }),
  );

  it.effect("the machine result discloses the explicit request as the membership input", () =>
    Effect.gen(function* () {
      const context = makeSetupSpecContext({ machine: true, flags: { json: true } });
      cleanups.push(context.cleanup);

      yield* handleSetup({
        scope: "project",
        scopeExplicit: true,
        agents: ["codex"],
        preview: true,
      }).pipe(Effect.provide(context.layer));

      expect(context.rendererState.results[0]?.data).toMatchObject({
        result: {
          status: "preview",
          agents: [{ id: "codex", name: "Codex" }],
          previewDefaults: {
            agents: "explicit",
            instructions: { enabled: true, fileName: "AGENTS.md" },
          },
        },
      });
    }),
  );

  it.effect(
    "the machine result discloses detected membership when the project shows an agent",
    () =>
      Effect.gen(function* () {
        const context = makeSetupSpecContext({ machine: true, flags: { json: true } });
        cleanups.push(context.cleanup);
        fs.mkdirSync(path.join(context.root, ".claude"), { recursive: true });

        yield* handleSetup({ scope: "project", scopeExplicit: true, preview: true }).pipe(
          Effect.provide(context.layer),
        );

        expect(context.rendererState.results[0]?.data).toMatchObject({
          result: {
            status: "preview",
            agents: [{ id: "claude-code", name: "Claude Code" }],
            agentCandidates: expect.arrayContaining([
              expect.objectContaining({
                id: "claude-code",
                state: "selected",
                selectionReason: "project-detected",
              }),
            ]),
            previewDefaults: {
              agents: "detected",
              instructions: { enabled: true, fileName: "AGENTS.md" },
            },
          },
        });
      }),
  );

  it.effect(
    "the machine result discloses the catalog suggestion when nothing is detected, and no instruction default for user scope",
    () =>
      Effect.gen(function* () {
        const project = makeSetupSpecContext({ machine: true, flags: { json: true } });
        const user = makeSetupSpecContext({ machine: true, flags: { json: true } });
        cleanups.push(project.cleanup, user.cleanup);

        yield* handleSetup({ scope: "project", scopeExplicit: true, preview: true }).pipe(
          Effect.provide(project.layer),
        );
        yield* handleSetup({ scope: "user", scopeExplicit: true, preview: true }).pipe(
          Effect.provide(user.layer),
        );

        expect(project.rendererState.results[0]?.data).toMatchObject({
          result: {
            status: "preview",
            agentCandidates: expect.arrayContaining([
              expect.objectContaining({
                id: "claude-code",
                state: "selected",
                selectionReason: "catalog-suggestion",
              }),
            ]),
            previewDefaults: {
              agents: "suggested",
              instructions: { enabled: true, fileName: "AGENTS.md" },
            },
          },
        });
        expect(user.rendererState.results[0]?.data).toMatchObject({
          result: { status: "preview", scope: "user", previewDefaults: { agents: "suggested" } },
        });
        expect(user.rendererState.results[0]?.data).not.toMatchObject({
          result: { previewDefaults: { instructions: expect.anything() } },
        });
      }),
  );
});
