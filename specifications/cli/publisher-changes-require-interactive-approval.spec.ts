import * as fs from "node:fs";
import * as path from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import YAML from "yaml";

import {
  handleInstall,
  handleSkillsInstall,
  handleSkillsUpdate,
  handleSubagentsUpdate,
  LockfileSchema,
  handleUpdate,
} from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../support/install-harness.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
  type ProtectedStateSnapshot,
} from "../support/preview-purity.js";
import { makeSpecRegistry, type SpecRegistry } from "../support/registry-fixture.js";
import {
  writeRegistrySubagent,
  type RegistrySubagentVersion,
} from "../support/registry-subagent-fixture.js";

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
 * Root and typed Skill routes exercised over the shared Skill fixture.
 * Typed Subagent update has its own acquired-content controls below.
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

// The Subagent branch has its own manager and native document adapter. Start
// with real accepted content so a version-only update cannot satisfy trust.
const SUBAGENT = "researcher";
const UNRELATED_SUBAGENT = "unrelated-researcher";
const UNRELATED_BINDING = "hbnd_unrelated";
const UNRELATED = { version: "1.0.0", body: "Keep this independent research guidance." };
const SUBAGENT_CANONICAL = `agent_extensions/agentxm/@acme/subagents/${SUBAGENT}`;
const SUBAGENT_NATIVE = `.claude/agents/${SUBAGENT}.md`;
const decodeLockfile = Schema.decodeUnknownEffect(LockfileSchema);

const expectSubagentContent = (
  workspace: SpecWorkspace,
  name: string,
  publication: RegistrySubagentVersion,
): void => {
  const canonical = `agent_extensions/agentxm/@acme/subagents/${name}`;
  const manifest: unknown = JSON.parse(workspace.readFile(`${canonical}/subagent.json`));
  expect(manifest).toMatchObject({
    owner: "@acme",
    type: "subagent",
    name,
    version: publication.version,
  });
  expect(workspace.readFile(`${canonical}/src/${name}.md`)).toBe(
    `---\nname: ${name}\ndescription: The ${name} subagent.\n---\n\n${publication.body}\n`,
  );
  const native = workspace.readFile(`.claude/agents/${name}.md`);
  expect(native).toContain(`name: ${name}`);
  expect(native).toContain(publication.body);
};

/**
 * Keep every protected family and entry except the explicitly updated
 * canonical package and its native file. The lockfile is compared separately
 * after replacing only this Subagent's accepted row with its prior value.
 */
const outsideSubagentUpdate = (snapshot: ProtectedStateSnapshot): ProtectedStateSnapshot =>
  Object.fromEntries(
    Object.entries(snapshot)
      .filter(([root]) => root !== "axm-lock.yaml")
      .map(([root, entries]) => [
        root,
        Object.fromEntries(
          Object.entries(entries).filter(([entry]) => {
            const relative = entry === "." ? root : `${root}/${entry}`;
            return (
              relative !== SUBAGENT_CANONICAL &&
              !relative.startsWith(`${SUBAGENT_CANONICAL}/`) &&
              relative !== SUBAGENT_NATIVE
            );
          }),
        ),
      ]),
  );

describe("Publisher changes through typed Subagent update", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const acquiredThenRepublished = (interactive: boolean) =>
    Effect.gen(function* () {
      const registry = makeSpecRegistry();
      cleanups.push(registry.cleanup);
      writeRegistrySubagent(registry, SUBAGENT, [FIRST], ACCEPTED_BINDING);
      writeRegistrySubagent(registry, UNRELATED_SUBAGENT, [UNRELATED], UNRELATED_BINDING);
      const workspace = makeSpecWorkspace({
        machine: !interactive,
        flags: { json: !interactive, nonInteractive: !interactive },
        prompt: {
          confirmResponses: interactive ? [true] : [],
          onConfirmApplyChanges: (): void => {
            // The answer is still pending here. Neither the changed binding
            // nor any protected workspace write may precede that answer.
            expectSubagentContent(workspace, SUBAGENT, FIRST);
            const currentLock: unknown = YAML.parse(workspace.readLockfileText());
            expect(currentLock).toMatchObject({
              subagents: { [SUBAGENT]: { publisherBindingId: ACCEPTED_BINDING } },
            });
            expectProtectedStateUntouched({
              root: workspace.root,
              before,
              writes: workspace.writes,
            });
          },
        },
        recordWrites: true,
        settings: { agents: ["claude-code"], sources: [registry.source] },
        userSettings: { agents: [] },
      });
      cleanups.push(workspace.cleanup);
      for (const name of [SUBAGENT, UNRELATED_SUBAGENT]) {
        yield* handleInstall({
          source: Option.some(`@acme/subagents/${name}`),
          force: false,
          preview: false,
        }).pipe(Effect.provide(workspace.layer));
      }
      // First acceptance needs no publisher-change approval and produces real
      // canonical/native files before the Registry changes its publisher.
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      expectSubagentContent(workspace, SUBAGENT, FIRST);
      expectSubagentContent(workspace, UNRELATED_SUBAGENT, UNRELATED);
      const lockBefore = yield* decodeLockfile(YAML.parse(workspace.readLockfileText()));
      expect(lockBefore.subagents?.[SUBAGENT]).toMatchObject({
        type: "registry",
        owner: "@acme",
        name: SUBAGENT,
        resolvedVersion: FIRST.version,
        publisherBindingId: ACCEPTED_BINDING,
      });
      expect(lockBefore.subagents?.[UNRELATED_SUBAGENT]).toMatchObject({
        type: "registry",
        name: UNRELATED_SUBAGENT,
        publisherBindingId: UNRELATED_BINDING,
      });
      fs.writeFileSync(
        path.join(workspace.root, ".claude", "agents", "personal-notes.md"),
        "---\nname: personal-notes\ndescription: Personal notes.\n---\n\nKeep this unowned file exactly as written.\n",
      );
      writeRegistrySubagent(registry, SUBAGENT, [SECOND, FIRST], REPUBLISHED_BINDING);
      const before = snapshotProtectedState(workspace.root);
      workspace.writes.splice(0);
      workspace.rendererState.results.splice(0);
      return { workspace, before, lockBefore };
    });

  const updateSubagent = (workspace: SpecWorkspace) =>
    handleSubagentsUpdate({
      source: Option.none(),
      subagents: [],
      force: false,
      preview: false,
    }).pipe(Effect.provide(workspace.layer));

  it.effect(
    "unattended Subagent update preserves the accepted binding and all protected state",
    () =>
      Effect.gen(function* () {
        const { workspace, before, lockBefore } = yield* acquiredThenRepublished(false);

        yield* updateSubagent(workspace);

        expectProtectedStateUntouched({ root: workspace.root, before, writes: workspace.writes });
        expect(yield* decodeLockfile(YAML.parse(workspace.readLockfileText()))).toEqual(lockBefore);
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
              escape: {
                description: expect.stringContaining("Approve interactively"),
                cmd: expect.any(String),
              },
            },
          },
        });
        expect(JSON.stringify(entry?.data)).not.toContain("--yes");
        expectSubagentContent(workspace, SUBAGENT, FIRST);
        expect(workspace.readFile(SUBAGENT_NATIVE)).not.toContain(SECOND.body);
      }),
  );

  it.effect(
    "approved Subagent update records the new binding and content without changing unrelated state",
    () =>
      Effect.gen(function* () {
        const { workspace, before, lockBefore } = yield* acquiredThenRepublished(true);

        yield* updateSubagent(workspace);

        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toHaveLength(1);
        expect(workspace.rendererState.results.at(-1)?.data).toMatchObject({
          result: { outcome: "applied" },
        });
        const lockAfter = yield* decodeLockfile(YAML.parse(workspace.readLockfileText()));
        expect(lockAfter.subagents?.[SUBAGENT]).toMatchObject({
          type: "registry",
          owner: "@acme",
          name: SUBAGENT,
          resolvedVersion: SECOND.version,
          publisherBindingId: REPUBLISHED_BINDING,
        });
        expectSubagentContent(workspace, SUBAGENT, SECOND);
        expect(workspace.readFile(SUBAGENT_NATIVE)).not.toContain(FIRST.body);
        expect({
          ...lockAfter,
          subagents: { ...lockAfter.subagents, [SUBAGENT]: lockBefore.subagents?.[SUBAGENT] },
        }).toEqual(lockBefore);
        expect(outsideSubagentUpdate(snapshotProtectedState(workspace.root))).toEqual(
          outsideSubagentUpdate(before),
        );
        expectSubagentContent(workspace, UNRELATED_SUBAGENT, UNRELATED);
      }),
  );
});
