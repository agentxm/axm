import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { defineSpecification } from "@agentxm/specification-metadata";

import { makeSetupFixture, type SetupFixture } from "../testing.js";
import { runSetup } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/setup/preview-resolves-inputs-without-prompts",
  title: "A setup preview resolves every input it would otherwise ask about, and says how",
  statement:
    "When setup runs in preview mode, it shall resolve every input an interactive run would ask about — the coding agents to configure and the instruction source to use — without raising a prompt, shall present the same candidate whether or not the request preapproved it, and shall name how each default was chosen.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: ["cli/setup/preview-is-pure"],
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

describe("Setup preview input resolution", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const fixture = (): SetupFixture => {
    const created = makeSetupFixture();
    cleanups.push(created.cleanup);
    return created;
  };

  const request = (
    created: SetupFixture,
    over: {
      readonly scope?: "project" | "user";
      readonly agents?: ReadonlyArray<string>;
      readonly yes?: boolean;
    } = {},
  ) => ({
    scope: "project" as const,
    scopeExplicit: true,
    preview: true,
    nonInteractive: false,
    projectRoot: decodeAbsolutePathSync(created.root),
    telemetryEnabled: false,
    ...over,
  });

  it.effect(
    "an interactive project preview asks nothing and presents one candidate with or without preapproval",
    () => {
      // Detection finds an agent in the project, and an existing instruction
      // file is the seed the default source would take: both are the inputs an
      // interactive setup would otherwise ask about.
      const unapproved = fixture();
      const approved = fixture();
      for (const created of [unapproved, approved]) {
        fs.mkdirSync(path.join(created.root, ".claude"), { recursive: true });
        created.writeFile("CLAUDE.md", "# Existing\n\nKeep this.\n");
      }

      return Effect.gen(function* () {
        yield* unapproved.provide(runSetup(request(unapproved)));
        yield* approved.provide(runSetup(request(approved, { yes: true })));

        for (const created of [unapproved, approved]) {
          expectNoPrompt(created);
          expect(created.promptState().presentSetupPlanCalls[0]).toEqual(
            expect.arrayContaining([
              { target: "axm.json", action: "create", detail: "agents: claude-code" },
              { target: "AGENTS.md", action: "create", detail: "seeded from CLAUDE.md" },
            ]),
          );
          expect(created.exists("axm.json")).toBe(false);
          expect(created.exists("AGENTS.md")).toBe(false);
        }
        expect(approved.promptState().presentSetupPlanCalls).toEqual(
          unapproved.promptState().presentSetupPlanCalls,
        );
      }).pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("an interactive user-scope preview asks nothing and writes nothing", () => {
    const created = fixture();
    return created
      .provide(
        Effect.gen(function* () {
          yield* runSetup(request(created, { scope: "user" }));

          expectNoPrompt(created);
          expect(created.promptState().presentSetupPlanCalls).toHaveLength(1);
          expect(fs.existsSync(path.join(created.home, ".axm", "workspace", "axm.json"))).toBe(
            false,
          );
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("the preview discloses the explicit request as the membership input", () => {
    const created = fixture();
    return created
      .provide(
        Effect.gen(function* () {
          const settled = yield* runSetup(request(created, { agents: ["codex"] }));

          expect(settled).toMatchObject({
            outcome: {
              status: "preview",
              agents: [{ id: "codex", name: "Codex" }],
              agentCandidates: expect.arrayContaining([
                expect.objectContaining({
                  id: "codex",
                  state: "selected",
                  selectionReason: "explicit",
                }),
              ]),
              instructions: { enabled: true, fileName: "AGENTS.md" },
            },
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("the preview discloses detected membership when the project shows an agent", () => {
    const created = fixture();
    fs.mkdirSync(path.join(created.root, ".claude"), { recursive: true });
    return created
      .provide(
        Effect.gen(function* () {
          const settled = yield* runSetup(request(created));

          expect(settled).toMatchObject({
            outcome: {
              status: "preview",
              agents: [{ id: "claude-code", name: "Claude Code" }],
              agentCandidates: expect.arrayContaining([
                expect.objectContaining({
                  id: "claude-code",
                  state: "selected",
                  selectionReason: "project-detected",
                }),
              ]),
              instructions: { enabled: true, fileName: "AGENTS.md" },
            },
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "the preview discloses the catalog suggestion when nothing is detected, and no instruction default for user scope",
    () => {
      const project = fixture();
      const user = fixture();

      return Effect.gen(function* () {
        const projectSettled = yield* project.provide(runSetup(request(project)));
        const userSettled = yield* user.provide(runSetup(request(user, { scope: "user" })));

        expect(projectSettled).toMatchObject({
          outcome: {
            status: "preview",
            agentCandidates: expect.arrayContaining([
              expect.objectContaining({
                id: "claude-code",
                state: "selected",
                selectionReason: "catalog-suggestion",
              }),
            ]),
            instructions: { enabled: true, fileName: "AGENTS.md" },
          },
        });
        expect(userSettled).toMatchObject({ outcome: { status: "preview", scope: "user" } });
        expect(userSettled).not.toMatchObject({
          outcome: { instructions: expect.anything() },
        });
      }).pipe(Effect.provide(NodeServices.layer));
    },
  );
});
