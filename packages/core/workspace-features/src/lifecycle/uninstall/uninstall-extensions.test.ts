/**
 * What preparing a removal observes, counted at the physical and logical
 * seams it crosses.
 *
 * Preparation describes each removal from one read phase: every artifact
 * and every cleanup step's dry run describe the same agent-native outputs,
 * every artifact describes the same projection facts, and a Knowledge
 * bundle's ownership check and its removal artifact describe the same
 * canonical tree. Each example names the count observed when every consumer
 * observed again, and the count with one observation shared inside the
 * preparation. Applying still observes live under the transition lock.
 */
import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import type { InstallableExtensionType } from "@agentxm/extension-model/unstable/extensions/installable-types";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import {
  deriveOperationOutcome,
  type OperationResolution,
} from "@agentxm/workspace-kernel/operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { WorkspaceInvariantFacts } from "@agentxm/workspace-kernel/projection";
import { DesiredStateReader, WorkspaceReadViews } from "@agentxm/workspace-kernel/workspace-state";

import {
  applyInstallAcceptingExecutionChanges,
  fileRegistryPackagePath,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../../testing/install-world.js";
import { UninstallExtensions } from "./uninstall-extensions.js";
import { applyUninstall, previewUninstall, uninstallRequest } from "./test-helpers.js";

// The recording filesystem replaces the platform one; the rest of the platform services stay.
const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

const PLURAL = {
  skill: "skills",
  subagent: "subagents",
  hook: "hooks",
  knowledge: "knowledge",
} as const;

type Published = keyof typeof PLURAL;

const publish = (world: InstallWorld, type: Published, name: string) => {
  switch (type) {
    case "skill":
      return world.registry.writeSkill(name, [{ version: "1.0.0", body: `${name} guidance.` }]);
    case "subagent":
      return world.registry.writeSubagent(name, [{ version: "1.0.0", body: `${name} help.` }]);
    case "hook":
      return world.registry.writeHook(name, [{ version: "1.0.0" }]);
    case "knowledge":
      return world.registry.writeKnowledge(name, [{ version: "1.0.0", body: `# ${name}\n` }]);
  }
};

const install = (type: Published, name: string) =>
  applyInstallAcceptingExecutionChanges(
    installRequest({ type, subject: { kind: "source", source: `@acme/${PLURAL[type]}/${name}` } }),
  );

/**
 * Forget setup work, then run `measured` counting physical calls, work facts,
 * projection-fact evaluations at the facts owner, and desired-state
 * evaluation requests inside each captured read phase. Proposing the removal
 * and deriving native output authority are this preparation's evaluation
 * requests.
 */
const measure = <A, E, R>(measured: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    const views = yield* WorkspaceReadViews;
    const facts = yield* WorkspaceInvariantFacts;
    const counts = { evaluations: 0, projectionFacts: 0 };
    recording.reset();
    const work = workObservations(false);
    const result = yield* measured.pipe(
      work.provide,
      Effect.provideService(WorkspaceInvariantFacts, {
        ...facts,
        projectionFacts: Effect.suspend(() => {
          counts.projectionFacts += 1;
          return facts.projectionFacts;
        }),
      }),
      Effect.provideService(WorkspaceReadViews, {
        ...views,
        capture: (options) =>
          views.capture(options).pipe(
            Effect.map((context) => {
              const desired = Context.get(context, DesiredStateReader);
              return Context.add(context, DesiredStateReader, {
                ...desired,
                evaluate: () =>
                  Effect.suspend(() => {
                    counts.evaluations += 1;
                    return desired.evaluate();
                  }),
              });
            }),
          ),
      }),
    );
    return {
      result,
      ...counts,
      readDirectory: (path: string) =>
        recording.calls({ method: "readDirectory", path }).filter((call) => call.path === path)
          .length,
      readFile: (path: string) =>
        recording.calls({ method: "readFile", path }).filter((call) => call.path === path).length,
      treeHashes: work.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree").length,
    };
  });

/** What each unit's artifact names, without the agents that read it. */
const described = (units: OperationResolution["units"], root: string) => {
  const relative = (path: string) => path.split(root).join("<workspace>");
  return units.map(({ id, artifact }) => ({
    id,
    targets: (artifact?.targets ?? []).map(({ path, change }) => ({
      path: relative(path),
      change,
    })),
    references: artifact?.references ?? [],
    managedRegions: (artifact?.managedRegions ?? []).map((region) => ({
      ...region,
      path: relative(region.path),
    })),
  }));
};

describe("Uninstall preparation shares its read-phase observations", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const world = (): InstallWorld => {
    const created = makeInstallWorld();
    cleanups.push(created.cleanup);
    return created;
  };

  const prepare = (type: InstallableExtensionType, selector: string) =>
    UninstallExtensions.prepare(uninstallRequest({ type, selector }));

  it.effect(
    "inventories agent outputs once for a Skill removal, and live again when applying",
    () => {
      const created = world();
      const { workspace } = created;
      publish(created, "skill", "review");
      const at = (relative: string) => nodePath.join(workspace.root, relative);
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* install("skill", "review");
            const counted = yield* measure(prepare("skill", "review"));
            expect(counted.result.names).toEqual(["review"]);
            // Repeated: the artifact and the cleanup step's dry run each
            // inventoried every agent's containers (two reads of each skills
            // container, one of each subagent container) and each derived the
            // native output authority: 6, 6, 3, 3 reads and 3 evaluations.
            expect
              .soft({
                sharedSkills: counted.readDirectory(at(".agents/skills")),
                claudeSkills: counted.readDirectory(at(".claude/skills")),
                unconfiguredSkills: counted.readDirectory(at(".cursor/skills")),
                claudeAgents: counted.readDirectory(at(".claude/agents")),
                evaluations: counted.evaluations,
                projectionFacts: counted.projectionFacts,
              })
              .toEqual({
                sharedSkills: 4,
                claudeSkills: 4,
                unconfiguredSkills: 2,
                claudeAgents: 2,
                evaluations: 2,
                projectionFacts: 1,
              });
            // Applying the prepared candidate inventories live before and after
            // removing, under the transition lock.
            const applied = yield* measure(
              UninstallExtensions.previewOrApply(counted.result, preapprovedPlanExecution),
            );
            expect(deriveOperationOutcome(applied.result)).toBe("applied");
            expect(workspace.exists(".claude/skills/review")).toBe(false);
            expect.soft(applied.readDirectory(at(".cursor/skills"))).toBe(5);
          }),
        )
        .pipe(Effect.provide(recordedNodeServices));
    },
  );

  it.effect("inventories agent outputs and evaluates projection facts once for two Skills", () => {
    const created = world();
    const { workspace } = created;
    publish(created, "skill", "review");
    publish(created, "skill", "triage");
    const at = (relative: string) => nodePath.join(workspace.root, relative);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* install("skill", "review");
          yield* install("skill", "triage");
          const counted = yield* measure(prepare("skill", "*"));
          expect(counted.result.names).toEqual(["review", "triage"]);
          // Repeated: two artifacts and two cleanup dry runs each inventoried
          // and derived authority, and each artifact evaluated the projection
          // facts: 15, 15, 5, 5 reads, 5 evaluations and 2 fact evaluations.
          expect
            .soft({
              sharedSkills: counted.readDirectory(at(".agents/skills")),
              claudeSkills: counted.readDirectory(at(".claude/skills")),
              unconfiguredSkills: counted.readDirectory(at(".cursor/skills")),
              claudeAgents: counted.readDirectory(at(".claude/agents")),
              evaluations: counted.evaluations,
              projectionFacts: counted.projectionFacts,
            })
            .toEqual({
              sharedSkills: 6,
              claudeSkills: 6,
              unconfiguredSkills: 2,
              claudeAgents: 2,
              evaluations: 2,
              projectionFacts: 1,
            });
          // Each removal still describes what it described when every consumer
          // observed the outputs and facts on its own.
          const preview = yield* previewUninstall(
            uninstallRequest({ type: "skill", selector: "*" }),
          );
          expect(described(preview.units, workspace.root)).toEqual(
            ["review", "triage"].map((name) => ({
              id: `skills/${name}`,
              targets: [
                { path: "axm.json", change: "updated" },
                { path: "axm.lock", change: "updated" },
                {
                  path: fileRegistryPackagePath(created.registry, "skills", name),
                  change: "removed",
                },
                { path: `.agents/skills/${name}`, change: "removed" },
                { path: `.claude/skills/${name}`, change: "removed" },
              ],
              references: [],
              managedRegions: [],
            })),
          );
          const applied = yield* applyUninstall(uninstallRequest({ type: "skill", selector: "*" }));
          expect(deriveOperationOutcome(applied)).toBe("applied");
          expect(workspace.exists(".claude/skills/review")).toBe(false);
          expect(workspace.exists(".claude/skills/triage")).toBe(false);
        }),
      )
      .pipe(Effect.provide(recordedNodeServices));
  });

  it.effect.each([
    // Nothing matched: no artifact, so nothing is inventoried or evaluated.
    { selector: "missing-*", names: [], skillsReads: 1, evaluations: 1, projectionFacts: 0 },
    // An artifact with nothing to withdraw: one inventory, no cleanup step.
    { selector: "missing", names: ["missing"], skillsReads: 2, evaluations: 2, projectionFacts: 1 },
  ])(
    "observes no more for a removal of $selector, which withdraws nothing",
    ({ selector, names, skillsReads, evaluations, projectionFacts }) => {
      const created = world();
      const { workspace } = created;
      const at = (relative: string) => nodePath.join(workspace.root, relative);
      return workspace
        .provide(
          Effect.gen(function* () {
            const counted = yield* measure(prepare("skill", selector));
            expect(counted.result.names).toEqual(names);
            expect
              .soft({
                claudeSkills: counted.readDirectory(at(".claude/skills")),
                unconfiguredSkills: counted.readDirectory(at(".cursor/skills")),
                evaluations: counted.evaluations,
                projectionFacts: counted.projectionFacts,
              })
              .toEqual({
                claudeSkills: skillsReads,
                unconfiguredSkills: skillsReads,
                evaluations,
                projectionFacts,
              });
          }),
        )
        .pipe(Effect.provide(recordedNodeServices));
    },
  );

  it.effect("inventories agent outputs once for a Subagent removal", () => {
    const created = world();
    const { workspace } = created;
    publish(created, "subagent", "helper");
    const at = (relative: string) => nodePath.join(workspace.root, relative);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* install("subagent", "helper");
          const counted = yield* measure(prepare("subagent", "helper"));
          expect(counted.result.names).toEqual(["helper"]);
          // Repeated: 4, 4 reads and 3 evaluations.
          expect
            .soft({
              claudeAgents: counted.readDirectory(at(".claude/agents")),
              unconfiguredAgents: counted.readDirectory(at(".cursor/agents")),
              evaluations: counted.evaluations,
            })
            .toEqual({ claudeAgents: 3, unconfiguredAgents: 3, evaluations: 2 });
          const preview = yield* previewUninstall(
            uninstallRequest({ type: "subagent", selector: "helper" }),
          );
          expect(described(preview.units, workspace.root)).toEqual([
            {
              id: "subagents/helper",
              targets: [
                { path: "axm.json", change: "updated" },
                { path: "axm.lock", change: "updated" },
                {
                  path: fileRegistryPackagePath(created.registry, "subagents", "helper"),
                  change: "removed",
                },
                { path: ".claude/agents/helper.md", change: "removed" },
              ],
              references: [],
              managedRegions: [],
            },
          ]);
        }),
      )
      .pipe(Effect.provide(recordedNodeServices));
  });

  it.effect("derives native authority once for a Hook removal, which has no cleanup step", () => {
    const created = world();
    const { workspace } = created;
    publish(created, "hook", "guard");
    const at = (relative: string) => nodePath.join(workspace.root, relative);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* install("hook", "guard");
          const counted = yield* measure(prepare("hook", "guard"));
          expect(counted.result.names).toEqual(["guard"]);
          // Repeated: the withdrawn hooks and the artifact each derived the
          // authority, 5 evaluations. The artifact's one inventory, with its
          // hook configuration reads, is unchanged.
          expect
            .soft({
              claudeSkills: counted.readDirectory(at(".claude/skills")),
              hookSettings: counted.readFile(at(".claude/settings.json")),
              evaluations: counted.evaluations,
              projectionFacts: counted.projectionFacts,
            })
            .toEqual({ claudeSkills: 1, hookSettings: 7, evaluations: 4, projectionFacts: 1 });
          const preview = yield* previewUninstall(
            uninstallRequest({ type: "hook", selector: "guard" }),
          );
          expect(described(preview.units, workspace.root)).toEqual([
            {
              id: "hooks/guard",
              targets: [
                { path: "axm.json", change: "updated" },
                { path: "axm.lock", change: "updated" },
                {
                  path: fileRegistryPackagePath(created.registry, "hooks", "guard"),
                  change: "removed",
                },
                { path: ".claude/settings.json", change: "updated" },
              ],
              references: [],
              managedRegions: [],
            },
          ]);
        }),
      )
      .pipe(Effect.provide(recordedNodeServices));
  });

  it.effect(
    "observes a Knowledge bundle's canonical tree once for its ownership check and its artifact",
    () => {
      const created = world();
      const { workspace, registry } = created;
      publish(created, "knowledge", "guide");
      const root = nodePath.join(
        workspace.root,
        fileRegistryPackagePath(registry, "knowledge", "guide"),
      );
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* install("knowledge", "guide");
            expect(workspace.exists(nodePath.relative(workspace.root, root))).toBe(true);
            const counted = yield* measure(prepare("knowledge", "guide"));
            expect(counted.result.names).toEqual(["guide"]);
            // Repeated: 12 manifest reads, 6 root reads and 4 tree hashes; one
            // observation reads the manifest once and hashes it once more.
            // The exposure passes and the projection facts still observe the
            // bundle on their own; each contributor selection among them
            // decodes the manifest its own observation captured.
            expect
              .soft({
                manifest: counted.readFile(nodePath.join(root, "knowledge.json")),
                root: counted.readDirectory(root),
                treeHashes: counted.treeHashes,
                evaluations: counted.evaluations,
                projectionFacts: counted.projectionFacts,
              })
              .toEqual({
                manifest: 8,
                root: 5,
                treeHashes: 3,
                evaluations: 4,
                projectionFacts: 1,
              });
            const preview = yield* previewUninstall(
              uninstallRequest({ type: "knowledge", selector: "guide" }),
            );
            expect(described(preview.units, workspace.root)).toEqual([
              {
                id: "knowledge/guide",
                targets: [
                  { path: "axm.json", change: "updated" },
                  { path: "axm.lock", change: "updated" },
                  {
                    path: fileRegistryPackagePath(registry, "knowledge", "guide"),
                    change: "removed",
                  },
                  { path: "<workspace>/AGENTS.md#knowledge", change: "updated" },
                ],
                references: [],
                managedRegions: [
                  {
                    owner: "@agentxm/knowledge/discovery",
                    path: "<workspace>/AGENTS.md#knowledge",
                    unitId: "knowledge:discovery-region",
                  },
                ],
              },
            ]);
          }),
        )
        .pipe(Effect.provide(recordedNodeServices));
    },
  );

  /** Bind the accepted package a second time, under another lock key. */
  const bindAgain = (lockPath: string, key: string) =>
    fs.writeFileSync(
      lockPath,
      fs
        .readFileSync(lockPath, "utf8")
        .replace(
          new RegExp(`^${key} = (.*)$`, "m"),
          (row, binding) => `${row}\n${key}-copy = ${binding}`,
        ),
    );

  // The artifact describes the bundle from what its ownership check observed,
  // so a bundle whose content no longer verifies, is gone, or is still bound
  // elsewhere is described as it was when the artifact observed it itself.
  it.effect.each([
    {
      condition: "edited content",
      change: ({ packageRoot }: { packageRoot: string; lockPath: string }) =>
        fs.appendFileSync(nodePath.join(packageRoot, "src", "index.md"), "Local edit.\n"),
      reference: {
        state: "unknown",
        reason: "canonical ownership or content could not be verified",
      },
    },
    {
      condition: "deleted content",
      change: ({ packageRoot }: { packageRoot: string; lockPath: string }) =>
        fs.rmSync(packageRoot, { recursive: true, force: true }),
      reference: { state: "absent", reason: "canonical content is already absent" },
    },
    {
      condition: "a package another binding accepts",
      change: ({ lockPath }: { packageRoot: string; lockPath: string }) =>
        bindAgain(lockPath, "guide"),
      reference: { state: "retained", reason: "required by resulting desired state" },
    },
  ])("describes a Knowledge bundle with $condition as it observes it", ({ change, reference }) => {
    const created = world();
    const { workspace, registry } = created;
    publish(created, "knowledge", "guide");
    const packagePath = fileRegistryPackagePath(registry, "knowledge", "guide");
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* install("knowledge", "guide");
          change({
            packageRoot: nodePath.join(workspace.root, packagePath),
            lockPath: nodePath.join(workspace.root, "axm.lock"),
          });
          const preview = yield* previewUninstall(
            uninstallRequest({ type: "knowledge", selector: "guide" }),
          );
          // The package is kept and reported, never removed.
          expect(described(preview.units, workspace.root)).toEqual([
            {
              id: "knowledge/guide",
              targets: [
                { path: "axm.json", change: "updated" },
                { path: "axm.lock", change: "updated" },
                { path: "<workspace>/AGENTS.md#knowledge", change: "updated" },
              ],
              references: [{ path: packagePath, ...reference }],
              managedRegions: [
                {
                  owner: "@agentxm/knowledge/discovery",
                  path: "<workspace>/AGENTS.md#knowledge",
                  unitId: "knowledge:discovery-region",
                },
              ],
            },
          ]);
        }),
      )
      .pipe(Effect.provide(recordedNodeServices));
  });
});
