import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as FileSystem from "effect/FileSystem";
import type * as Scope from "effect/Scope";
import type * as Path from "effect/Path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import YAML from "yaml";

import { LockfileSchema } from "@agentxm/workspace-state";
import {
  deriveOperationOutcome,
  countUnitStates,
  previewPlanExecution,
  type OperationResolution,
  type PlanExecution,
} from "@agentxm/workspace-operations";
import { interactiveOnlyPlanExecution } from "@agentxm/workspace-operations/testing";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  makeLifecycleFixture,
  makeLifecycleRegistry,
  type LifecycleFixture,
  type LifecycleRegistry,
  type RegistrySkillVersion,
  type RegistrySubagentVersion,
} from "./testing.js";
import { InstallExtensions, type InstallExtensionsRequest } from "./install/install-extensions.js";
import { installRequest } from "./install/test-helpers.js";
import { UpdateExtensions, type UpdateRequest } from "./update/update-extensions.js";
import { configuredUpdateRequest, targetedUpdateRequest } from "./update/test-helpers.js";

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
const FIRST: RegistrySkillVersion = { version: "1.0.0", body: "First guidance." };
const SECOND: RegistrySkillVersion = { version: "2.0.0", body: "Second guidance." };

const decodeLockfile = Schema.decodeUnknownEffect(LockfileSchema);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Republish an extension's Registry index under a different publisher binding. */
const republishUnderBinding = (
  registry: LifecycleRegistry,
  plural: string,
  name: string,
  binding: string,
): void => {
  const indexPath = nodePath.join(registry.root, "extensions", "@acme", plural, name, "index.json");
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

/** No route that can accept a publisher change offers a preapproval flag. */
const interactiveOnlyApply: PlanExecution = interactiveOnlyPlanExecution({
  command: ["update"],
  arguments: [],
});

const resolveInstall = (request: InstallExtensionsRequest, execution: PlanExecution) =>
  Effect.gen(function* () {
    const candidate = yield* InstallExtensions.prepare(request);
    return yield* InstallExtensions.previewOrApply(candidate, execution);
  });

const resolveUpdate = (request: UpdateRequest, execution: PlanExecution) =>
  Effect.gen(function* () {
    const candidate = yield* UpdateExtensions.prepare(request);
    if (candidate.outcome === "nothing-configured") {
      throw new Error(`Expected an operation to resolve: ${candidate.message}`);
    }
    return yield* UpdateExtensions.previewOrApply(candidate, execution);
  });

/**
 * Every route that can accept a Registry binding for an already-accepted
 * extension. They differ in how the subject is named, not in what accepting
 * it means, so the rule is shown once over all four.
 */
const affectedRoutes: ReadonlyArray<{
  readonly route: string;
  /**
   * Runs the route inside the fixture's own service composition, so each
   * entry erases its route-specific requirements at the same boundary and
   * the table stays one uniform shape.
   */
  readonly run: (
    workspace: LifecycleFixture,
    execution: PlanExecution,
  ) => Effect.Effect<OperationResolution, unknown, FileSystem.FileSystem | Path.Path | Scope.Scope>;
}> = [
  {
    route: "skills update",
    run: (workspace, execution) =>
      workspace.provide(resolveUpdate(configuredUpdateRequest({ type: "skill" }), execution)),
  },
  {
    route: "update targeted at the extension",
    run: (workspace, execution) =>
      workspace.provide(resolveUpdate(targetedUpdateRequest({ source: FQN }), execution)),
  },
  {
    route: "install --reinstall of the configured entry",
    run: (workspace, execution) =>
      workspace.provide(
        resolveInstall(
          installRequest({ subject: { kind: "source", source: FQN }, reinstall: true }),
          execution,
        ),
      ),
  },
  {
    route: "skills install of the same extension",
    run: (workspace, execution) =>
      workspace.provide(
        resolveInstall(
          installRequest({ type: "skill", subject: { kind: "source", source: FQN } }),
          execution,
        ),
      ),
  },
];

describe("Publisher changes", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /**
   * A workspace that accepted the skill under one publisher binding, after
   * which the Registry republishes it — newer version first, as the index
   * orders versions — under another binding.
   */
  const acceptedThenRepublished = (options: Parameters<typeof makeLifecycleFixture>[0] = {}) =>
    Effect.gen(function* () {
      const registry = makeLifecycleRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill(SKILL, [FIRST]);
      const workspace = makeLifecycleFixture({
        ...options,
        sources: "live",
        settings: {
          owner: "@acme",
          agents: ["claude-code"],
          sources: [registry.source],
          ...options.settings,
        },
      });
      cleanups.push(workspace.cleanup);
      yield* workspace.provide(
        resolveInstall(
          installRequest({ subject: { kind: "source", source: FQN } }),
          interactiveOnlyApply,
        ),
      );
      expect(workspace.readFile("axm-lock.yaml")).toContain(
        `publisherBindingId: ${ACCEPTED_BINDING}`,
      );
      registry.writeSkill(SKILL, [SECOND, FIRST]);
      republishUnderBinding(registry, "skills", SKILL, REPUBLISHED_BINDING);
      const before = workspace.snapshot();
      return { registry, workspace, before };
    });

  it.effect.each(affectedRoutes)(
    "$route reports the publisher change in preview and changes nothing",
    ({ run }) =>
      Effect.gen(function* () {
        const { workspace, before } = yield* acceptedThenRepublished();

        const resolution = yield* run(workspace, previewPlanExecution);

        expect(workspace.snapshot()).toEqual(before);
        expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
        expect(deriveOperationOutcome(resolution)).toBe("previewed");
        expect(resolution.riskConditions).toEqual(expect.arrayContaining([publisherCondition]));
        expect(workspace.readFile("axm-lock.yaml")).toContain(
          `publisherBindingId: ${ACCEPTED_BINDING}`,
        );
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect.each(affectedRoutes)(
    "$route stops as approval required naming interactive approval when no prompt can open",
    ({ run }) =>
      Effect.gen(function* () {
        const { workspace, before } = yield* acceptedThenRepublished();

        const resolution = yield* run(workspace, interactiveOnlyApply);

        expect(workspace.snapshot()).toEqual(before);
        expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
        expect(deriveOperationOutcome(resolution)).toBe("blocked");
        expect(countUnitStates(resolution.units).committed).toBe(0);
        expect(resolution.blocking).toMatchObject({
          class: "approval-required",
          subject: CONDITION,
          detail: expect.stringContaining("Interactive approval is required"),
          escape: { description: expect.stringContaining("Approve interactively") },
        });
        // No route that can accept a publisher change offers advance approval.
        expect(JSON.stringify(resolution.blocking)).not.toContain("--yes");
        expect(workspace.readFile("axm-lock.yaml")).toContain(
          `publisherBindingId: ${ACCEPTED_BINDING}`,
        );
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect.each(affectedRoutes)(
    "$route records the new binding only after a person approves at a prompt",
    ({ run }) =>
      Effect.gen(function* () {
        const { workspace } = yield* acceptedThenRepublished({
          confirmation: { available: true, answer: "approved" },
        });

        const resolution = yield* run(workspace, interactiveOnlyApply);

        expect(workspace.interactionState().confirmApplyChangesCalls).toHaveLength(1);
        expect(deriveOperationOutcome(resolution)).toBe("applied");
        expect(workspace.readFile("axm-lock.yaml")).toContain(
          `publisherBindingId: ${REPUBLISHED_BINDING}`,
        );
        expect(workspace.readFile("axm-lock.yaml")).not.toContain(
          `publisherBindingId: ${ACCEPTED_BINDING}`,
        );
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("a newer version from the same publisher is accepted without any approval", () =>
    Effect.gen(function* () {
      const registry = makeLifecycleRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill(SKILL, [FIRST]);
      const workspace = makeLifecycleFixture({
        sources: "live",
        settings: { owner: "@acme", agents: ["claude-code"], sources: [registry.source] },
      });
      cleanups.push(workspace.cleanup);
      yield* workspace.provide(
        resolveInstall(
          installRequest({ subject: { kind: "source", source: FQN } }),
          interactiveOnlyApply,
        ),
      );
      registry.writeSkill(SKILL, [SECOND, FIRST]);

      const resolution = yield* workspace.provide(
        resolveUpdate(configuredUpdateRequest({ type: "skill" }), interactiveOnlyApply),
      );

      expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
      expect(deriveOperationOutcome(resolution)).toBe("applied");
      expect(countUnitStates(resolution.units).committed).toBe(1);
      expect(JSON.stringify(resolution.riskConditions ?? [])).not.toContain(CONDITION);
      expect(workspace.readFile("axm-lock.yaml")).toContain("resolvedVersion: 2.0.0");
      expect(workspace.readFile("axm-lock.yaml")).toContain(
        `publisherBindingId: ${ACCEPTED_BINDING}`,
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("a first acceptance binds the publisher without any approval", () =>
    Effect.gen(function* () {
      const registry = makeLifecycleRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill(SKILL, [FIRST]);
      const workspace = makeLifecycleFixture({
        sources: "live",
        settings: { owner: "@acme", agents: ["claude-code"], sources: [registry.source] },
      });
      cleanups.push(workspace.cleanup);

      const resolution = yield* workspace.provide(
        resolveInstall(
          installRequest({ subject: { kind: "source", source: FQN } }),
          interactiveOnlyApply,
        ),
      );

      expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
      expect(deriveOperationOutcome(resolution)).toBe("applied");
      expect(countUnitStates(resolution.units).committed).toBe(1);
      expect(JSON.stringify(resolution.riskConditions ?? [])).not.toContain(CONDITION);
      expect(workspace.readFile("axm-lock.yaml")).toContain(
        `publisherBindingId: ${ACCEPTED_BINDING}`,
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});

// The Subagent branch has its own manager and native document adapter. Start
// with real accepted content so a version-only update cannot satisfy trust.
const SUBAGENT = "researcher";
const UNRELATED_SUBAGENT = "unrelated-researcher";
const UNRELATED_BINDING = "hbnd_unrelated";
const UNRELATED: RegistrySubagentVersion = {
  version: "1.0.0",
  body: "Keep this independent research guidance.",
};
const SUBAGENT_CANONICAL = `agent_extensions/agentxm/@acme/subagents/${SUBAGENT}`;
const SUBAGENT_NATIVE = `.claude/agents/${SUBAGENT}.md`;

const expectSubagentContent = (
  workspace: LifecycleFixture,
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
    `---\nname: ${name}\ndescription: The ${name} subagent.\n---\n\n# ${name}\n\n${publication.body}\n`,
  );
  const native = workspace.readFile(`.claude/agents/${name}.md`);
  expect(native).toContain(`name: ${name}`);
  expect(native).toContain(publication.body);
};

/**
 * Keep every entry except the explicitly updated canonical package, its
 * native file, and the lockfile. The lockfile is compared separately after
 * replacing only this Subagent's accepted row with its prior value.
 */
const outsideSubagentUpdate = (
  snapshot: ReadonlyArray<readonly [string, string]>,
): ReadonlyArray<readonly [string, string]> =>
  snapshot.filter(
    ([relative]) =>
      relative !== "axm-lock.yaml" &&
      relative !== SUBAGENT_CANONICAL &&
      !relative.startsWith(`${SUBAGENT_CANONICAL}/`) &&
      relative !== SUBAGENT_NATIVE,
  );

describe("Publisher changes through typed Subagent update", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const acquiredThenRepublished = (interactive: boolean) =>
    Effect.gen(function* () {
      const registry = makeLifecycleRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSubagent(SUBAGENT, [FIRST]);
      registry.writeSubagent(UNRELATED_SUBAGENT, [UNRELATED]);
      republishUnderBinding(registry, "subagents", UNRELATED_SUBAGENT, UNRELATED_BINDING);

      const pending: { run?: () => void } = {};
      const workspace = makeLifecycleFixture({
        sources: "live",
        settings: { owner: "@acme", agents: ["claude-code"], sources: [registry.source] },
        ...(interactive
          ? {
              confirmation: {
                available: true,
                answer: "approved" as const,
                // The answer is still pending here. Neither the changed
                // binding nor any protected workspace write may precede it.
                onConfirm: () => pending.run?.(),
              },
            }
          : {}),
      });
      cleanups.push(workspace.cleanup);

      for (const name of [SUBAGENT, UNRELATED_SUBAGENT]) {
        yield* workspace.provide(
          resolveInstall(
            installRequest({ subject: { kind: "source", source: `@acme/subagents/${name}` } }),
            interactiveOnlyApply,
          ),
        );
      }
      // First acceptance needs no publisher-change approval and produces real
      // canonical and native files before the Registry changes its publisher.
      expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
      expectSubagentContent(workspace, SUBAGENT, FIRST);
      expectSubagentContent(workspace, UNRELATED_SUBAGENT, UNRELATED);
      const lockBefore = yield* decodeLockfile(YAML.parse(workspace.readFile("axm-lock.yaml")));
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
      workspace.writeFile(
        ".claude/agents/personal-notes.md",
        "---\nname: personal-notes\ndescription: Personal notes.\n---\n\nKeep this unowned file exactly as written.\n",
      );
      registry.writeSubagent(SUBAGENT, [SECOND, FIRST]);
      republishUnderBinding(registry, "subagents", SUBAGENT, REPUBLISHED_BINDING);
      const before = workspace.snapshot();
      pending.run = () => {
        expectSubagentContent(workspace, SUBAGENT, FIRST);
        const currentLock: unknown = YAML.parse(workspace.readFile("axm-lock.yaml"));
        expect(currentLock).toMatchObject({
          subagents: { [SUBAGENT]: { publisherBindingId: ACCEPTED_BINDING } },
        });
        expect(workspace.snapshot()).toEqual(before);
      };
      return { workspace, before, lockBefore };
    });

  const updateSubagent = (workspace: LifecycleFixture) =>
    workspace.provide(
      resolveUpdate(configuredUpdateRequest({ type: "subagent" }), interactiveOnlyApply),
    );

  it.effect(
    "unattended Subagent update preserves the accepted binding and all protected state",
    () =>
      Effect.gen(function* () {
        const { workspace, before, lockBefore } = yield* acquiredThenRepublished(false);

        const resolution = yield* updateSubagent(workspace);

        expect(workspace.snapshot()).toEqual(before);
        expect(yield* decodeLockfile(YAML.parse(workspace.readFile("axm-lock.yaml")))).toEqual(
          lockBefore,
        );
        expect(workspace.interactionState().confirmApplyChangesCalls).toEqual([]);
        expect(deriveOperationOutcome(resolution)).toBe("blocked");
        expect(countUnitStates(resolution.units).committed).toBe(0);
        expect(resolution.blocking).toMatchObject({
          class: "approval-required",
          subject: CONDITION,
          detail: expect.stringContaining("Interactive approval is required"),
          escape: { description: expect.stringContaining("Approve interactively") },
        });
        expect(JSON.stringify(resolution.blocking)).not.toContain("--yes");
        expectSubagentContent(workspace, SUBAGENT, FIRST);
        expect(workspace.readFile(SUBAGENT_NATIVE)).not.toContain(SECOND.body);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "approved Subagent update records the new binding and content without changing unrelated state",
    () =>
      Effect.gen(function* () {
        const { workspace, before, lockBefore } = yield* acquiredThenRepublished(true);

        const resolution = yield* updateSubagent(workspace);

        expect(workspace.interactionState().confirmApplyChangesCalls).toHaveLength(1);
        expect(deriveOperationOutcome(resolution)).toBe("applied");
        const lockAfter = yield* decodeLockfile(YAML.parse(workspace.readFile("axm-lock.yaml")));
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
        expect(outsideSubagentUpdate(workspace.snapshot())).toEqual(outsideSubagentUpdate(before));
        expectSubagentContent(workspace, UNRELATED_SUBAGENT, UNRELATED);
      }).pipe(Effect.provide(NodeServices.layer)),
  );
});
