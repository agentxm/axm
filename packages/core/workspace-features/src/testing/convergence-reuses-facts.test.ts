import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  freezeProjectionFacts,
  makeProjectionInvariantFact,
  projectionParticipantSelectionKey,
  WorkspaceInvariantFacts,
  type ProjectionInvariantFact,
} from "@agentxm/workspace-kernel/projection";
import {
  CurrentWorkspaceReadPhase,
  formatDesiredIdentity,
  type DesiredStateGraph,
} from "@agentxm/workspace-kernel/workspace-state";
import { makeAxmSkillCompatibilityPolicyLayer } from "@agentxm/cli-maintenance/official-skill/composition";
import { lintSelectedSubjects } from "../linting/index.js";
import { SyncWorkspace } from "../sync/index.js";
import {
  assessCapturedCheck,
  captureLocalCheck,
  checkLocal,
  type LocalCheckRequest,
} from "../inspection/index.js";
import { applySync, expectResolved, makeSyncFixture } from "./sync-fixture.js";

// The checks a check runs when none are named.
const defaultChecks: LocalCheckRequest["checks"] = [
  "compatibility",
  "ownership",
  "lint",
  "convergence",
];

const owners = {
  lint: lintSelectedSubjects,
  convergence: SyncWorkspace.assessLocalMaterialization,
};

/** The pre-reuse composition: convergence never receives check's facts. */
const recomputingOwners = {
  lint: lintSelectedSubjects,
  convergence: (selection: Parameters<typeof SyncWorkspace.assessLocalMaterialization>[0]) =>
    SyncWorkspace.assessLocalMaterialization(selection),
};

const rule = (name: string) => ({
  [`rules/${name}/rule.json`]: JSON.stringify({
    type: "rule",
    name,
    owner: "@acme",
    version: "1.0.0",
    title: name,
    description: `The ${name} rule`,
  }),
  [`rules/${name}/src/RULE.md`]: `Follow the ${name} rule.\n`,
});

const skill = (name: string) => ({
  [`skills/${name}/skill.json`]: JSON.stringify({
    type: "skill",
    owner: "@acme",
    name,
    version: "1.0.0",
    description: `The ${name} skill`,
  }),
  [`skills/${name}/src/SKILL.md`]: `---\nname: ${name}\ndescription: The ${name} skill\n---\n# ${name}\n`,
});

const subagent = (name: string) => ({
  [`subagents/${name}/subagent.json`]: JSON.stringify({
    type: "subagent",
    owner: "@acme",
    name,
    version: "1.0.0",
    description: `The ${name} subagent`,
    core: { instructions: "core.md" },
  }),
  [`subagents/${name}/core.md`]: `Help as the ${name} subagent.\n`,
});

const twoRules = () =>
  makeSyncFixture({
    settings: {
      owner: "@acme",
      agents: ["claude-code"],
      rules: { review: { source: "workspace" }, style: { source: "workspace" } },
    },
    files: { ...rule("review"), ...rule("style") },
  });

const oneSkill = () =>
  makeSyncFixture({
    settings: {
      owner: "@acme",
      agents: ["claude-code"],
      skills: { review: { source: "workspace" } },
    },
    files: skill("review"),
  });

const ruleCheck: LocalCheckRequest = {
  selection: { kind: "identities", identities: ["review"] },
  types: ["rule"],
  checks: defaultChecks,
  strict: false,
};

const skillCheck: LocalCheckRequest = {
  selection: { kind: "identities", identities: ["review"] },
  checks: defaultChecks,
  strict: false,
};

/**
 * Count projection-fact evaluations at the facts owner; `extra` lets a control
 * add a synthetic fact to every evaluation.
 */
const countingFacts = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  extra: (graph: DesiredStateGraph) => ReadonlyArray<ProjectionInvariantFact> = () => [],
) =>
  Effect.gen(function* () {
    const live = yield* WorkspaceInvariantFacts;
    const calls: Array<ReadonlyArray<string> | undefined> = [];
    const value = yield* effect.pipe(
      Effect.provideService(WorkspaceInvariantFacts, {
        ...live,
        projectionFactsForGraph: (graph, subjects) =>
          Effect.suspend(() => {
            calls.push(subjects?.map(({ type, name }) => `${type}:${name}`));
            return live
              .projectionFactsForGraph(graph, subjects)
              .pipe(Effect.map((facts) => [...facts, ...extra(graph)]));
          }),
      }),
    );
    return { value, calls };
  });

const inWorkspace = <A, E, R>(
  workspace: ReturnType<typeof makeSyncFixture>,
  effect: Effect.Effect<A, E, R>,
) =>
  workspace
    .provide(effect)
    .pipe(
      Effect.provide(
        Layer.merge(NodeServices.layer, makeAxmSkillCompatibilityPolicyLayer("1.0.0")),
      ),
      Effect.ensuring(Effect.sync(workspace.cleanup)),
    );

describe("check convergence and projection facts", () => {
  it.effect("a scoped rule check evaluates projection facts once for check and convergence", () => {
    const workspace = twoRules();
    return inWorkspace(
      workspace,
      Effect.gen(function* () {
        const request = { ...ruleCheck, userHome: workspace.home };
        const { value: captured, calls } = yield* countingFacts(captureLocalCheck(request, owners));
        expect(calls).toEqual([["rule:review"]]);
        expect(captured.convergence !== undefined && Result.isSuccess(captured.convergence)).toBe(
          true,
        );
        expect(
          assessCapturedCheck(captured, request).assessments.find(
            ({ kind }) => kind === "convergence",
          )?.conclusion,
        ).toBe("attention-required");
        // The facts both consumers share cannot be changed by either.
        expect(Object.isFrozen(captured.projectionFacts)).toBe(true);
        expect(captured.projectionFacts.every((fact) => Object.isFrozen(fact.observation))).toBe(
          true,
        );
        const reused = JSON.stringify(yield* checkLocal(request, owners));
        const recomputed = JSON.stringify(yield* checkLocal(request, recomputingOwners));
        expect(reused).toBe(recomputed);
      }),
    );
  });

  it.effect("a scoped rule check of a synchronized workspace reports current output", () => {
    const workspace = twoRules();
    return inWorkspace(
      workspace,
      Effect.gen(function* () {
        expectResolved(yield* applySync());
        const request = { ...ruleCheck, userHome: workspace.home };
        const { value: document, calls } = yield* countingFacts(checkLocal(request, owners));
        expect(calls).toEqual([["rule:review"]]);
        expect(document.verdict.ok).toBe(true);
        expect(document.reconciliation).toEqual([]);
        expect(JSON.stringify(document)).toBe(
          JSON.stringify(yield* checkLocal(request, recomputingOwners)),
        );
      }),
    );
  });

  it.effect("a one-skill check evaluates projection facts once for check and convergence", () => {
    const workspace = oneSkill();
    return inWorkspace(
      workspace,
      Effect.gen(function* () {
        const request = { ...skillCheck, userHome: workspace.home };
        const { value: document, calls } = yield* countingFacts(checkLocal(request, owners));
        expect(calls).toEqual([["skill:review"]]);
        expect(document.failedOwners).toEqual([]);
        expect(JSON.stringify(document)).toBe(
          JSON.stringify(yield* checkLocal(request, recomputingOwners)),
        );
      }),
    );
  });

  it.effect("an unfiltered check observes every participant and reports an obsolete region", () => {
    const skills = { review: { source: "workspace" } };
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        rules: { review: { source: "workspace" }, style: { source: "workspace" } },
        skills,
      },
      files: { ...rule("review"), ...rule("style"), ...skill("review") },
    });
    return inWorkspace(
      workspace,
      Effect.gen(function* () {
        expectResolved(yield* applySync());
        const request: LocalCheckRequest & { readonly userHome: string } = {
          selection: { kind: "all" },
          checks: defaultChecks,
          strict: false,
          userHome: workspace.home,
        };
        const capture = Effect.gen(function* () {
          const received: Array<unknown> = [];
          const assessed: Array<ProjectionInvariantFact> = [];
          const { value: captured, calls } = yield* countingFacts(
            captureLocalCheck(request, {
              ...owners,
              convergence: (...args: Parameters<typeof owners.convergence>) => {
                received.push(args[1]);
                return owners
                  .convergence(...args)
                  .pipe(
                    Effect.tap(({ projectionFacts }) =>
                      Effect.sync(() => assessed.push(...projectionFacts)),
                    ),
                  );
              },
            }),
          );
          return {
            calls,
            received,
            conclusion: assessCapturedCheck(captured, request).assessments.find(
              ({ kind }) => kind === "convergence",
            )?.conclusion,
            // The leftover region is evidence the unfiltered evaluation alone can see.
            staleRuleFacts: assessed.filter(
              ({ subject, observation }) =>
                subject.unitId.startsWith("rule:") && observation.status !== "current",
            ).length,
          };
        });
        // Everything declared is synchronized, so nothing else draws attention.
        const synchronized = yield* capture;
        expect(synchronized.conclusion).toBe("satisfied");
        expect(synchronized.staleRuleFacts).toBe(0);
        // The rules leave the declaration; their AXM region stays in the native file.
        workspace.writeSettings({ owner: "@acme", agents: ["claude-code"], skills });
        const obsolete = yield* capture;
        // Check's declared facts are scoped; convergence's are not, so both run.
        expect(obsolete.calls).toHaveLength(2);
        expect(obsolete.calls[0]).toContain("skill:review");
        expect(obsolete.calls[1]).toBeUndefined();
        expect(obsolete.received).toEqual([undefined]);
        expect(obsolete.staleRuleFacts).toBeGreaterThan(0);
        expect(obsolete.conclusion).toBe("attention-required");
      }),
    );
  });

  it.effect.each([
    {
      joined: "style",
      subjects: ["rule:review", "rule:style"],
      calls: [["rule:review"]],
    },
    {
      joined: "helper",
      subjects: ["rule:review", "subagent:helper"],
      calls: [["rule:review"], ["rule:review", "subagent:helper"]],
    },
  ])("an expanded scope joining $joined reuses facts only for the same selection", (example) => {
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        rules: { review: { source: "workspace" }, style: { source: "workspace" } },
        subagents: { helper: { source: "workspace" } },
      },
      files: { ...rule("review"), ...rule("style"), ...subagent("helper") },
    });
    return inWorkspace(
      workspace,
      Effect.gen(function* () {
        const request = { ...ruleCheck, userHome: workspace.home };
        // A synthetic shared unit makes the joined subject a required contributor of the rule.
        const { value: captured, calls } = yield* countingFacts(
          captureLocalCheck(request, owners),
          (graph) => {
            const contributors = graph.nodes
              .filter(({ name }) => name === "review" || name === example.joined)
              .map(({ identity }) => formatDesiredIdentity(identity))
              .sort();
            return [
              {
                predicate: "workspace/projection-current",
                subject: { unitId: "hook:agent-hook-entries", path: "shared", scope: "project" },
                authority: { source: "desired-state-graph", contributors },
                observation: { status: "current", contributors },
                expectation: { status: "current", contributors },
              },
            ];
          },
        );
        expect(captured.scope.subjects.map(({ type, name }) => `${type}:${name}`)).toEqual(
          example.subjects,
        );
        expect(calls).toEqual(example.calls);
      }),
    );
  });

  it.effect("convergence recomputes when check's read phase ended before it ran", () => {
    const workspace = twoRules();
    return inWorkspace(
      workspace,
      Effect.gen(function* () {
        const request = { ...ruleCheck, userHome: workspace.home };
        const { value: captured, calls } = yield* countingFacts(
          captureLocalCheck(request, {
            ...owners,
            convergence: (...args: Parameters<typeof owners.convergence>) =>
              Effect.gen(function* () {
                (yield* CurrentWorkspaceReadPhase)?.close();
                return yield* owners.convergence(...args);
              }),
          }),
        );
        expect(calls).toEqual([["rule:review"], ["rule:review"]]);
        expect(captured.convergence !== undefined && Result.isSuccess(captured.convergence)).toBe(
          true,
        );
      }),
    );
  });

  it.effect("an empty declared scope evaluates nothing and hands convergence nothing", () => {
    const workspace = makeSyncFixture({ files: { "notes.md": "Unmanaged notes\n" } });
    return inWorkspace(
      workspace,
      Effect.gen(function* () {
        const received: Array<unknown> = [];
        const { calls } = yield* countingFacts(
          captureLocalCheck(
            {
              selection: { kind: "paths", paths: ["notes.md"] },
              checks: defaultChecks,
              strict: false,
              userHome: workspace.home,
            },
            {
              ...owners,
              convergence: (...args: Parameters<typeof owners.convergence>) => {
                received.push(args[1]);
                return owners.convergence(...args);
              },
            },
          ),
        );
        expect(received).toEqual([undefined]);
        expect(calls).toEqual([[]]);
      }),
    );
  });
});

describe("projection participant selection key", () => {
  it("ignores order, repetition, and the names of aggregate contributors", () => {
    expect(
      projectionParticipantSelectionKey([
        { type: "rule", name: "review" },
        { type: "hook", name: "audit" },
      ]),
    ).toBe(
      projectionParticipantSelectionKey([
        { type: "hook", name: "check" },
        { type: "rule", name: "style" },
        { type: "rule", name: "review" },
      ]),
    );
  });

  it("distinguishes contributor types and subagent names", () => {
    const rules = projectionParticipantSelectionKey([{ type: "rule", name: "review" }]);
    expect(projectionParticipantSelectionKey([{ type: "skill", name: "review" }])).not.toBe(rules);
    expect(
      projectionParticipantSelectionKey([
        { type: "rule", name: "review" },
        { type: "subagent", name: "helper" },
      ]),
    ).not.toBe(
      projectionParticipantSelectionKey([
        { type: "rule", name: "review" },
        { type: "subagent", name: "planner" },
      ]),
    );
  });
});

describe("freezeProjectionFacts", () => {
  it("freezes every nested value of the facts it returns", () => {
    const facts = freezeProjectionFacts([
      makeProjectionInvariantFact(
        {
          unitId: "rule:instructions-region",
          path: "AGENTS.md#rules",
          present: true,
          current: false,
          expectedContributors: ["@acme/rules/review"],
          observedContributors: [],
          exclusions: [{ contributor: "@acme/rules/style", reason: "package-missing" }],
        },
        "project",
      ),
    ]);
    expect(Object.isFrozen(facts)).toBe(true);
    expect(Object.isFrozen(facts[0]?.authority.contributors)).toBe(true);
    expect(Object.isFrozen(facts[0]?.observation.exclusions?.[0])).toBe(true);
  });
});
