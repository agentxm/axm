import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  expectAppliedPlanResult,
  expectNoOpPlanResult,
  expectPreviewedPlanResult,
  extensionName,
  handleSubagentsNew,
  handleSync,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../../support/install-harness.js";
import { planTargetPaths } from "../../../support/plan-targets.js";

export const specification = defineSpecification({
  requirement: "cli/subagents/new/scaffolds-for-every-configured-agent",
  title: "A new subagent is scaffolded and rendered for every configured agent",
  statement:
    "When a subagent is created, AXM shall create its manifest, content, and enabled settings entry together, shall render it for every configured agent that can represent it, shall list the same targets in preview and apply, and a following reconciliation shall report no change.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "agent-interoperability", "safe-repetition"],
  status: "accepted",
  methods: ["example"],
  derivedFrom: [
    "cli/sync/realizes-desired-state",
    "cli/install/preview-is-pure",
    "packages/cli/src/root/subagents/new/handler.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [
    "Claude Code and Cursor both render project-scope subagents into distinct directories, so two rendered files observe two configured agents.",
  ],
  openQuestions: [
    "Whether the creation result should list each agent's rendered file as a target, as skill creation lists agent locations, is unresolved; this specification requires only that preview and apply agree and that every configured agent receives its rendering.",
  ],
});

const SUBAGENT = "reviewer";
const AUTHORED_ROOT = `subagents/${SUBAGENT}`;
const AGENT_RENDERINGS = [`.claude/agents/${SUBAGENT}.md`, `.cursor/agents/${SUBAGENT}.md`];

type SpecWorkspace = ReturnType<typeof makeSpecWorkspace>;

describe("Creating a subagent", () => {
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

  const createSubagent = (target: SpecWorkspace, preview: boolean) =>
    handleSubagentsNew({
      name: extensionName(SUBAGENT),
      owner: Option.none(),
      yes: true,
      preview,
    }).pipe(Effect.provide(target.layer));

  it.effect("records the manifest, content, and enabled settings entry together", () =>
    Effect.gen(function* () {
      const created = workspace();

      yield* createSubagent(created, false);

      expectAppliedPlanResult(created.rendererState.results.at(-1)?.data, {
        planName: "New subagent",
      });
      const manifest: unknown = JSON.parse(created.readFile(`${AUTHORED_ROOT}/subagent.json`));
      expect(manifest).toMatchObject({ owner: "@acme", type: "subagent", name: SUBAGENT });
      expect(created.readFile(`${AUTHORED_ROOT}/src/${SUBAGENT}.md`)).toContain(
        `name: ${SUBAGENT}`,
      );
      expect(created.readSettings()).toMatchObject({
        subagents: { [SUBAGENT]: expect.anything() },
      });
      expect(JSON.stringify(created.readSettings())).not.toContain('"enabled":false');
    }),
  );

  it.effect("renders the subagent for every configured agent", () =>
    Effect.gen(function* () {
      const created = workspace();

      yield* createSubagent(created, false);

      for (const rendering of AGENT_RENDERINGS) {
        expect(created.exists(rendering), rendering).toBe(true);
        expect(created.readFile(rendering)).toContain(`name: ${SUBAGENT}`);
      }
    }),
  );

  it.effect("previews exactly the targets that apply realizes", () =>
    Effect.gen(function* () {
      const created = workspace();

      yield* createSubagent(created, true);
      const previewed = created.rendererState.results.at(-1)?.data;
      expectPreviewedPlanResult(previewed, { planName: "New subagent", totalSteps: 1 });
      expect(created.exists(AUTHORED_ROOT)).toBe(false);
      for (const rendering of AGENT_RENDERINGS) {
        expect(created.exists(rendering), rendering).toBe(false);
      }

      yield* createSubagent(created, false);
      const applied = created.rendererState.results.at(-1)?.data;

      expect(planTargetPaths(applied)).toEqual(planTargetPaths(previewed));
    }),
  );

  it.effect("a following reconciliation reports no change", () =>
    Effect.gen(function* () {
      const created = workspace();
      yield* createSubagent(created, false);

      yield* handleSync({ preview: false }).pipe(Effect.provide(created.layer));

      expectNoOpPlanResult(created.rendererState.results.at(-1)?.data, {
        planName: "Sync workspace",
      });
    }),
  );
});
