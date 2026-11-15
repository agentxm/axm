/**
 * Work activation planning does once per subject.
 *
 * Planning an enable collects the materialize steps for the resulting graph.
 * Activation reads only the steps and prepared projections of that collection,
 * so the collection reads each type's inventory for presence and paths alone:
 * the pre-change native outcomes a detailed inventory adds are never consumed.
 * Where a decision consumes only the canonical root an observation reports,
 * the root is derived from the accepted row instead of observing the content.
 * Every example names the count observed before those reductions. Counts are exact for these fixtures over a real temporary workspace and a
 * `file://` Registry, beneath the production read views.
 */
import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { CurrentWorkObserver } from "@agentxm/host-primitives/work-observation";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { WorkspaceReadViews, WorkspaceRecords } from "@agentxm/workspace-kernel/workspace-state";

import {
  applyInstallAcceptingExecutionChanges,
  installRequest,
  makeInstallWorld,
  type InstallWorld,
} from "../../testing/install-world.js";
import { DisableExtension, EnableExtension } from "./set-activation.js";
import { applyActivationAcceptingExecutionChanges } from "./test-helpers.js";

const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

/** Count the inventory reads that ask for native detail, by type, through every read phase. */
const countingDetailedInventories = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  counts: Map<ExtensionType, number>,
) =>
  Effect.gen(function* () {
    const views = yield* WorkspaceReadViews;
    const count = (records: Context.Service.Shape<typeof WorkspaceRecords>) => ({
      ...records,
      getExtensionInventory: (
        type: Parameters<typeof records.getExtensionInventory>[0],
        options: Parameters<typeof records.getExtensionInventory>[1],
      ) =>
        Effect.sync(() => {
          if (options.details === true) counts.set(type, (counts.get(type) ?? 0) + 1);
        }).pipe(Effect.andThen(records.getExtensionInventory(type, options))),
    });
    const records = yield* WorkspaceRecords;
    return yield* effect.pipe(
      Effect.provideService(WorkspaceRecords, count(records)),
      Effect.provideService(WorkspaceReadViews, {
        ...views,
        capture: (options) =>
          views
            .capture(options)
            .pipe(
              Effect.map((context) =>
                Context.add(
                  context,
                  WorkspaceRecords,
                  count(Context.get(context, WorkspaceRecords)),
                ),
              ),
            ),
      }),
    );
  });

/** Run `setup`, forget its work, then count what preparing `measured` reads. */
const measure = <A, E, R>(
  world: InstallWorld,
  setup: Effect.Effect<unknown, unknown, R>,
  measured: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    yield* setup;
    recording.reset();
    const detailed = new Map<ExtensionType, number>();
    const work = workObservations(false);
    const result = yield* countingDetailedInventories(measured, detailed).pipe(work.provide);
    return {
      result,
      detailedMcpInventories: detailed.get("mcp-server") ?? 0,
      mcpConfigReads: recording.contentReads(nodePath.join(world.workspace.root, ".mcp.json")),
      facts: work.facts,
      recording,
    };
  }).pipe(world.workspace.provide, Effect.provide(recordedNodeServices));

/** The materialize steps a prepared activation plans, by key and readiness. */
const stepsOf = (candidate: Effect.Success<ReturnType<typeof EnableExtension.prepare>>) =>
  candidate._tag === "Unchanged"
    ? []
    : Option.match(candidate.realization.materialization, {
        onNone: () => [],
        onSome: (collected) =>
          collected.steps.map((step) => ({ key: step.key, readiness: step.readiness })),
      });

describe("Activation planning reads each type's inventory for presence only", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const world = (): InstallWorld => {
    const created = makeInstallWorld();
    cleanups.push(created.cleanup);
    created.registry.writeMcp("context", [{ version: "1.0.0" }]);
    return created;
  };
  const installContext = applyInstallAcceptingExecutionChanges(
    installRequest({
      type: "mcp-server",
      subject: { kind: "source", source: "test:@acme/mcps/context" },
    }),
  );

  it.effect(
    "prepares an MCP server enable without inspecting the pre-change outcomes",
    () => {
      const created = world();
      return Effect.gen(function* () {
        const counted = yield* measure(
          created,
          installContext.pipe(
            Effect.tap((resolution) =>
              Effect.sync(() => expect(deriveOperationOutcome(resolution)).toBe("applied")),
            ),
            Effect.andThen(
              applyActivationAcceptingExecutionChanges({
                type: "mcp-server",
                name: "context",
                enabled: false,
              }),
            ),
          ),
          EnableExtension.prepare({ type: "mcp-server", name: "context" }),
        );
        // The withdrawn native entry is stale, so the server still materializes.
        expect(stepsOf(counted.result)).toEqual([
          { key: "mcp-server:context", readiness: "ready" },
        ]);
        // Repeated: one detailed inventory, inspecting the disabled server's
        // native configuration, and 9 reads of `.mcp.json`. Currency and the
        // projected outcomes keep theirs.
        expect(counted).toMatchObject({ detailedMcpInventories: 0, mcpConfigReads: 7 });
      });
    },
    { timeout: 60_000 },
  );

  it.effect(
    "prepares a Pack enable without inspecting its already active member's outcomes",
    () => {
      const created = world();
      created.registry.writePack("toolkit", [
        { version: "1.0.0", dependencies: { "@acme/mcps/context": "^1.0.0" } },
      ]);
      return Effect.gen(function* () {
        const counted = yield* measure(
          created,
          Effect.gen(function* () {
            expect(deriveOperationOutcome(yield* installContext)).toBe("applied");
            const pack = yield* applyInstallAcceptingExecutionChanges(
              installRequest({
                type: "pack",
                subject: { kind: "source", source: "test:@acme/packs/toolkit" },
              }),
            );
            expect(deriveOperationOutcome(pack)).toBe("applied");
            yield* applyActivationAcceptingExecutionChanges({
              type: "pack",
              name: "toolkit",
              enabled: false,
            });
          }),
          EnableExtension.prepare({ type: "pack", name: "toolkit" }),
        );
        // The member's native entry is current, so nothing materializes.
        expect(stepsOf(counted.result)).toEqual([]);
        // Repeated: one detailed inventory, inspecting every active MCP server,
        // and 6 reads of `.mcp.json`. The member's currency keeps its reads.
        expect(counted).toMatchObject({ detailedMcpInventories: 0, mcpConfigReads: 4 });
      });
    },
    { timeout: 60_000 },
  );
});

/** The acquired canonical root of `name`, wherever its source places it. */
const acquiredRoot = (world: InstallWorld, plural: string, name: string): string => {
  const found = fs
    .readdirSync(nodePath.join(world.workspace.root, "agent_extensions"), {
      recursive: true,
      encoding: "utf8",
    })
    .filter((relative) => relative.endsWith(nodePath.join(plural, name)));
  if (found.length !== 1) throw new Error(`Expected one acquired ${plural}/${name}: ${found}`);
  return nodePath.join(world.workspace.root, "agent_extensions", found[0] ?? "");
};

describe("Activation planning observes canonical content only where a decision reads it", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "projects an MCP server enable's outcomes from its canonical root without walking it",
    () => {
      const created = makeInstallWorld();
      cleanups.push(created.cleanup);
      created.registry.writeMcp("context", [{ version: "1.0.0" }]);
      return Effect.gen(function* () {
        const counted = yield* measure(
          created,
          Effect.gen(function* () {
            const installed = yield* applyInstallAcceptingExecutionChanges(
              installRequest({
                type: "mcp-server",
                subject: { kind: "source", source: "test:@acme/mcps/context" },
              }),
            );
            expect(deriveOperationOutcome(installed)).toBe("applied");
            yield* applyActivationAcceptingExecutionChanges({
              type: "mcp-server",
              name: "context",
              enabled: false,
            });
          }),
          EnableExtension.prepare({ type: "mcp-server", name: "context" }),
        );
        const root = acquiredRoot(created, "mcps", "context");
        if (counted.result._tag !== "SetActivation") throw new Error("Expected a change");
        expect(counted.result.agentOutcomes).toEqual([
          {
            extensionType: "mcp-server",
            name: "context",
            agentId: "claude-code",
            outcome: "projected",
            reasonCode: "supported",
            reason: "claude-code has a matching MCP projection.",
            path: nodePath.join(created.workspace.root, ".mcp.json"),
          },
        ]);
        // Repeated: 4 tree hashes, 7 directory reads and 4 presence probes of
        // the root, and 13 reads of its manifest. Settlement, step collection
        // and the execution review still judge the tree.
        expect({
          treeHashes: counted.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree")
            .length,
          rootDirectoryReads: counted.recording.counts(root).readDirectory,
          rootProbes: counted.recording.counts(root).access,
          manifestReads: counted.recording.contentReads(nodePath.join(root, "mcp.json")),
        }).toEqual({ treeHashes: 3, rootDirectoryReads: 6, rootProbes: 3, manifestReads: 11 });
      });
    },
    { timeout: 60_000 },
  );

  it.effect(
    "prepares a Pack disable without observing a retired member again",
    () => {
      const created = makeInstallWorld();
      cleanups.push(created.cleanup);
      created.registry.writeSkill("review", [{ version: "1.0.0", body: "Review." }]);
      created.registry.writePack("reviews", [
        { version: "1.0.0", dependencies: { "@acme/skills/review": "^1.0.0" } },
      ]);
      return Effect.gen(function* () {
        const counted = yield* measure(
          created,
          Effect.gen(function* () {
            const pack = yield* applyInstallAcceptingExecutionChanges(
              installRequest({
                type: "pack",
                subject: { kind: "source", source: "test:@acme/packs/reviews" },
              }),
            );
            expect(deriveOperationOutcome(pack)).toBe("applied");
          }),
          DisableExtension.prepare({ type: "pack", name: "reviews" }),
        );
        const root = acquiredRoot(created, "skills", "review");
        if (counted.result._tag !== "SetActivation") throw new Error("Expected a change");
        // The member is retired, so it is a removed target and no retained reference.
        expect(counted.result.artifact.references).toEqual([]);
        expect(counted.result.artifact.targets).toEqual([
          { path: "axm.json", change: "updated" },
          {
            path: nodePath.relative(created.workspace.root, root),
            change: "removed",
          },
        ]);
        // Repeated: 2 tree hashes, 3 directory reads and 2 presence probes of
        // the member root. The retirement still verifies the tree it retires.
        expect({
          treeHashes: counted.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree")
            .length,
          rootDirectoryReads: counted.recording.counts(root).readDirectory,
          rootProbes: counted.recording.counts(root).access,
        }).toEqual({ treeHashes: 1, rootDirectoryReads: 2, rootProbes: 1 });
      });
    },
    { timeout: 60_000 },
  );
});

/**
 * Enabling an installed, disabled Registry subject whose native outputs are
 * current. Settlement observes the subject's tree; step collection takes that
 * observation for a Hook, whose projected outcomes judge its tree again in the
 * phase. Every other type keeps step collection's own observation.
 * `repeated` is the count with step collection's own observation.
 */
describe("Activation planning hands settlement's observation to step collection", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const rows = [
    {
      type: "hook",
      plural: "hooks",
      publish: (r: InstallWorld["registry"]) => r.writeHook("review", [{ version: "1.0.0" }]),
      steps: [],
      repeated: { treeHashes: 5, rootDirectoryReads: 10, rootProbes: 7 },
      observed: { treeHashes: 4, rootDirectoryReads: 9, rootProbes: 6 },
    },
    {
      type: "rule",
      plural: "rules",
      publish: (r: InstallWorld["registry"]) =>
        r.writeRule("review", [{ version: "1.0.0", body: "Review." }]),
      steps: [],
      repeated: { treeHashes: 3, rootDirectoryReads: 5, rootProbes: 3 },
      observed: { treeHashes: 3, rootDirectoryReads: 5, rootProbes: 3 },
    },
    {
      type: "knowledge",
      plural: "knowledge",
      publish: (r: InstallWorld["registry"]) =>
        r.writeKnowledge("review", [{ version: "1.0.0", body: "# Review\n" }]),
      steps: [],
      repeated: { treeHashes: 3, rootDirectoryReads: 4, rootProbes: 3 },
      observed: { treeHashes: 3, rootDirectoryReads: 4, rootProbes: 3 },
    },
    {
      type: "skill",
      plural: "skills",
      publish: (r: InstallWorld["registry"]) =>
        r.writeSkill("review", [{ version: "1.0.0", body: "Review." }]),
      // The disabled Skill's native link is gone, so it materializes again.
      steps: [{ key: "skill:review", readiness: "ready" }],
      repeated: { treeHashes: 2, rootDirectoryReads: 4, rootProbes: 2 },
      observed: { treeHashes: 2, rootDirectoryReads: 4, rootProbes: 2 },
    },
  ] as const;
  for (const row of rows)
    it.effect(
      `prepares a ${row.type} enable`,
      () => {
        const created = makeInstallWorld();
        cleanups.push(created.cleanup);
        row.publish(created.registry);
        return Effect.gen(function* () {
          const counted = yield* measure(
            created,
            Effect.gen(function* () {
              const installed = yield* applyInstallAcceptingExecutionChanges(
                installRequest({
                  type: row.type,
                  subject: { kind: "source", source: `test:@acme/${row.plural}/review` },
                }),
              );
              expect(deriveOperationOutcome(installed)).toBe("applied");
              const disabled = yield* applyActivationAcceptingExecutionChanges({
                type: row.type,
                name: "review",
                enabled: false,
              });
              expect(disabled._tag === "Resolved" ? disabled.outcome : disabled._tag).toBe(
                "applied",
              );
            }),
            EnableExtension.prepare({ type: row.type, name: "review" }),
          );
          const root = acquiredRoot(created, row.plural, "review");
          if (counted.result._tag !== "SetActivation") throw new Error("Expected a change");
          expect(Option.isNone(counted.result.blocked)).toBe(true);
          expect(stepsOf(counted.result)).toEqual(row.steps);
          expect(
            {
              treeHashes: counted.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree")
                .length,
              rootDirectoryReads: counted.recording.counts(root).readDirectory,
              rootProbes: counted.recording.counts(root).access,
            },
            `repeated: ${JSON.stringify(row.repeated)}`,
          ).toEqual(row.observed);
        });
      },
      { timeout: 60_000 },
    );
});

describe("Activation planning still judges a handed Hook's tree later in the phase", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "refuses a hook enable whose tree changes after settlement observed it",
    () => {
      const created = makeInstallWorld();
      cleanups.push(created.cleanup);
      created.registry.writeHook("review", [{ version: "1.0.0" }]);
      return Effect.gen(function* () {
        const installed = yield* applyInstallAcceptingExecutionChanges(
          installRequest({
            type: "hook",
            subject: { kind: "source", source: "test:@acme/hooks/review" },
          }),
        );
        expect(deriveOperationOutcome(installed)).toBe("applied");
        yield* applyActivationAcceptingExecutionChanges({
          type: "hook",
          name: "review",
          enabled: false,
        });
        const root = acquiredRoot(created, "hooks", "review");
        // A foreign edit lands right after settlement's tree hash completes.
        let edited = false;
        const prepared = yield* EnableExtension.prepare({ type: "hook", name: "review" }).pipe(
          Effect.provideService(CurrentWorkObserver, {
            record: (fact) => {
              if (edited || fact.kind !== "axm.hash.materialized-tree") return;
              edited = true;
              fs.writeFileSync(nodePath.join(root, "src", "edited.txt"), "Edited.\n");
            },
            detailSelected: () => false,
          }),
          Effect.flip,
        );
        expect(edited).toBe(true);
        // The Hook's projected outcomes judge its tree again in this phase and
        // refuse to prepare the change.
        expect(prepared).toMatchObject({ _tag: "ContributorTreeMismatch", packageRoot: root });
      }).pipe(created.workspace.provide, Effect.provide(recordedNodeServices));
    },
    { timeout: 60_000 },
  );
});
