import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import {
  handleInstall,
  handleSkillsInstall,
  handleSkillsUpdate,
  handleUpdate,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../support/install-harness.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../support/preview-purity.js";
import { makeSpecRegistry, type SpecRegistry } from "../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/publisher-changes-require-interactive-approval",
  title: "Accepting a Registry extension from a different publisher needs a person's approval",
  statement:
    "When an apply would replace an accepted Registry binding with one published under a different publisher for the same extension, every route that can make that acceptance shall report the change in preview without changing anything, shall stop as approval required naming interactive approval when no prompt can open, and shall record the new binding only after a person approves it at a prompt; an acceptance under the same publisher, or a first acceptance, shall not be treated as such a change.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "cli/update/preview-is-pure",
    "cli/install/preview-is-pure",
    "cli/skills/update/preview-is-pure",
    "packages/cli/src/root/skills/update/handler.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const SKILL = "review";
const FQN = `@acme/skills/${SKILL}`;
const ACCEPTED_BINDING = "hbnd_test";
const REPUBLISHED_BINDING = "hbnd_other";
const CONDITION = "publisher-ownership-change";
const FIRST = { version: "1.0.0", body: "First guidance." };
const SECOND = { version: "2.0.0", body: "Second guidance." };

type SpecWorkspace = ReturnType<typeof makeSpecWorkspace>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Republish the skill's Registry index under a different publisher binding. */
const republishUnderBinding = (registry: SpecRegistry, name: string, binding: string): void => {
  const indexPath = path.join(registry.root, "extensions", "@acme", "skills", name, "index.json");
  const index: unknown = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  if (!isRecord(index)) throw new Error(`Registry index for ${name} is not an object`);
  fs.writeFileSync(
    indexPath,
    `${JSON.stringify({ ...index, publisherBindingId: binding }, null, 2)}\n`,
  );
};

const publisherCondition = expect.objectContaining({
  level: "confirmable",
  consent: "interactive-only",
  id: CONDITION,
});

/**
 * Every route that can accept a Registry binding for an already accepted
 * extension. Each runs the real handler over the given workspace.
 */
const affectedRoutes: ReadonlyArray<{
  readonly route: string;
  readonly run: (workspace: SpecWorkspace, preview: boolean) => Effect.Effect<unknown, unknown>;
}> = [
  {
    route: "skills update",
    run: (workspace, preview) =>
      handleSkillsUpdate({ source: Option.none(), skills: [], force: false, preview }).pipe(
        Effect.provide(workspace.layer),
      ),
  },
  {
    route: "update targeted at the extension",
    run: (workspace, preview) =>
      handleUpdate({ source: Option.some(FQN), force: false, preview }).pipe(
        Effect.provide(workspace.layer),
      ),
  },
  {
    route: "install --reinstall of the configured entry",
    run: (workspace, preview) =>
      handleInstall({ source: Option.some(FQN), force: true, preview }).pipe(
        Effect.provide(workspace.layer),
      ),
  },
  {
    route: "skills install of the same extension",
    run: (workspace, preview) =>
      handleSkillsInstall(
        { source: Option.some(FQN), skills: [], all: false },
        { force: false, preview },
      ).pipe(Effect.provide(workspace.layer)),
  },
];

describe("Publisher changes", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /**
   * A workspace that accepted the skill under one publisher binding, after
   * which the Registry republishes it — newer version first, as the index
   * orders versions — under another binding.
   */
  const acceptedThenRepublished = (options: Parameters<typeof makeSpecWorkspace>[0]) =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill(SKILL, [FIRST]);
      const workspace = makeSpecWorkspace({
        ...options,
        recordWrites: true,
        settings: { sources: [registry.source] },
      });
      cleanups.push(workspace.cleanup);
      yield* handleInstall({ source: Option.some(FQN), force: false, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      expect(workspace.readLockfileText()).toContain(`publisherBindingId: ${ACCEPTED_BINDING}`);
      registry.writeSkill(SKILL, [SECOND, FIRST]);
      republishUnderBinding(registry, SKILL, REPUBLISHED_BINDING);
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);
      return { registry, workspace, before };
    });

  const machine = { machine: true, flags: { json: true } } as const;

  it.effect.each(affectedRoutes)(
    "$route reports the publisher change in preview and changes nothing",
    ({ run }) =>
      Effect.gen(function* () {
        const { workspace, before } = yield* acceptedThenRepublished(machine);

        yield* run(workspace, true);

        expectProtectedStateUntouched({ root: workspace.root, before, writes: workspace.writes });
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
        const [entry] = workspace.rendererState.results;
        expect(entry?.data).toMatchObject({
          result: {
            outcome: "previewed",
            riskConditions: expect.arrayContaining([publisherCondition]),
          },
        });
        expect(workspace.readLockfileText()).toContain(`publisherBindingId: ${ACCEPTED_BINDING}`);
      }),
  );

  it.effect.each(affectedRoutes)(
    "$route stops as approval required naming interactive approval when no prompt can open",
    ({ run }) =>
      Effect.gen(function* () {
        const { workspace, before } = yield* acceptedThenRepublished(machine);

        yield* run(workspace, false);

        expectProtectedStateUntouched({ root: workspace.root, before, writes: workspace.writes });
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
        const [entry] = workspace.rendererState.results;
        expect(entry?.ok).toBe(false);
        expect(entry?.data).toMatchObject({
          result: {
            outcome: "blocked",
            counts: { committed: 0 },
            blocking: {
              class: "approval-required",
              subject: CONDITION,
              detail: expect.stringContaining("Interactive approval is required"),
              escape: { description: expect.stringContaining("Approve interactively") },
            },
          },
        });
        expect(JSON.stringify(entry?.data)).not.toContain("--yes");
        expect(workspace.readLockfileText()).toContain(`publisherBindingId: ${ACCEPTED_BINDING}`);
      }),
  );

  it.effect.each(affectedRoutes)(
    "$route records the new binding only after a person approves at a prompt",
    ({ run }) =>
      Effect.gen(function* () {
        const { workspace } = yield* acceptedThenRepublished({
          machine: false,
          flags: { nonInteractive: false, json: false },
          prompt: { confirmResponses: [true] },
        });

        yield* run(workspace, false);

        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toHaveLength(1);
        expect(workspace.rendererState.results.at(-1)?.data).toMatchObject({
          result: { outcome: "applied" },
        });
        expect(workspace.readLockfileText()).toContain(
          `publisherBindingId: ${REPUBLISHED_BINDING}`,
        );
        expect(workspace.readLockfileText()).not.toContain(
          `publisherBindingId: ${ACCEPTED_BINDING}`,
        );
      }),
  );

  it.effect("a newer version from the same publisher is accepted without any approval", () =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill(SKILL, [FIRST]);
      const workspace = makeSpecWorkspace({ ...machine, settings: { sources: [registry.source] } });
      cleanups.push(workspace.cleanup);
      yield* handleInstall({ source: Option.some(FQN), force: false, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );
      registry.writeSkill(SKILL, [SECOND, FIRST]);
      workspace.rendererState.results.splice(0);

      yield* handleSkillsUpdate({
        source: Option.none(),
        skills: [],
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));

      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: { outcome: "applied", counts: { committed: 1 } },
      });
      expect(JSON.stringify(entry?.data)).not.toContain(CONDITION);
      expect(workspace.readLockfileText()).toContain("resolvedVersion: 2.0.0");
      expect(workspace.readLockfileText()).toContain(`publisherBindingId: ${ACCEPTED_BINDING}`);
    }),
  );

  it.effect("a first acceptance binds the publisher without any approval", () =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill(SKILL, [FIRST]);
      const workspace = makeSpecWorkspace({ ...machine, settings: { sources: [registry.source] } });
      cleanups.push(workspace.cleanup);

      yield* handleInstall({ source: Option.some(FQN), force: false, preview: false }).pipe(
        Effect.provide(workspace.layer),
      );

      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.data).toMatchObject({
        result: { outcome: "applied", counts: { committed: 1 } },
      });
      expect(JSON.stringify(entry?.data)).not.toContain(CONDITION);
      expect(workspace.readLockfileText()).toContain(`publisherBindingId: ${ACCEPTED_BINDING}`);
    }),
  );
});
