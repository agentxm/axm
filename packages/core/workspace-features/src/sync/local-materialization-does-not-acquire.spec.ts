import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { SourceHostProviders } from "@agentxm/workspace-kernel/sources";
import { defineSpecification } from "@agentxm/specification-metadata";
import { SyncWorkspace } from "./index.js";
import { makeSyncFixture } from "../testing/sync-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/check/local-materialization-does-not-acquire",
  title: "Local materialization assessment does not acquire missing content",
  statement:
    "Local materialization assessment shall retain unavailable selected source evidence as unassessed without fetching content or applying planned changes, and a subsequent invocation shall observe newly available local content.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Production planning reads a native temporary workspace; independent file snapshots establish preservation and a source-provider guard refuses acquisition. This does not establish whole-process network silence.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

it.effect(
  "preserves missing source state and observes authored content on a fresh invocation",
  () => {
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        skills: { review: { source: "workspace" } },
      },
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const providers = yield* SourceHostProviders;
          let fetches = 0;
          const assess = () =>
            SyncWorkspace.assessLocalMaterialization({
              target: Option.none(),
              types: [],
              subjects: [{ type: "skill", name: "review" }],
            }).pipe(
              Effect.provideService(SourceHostProviders, {
                ...providers,
                fetch: () =>
                  Effect.sync(() => {
                    fetches++;
                  }).pipe(Effect.andThen(Effect.die("Local assessment attempted acquisition"))),
              }),
            );
          const before = workspace.snapshot();
          const missing = yield* assess();
          expect(missing.unassessed).toEqual([
            expect.objectContaining({ type: "skill", name: "review" }),
          ]);
          expect(workspace.snapshot()).toEqual(before);
          workspace.writeFile(
            "skills/review/skill.json",
            JSON.stringify({
              type: "skill",
              owner: "@acme",
              name: "review",
              version: "1.0.0",
              description: "Review code",
            }),
          );
          workspace.writeFile(
            "skills/review/src/SKILL.md",
            "---\nname: review\ndescription: Review code\n---\n# Review\n",
          );
          const authored = workspace.snapshot();
          const available = yield* assess();
          expect(available.unassessed).toEqual([]);
          expect(available.steps.length).toBeGreaterThan(0);
          expect(workspace.snapshot()).toEqual(authored);
          expect(fetches).toBe(0);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(workspace.cleanup)));
  },
);
