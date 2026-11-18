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
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { CurrentWorkObserver } from "@agentxm/host-primitives/work-observation";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import {
  collectMaterializeSteps,
  proposeDesiredState,
  StepFailureConversion,
} from "@agentxm/workspace-kernel/reconciliation";
import {
  acceptedCanonicalObservationOfKeptRoot,
  DesiredStateReader,
  LockfileReader,
  observeDesiredCanonical,
  TreeIntegritySchema,
  withWorkspaceReadView,
  WorkspaceReadViews,
  WorkspaceRecords,
  WorkspaceRootEscape,
  type AcceptedCanonicalObservation,
  type ExtensionInventory,
} from "@agentxm/workspace-kernel/workspace-state";

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

/** What an inventory read returns, as a test arranges it. */
type InventoryView = (inventory: ExtensionInventory) => ExtensionInventory;

/**
 * Count the inventory reads that ask for native detail, by type, through
 * every read phase, presenting each inventory through `view`.
 */
const countingDetailedInventories = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  counts: Map<ExtensionType, number>,
  view: InventoryView = (inventory) => inventory,
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
        }).pipe(Effect.andThen(records.getExtensionInventory(type, options)), Effect.map(view)),
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
  view?: InventoryView,
) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    yield* setup;
    recording.reset();
    const detailed = new Map<ExtensionType, number>();
    const work = workObservations(false);
    const result = yield* countingDetailedInventories(measured, detailed, view).pipe(work.provide);
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

  /** Install `pack` from the Registry. */
  const installPack = (pack: string) =>
    Effect.gen(function* () {
      const installed = yield* applyInstallAcceptingExecutionChanges(
        installRequest({
          type: "pack",
          subject: { kind: "source", source: `test:@acme/packs/${pack}` },
        }),
      );
      expect(deriveOperationOutcome(installed)).toBe("applied");
    });

  it.effect(
    "prepares a Pack disable that observes a member kept for its native references",
    () => {
      const created = makeInstallWorld();
      cleanups.push(created.cleanup);
      created.registry.writeHook("review", [{ version: "1.0.0" }]);
      created.registry.writePack("reviews", [
        { version: "1.0.0", dependencies: { "@acme/hooks/review": "^1.0.0" } },
      ]);
      return Effect.gen(function* () {
        const counted = yield* measure(
          created,
          installPack("reviews"),
          DisableExtension.prepare({ type: "pack", name: "reviews" }),
        );
        const root = acquiredRoot(created, "hooks", "review");
        if (counted.result._tag !== "SetActivation") throw new Error("Expected a change");
        // Native hook registrations still reference the member's code, so
        // nothing is retired and its usable content is reported as retained.
        expect(counted.result.artifact.targets).toEqual([{ path: "axm.json", change: "updated" }]);
        expect(counted.result.artifact.references).toEqual([
          {
            path: nodePath.relative(created.workspace.root, root),
            state: "retained",
            reason: "canonical content retained",
          },
        ]);
        // The withdrawal still describes the registrations it removes from
        // the member's verified declaration.
        const steps = counted.result.execution.plan.jobs.flatMap((job) => job.steps);
        expect(steps.map((step) => step.readiness)).toEqual(["ready"]);
        expect(steps[0]?.artifact?.executionChanges).toMatchObject([
          {
            extensionType: "hook",
            name: "review",
            registrations: [{ target: "claude-code", change: "removed" }],
            details: [
              "Withdraw external execution; host permissions and running processes remain separate.",
              "claude-code: PreToolUse, bash src/hook.sh",
            ],
            secretReferenceChanges: { previous: "known", added: [], removed: [] },
          },
        ]);
        // Repeated: 4 tree hashes, 6 directory reads and 4 presence probes of
        // the member root. The retained reference takes the tree digest the
        // retirement just verified; the retirement and the withdrawal
        // description still hash the tree.
        // The outcome evaluation takes the root's real path its validation
        // resolved, and the selection frames the member's package hash from
        // its observation's walk; measured before: 4 probes and one more
        // directory read.
        expect({
          treeHashes: counted.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree")
            .length,
          rootDirectoryReads: counted.recording.counts(root).readDirectory,
          rootProbes: counted.recording.counts(root).access,
        }).toEqual({ treeHashes: 3, rootDirectoryReads: 4, rootProbes: 3 });
      });
    },
    { timeout: 60_000 },
  );

  it.effect(
    "prepares a blocked Pack disable that observes a kept member's tree in full",
    () => {
      const created = makeInstallWorld({
        settings: { instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false } },
      });
      cleanups.push(created.cleanup);
      created.workspace.writeFile("AGENTS.md", "# Workspace\n");
      created.registry.writeHook("review", [{ version: "1.0.0" }]);
      created.registry.writePack("reviews", [
        { version: "1.0.0", dependencies: { "@acme/hooks/review": "^1.0.0" } },
      ]);
      return Effect.gen(function* () {
        const counted = yield* measure(
          created,
          installPack("reviews").pipe(
            // An unowned alias blocks the instruction gate a Hook member passes.
            Effect.tap(() =>
              Effect.sync(() => created.workspace.writeFile("CLAUDE.md", "# Human-owned\n")),
            ),
          ),
          DisableExtension.prepare({ type: "pack", name: "reviews" }),
        );
        const root = acquiredRoot(created, "hooks", "review");
        if (counted.result._tag !== "SetActivation") throw new Error("Expected a change");
        expect(Option.isSome(counted.result.blocked)).toBe(true);
        expect(counted.result.artifact.references).toEqual([
          {
            path: nodePath.relative(created.workspace.root, root),
            state: "retained",
            reason: "canonical content retained",
          },
        ]);
        // The blocked step describes no withdrawal, so the retained reference
        // is the last judgement of the member's tree and still hashes it.
        const steps = counted.result.execution.plan.jobs.flatMap((job) => job.steps);
        expect(steps.map((step) => step.readiness)).toEqual(["error"]);
        expect(steps[0]?.artifact?.executionChanges).toBeUndefined();
        // The outcome evaluation takes the root's real path its validation
        // resolved, and the selection frames the member's package hash from
        // its observation's walk; measured before: 4 probes and one more
        // directory read.
        expect({
          treeHashes: counted.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree")
            .length,
          rootDirectoryReads: counted.recording.counts(root).readDirectory,
          rootProbes: counted.recording.counts(root).access,
        }).toEqual({ treeHashes: 3, rootDirectoryReads: 3, rootProbes: 3 });
      });
    },
    { timeout: 60_000 },
  );

  it.effect(
    "prepares a Pack disable that observes in full a kept member whose registrations are gone",
    () => {
      const created = makeInstallWorld();
      cleanups.push(created.cleanup);
      created.registry.writeHook("review", [{ version: "1.0.0" }]);
      created.registry.writePack("reviews", [
        { version: "1.0.0", dependencies: { "@acme/hooks/review": "^1.0.0" } },
      ]);
      return Effect.gen(function* () {
        const counted = yield* measure(
          created,
          installPack("reviews").pipe(
            // Only a foreign MCP entry still runs the member's code, so the
            // member is kept while its withdrawal changes no registration.
            Effect.tap(() =>
              Effect.sync(() => {
                const script = nodePath.join(acquiredRoot(created, "hooks", "review"), "src");
                created.workspace.writeFile(".claude/settings.json", "{}\n");
                created.workspace.writeFile(
                  ".mcp.json",
                  `${JSON.stringify({
                    mcpServers: { foreign: { command: "bash", args: [`${script}/hook.sh`] } },
                  })}\n`,
                );
              }),
            ),
          ),
          DisableExtension.prepare({ type: "pack", name: "reviews" }),
        );
        const root = acquiredRoot(created, "hooks", "review");
        if (counted.result._tag !== "SetActivation") throw new Error("Expected a change");
        expect(counted.result.blocked).toEqual(Option.none());
        expect(counted.result.artifact.references).toEqual([
          {
            path: nodePath.relative(created.workspace.root, root),
            state: "retained",
            reason: "canonical content retained",
          },
        ]);
        // No withdrawal description judges the tree later, so the retained
        // reference still hashes it.
        const steps = counted.result.execution.plan.jobs.flatMap((job) => job.steps);
        expect(steps.map((step) => step.readiness)).toEqual(["ready"]);
        expect(steps[0]?.artifact?.executionChanges).toBeUndefined();
        // The outcome evaluation takes the root's real path its validation
        // resolved, and the selection frames the member's package hash from
        // its observation's walk; measured before: 4 probes and one more
        // directory read.
        expect({
          treeHashes: counted.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree")
            .length,
          rootDirectoryReads: counted.recording.counts(root).readDirectory,
          rootProbes: counted.recording.counts(root).access,
        }).toEqual({ treeHashes: 3, rootDirectoryReads: 4, rootProbes: 3 });
      });
    },
    { timeout: 60_000 },
  );

  it.effect(
    "refuses a Pack disable whose kept member's tree differs from its accepted resolution",
    () => {
      const created = makeInstallWorld();
      cleanups.push(created.cleanup);
      created.registry.writeHook("review", [{ version: "1.0.0" }]);
      created.registry.writePack("reviews", [
        { version: "1.0.0", dependencies: { "@acme/hooks/review": "^1.0.0" } },
      ]);
      return Effect.gen(function* () {
        yield* installPack("reviews");
        fs.writeFileSync(
          nodePath.join(acquiredRoot(created, "hooks", "review"), "src", "edited.txt"),
          "Edited.\n",
        );
        const failure = yield* DisableExtension.prepare({ type: "pack", name: "reviews" }).pipe(
          Effect.flip,
        );
        // The retirement still verifies the tree before anything takes its digest.
        expect(failure).toMatchObject({
          _tag: "OperationRefused",
          detail: "Cannot verify Pack member retirement",
          cause: {
            detail: expect.stringContaining("Cannot retire unverified acquired content at"),
          },
        });
      }).pipe(created.workspace.provide, Effect.provide(recordedNodeServices));
    },
    { timeout: 60_000 },
  );

  it.effect(
    "observes a kept member's tree unless a digest names its root and accepted row",
    () => {
      const created = makeInstallWorld();
      cleanups.push(created.cleanup);
      created.registry.writeHook("review", [{ version: "1.0.0" }]);
      created.registry.writePack("reviews", [
        { version: "1.0.0", dependencies: { "@acme/hooks/review": "^1.0.0" } },
      ]);
      return Effect.gen(function* () {
        yield* installPack("reviews");
        const root = acquiredRoot(created, "hooks", "review");
        const results = yield* Effect.gen(function* () {
          const accepted = Option.getOrUndefined(
            yield* (yield* LockfileReader).acceptedEntry("hook", "review"),
          );
          if (accepted === undefined) throw new Error("Expected an accepted row");
          /** Observe the kept member with `verifiedTree`, counting tree hashes. */
          const observe = (
            verifiedTree?: Parameters<typeof acceptedCanonicalObservationOfKeptRoot>[2],
          ) =>
            Effect.gen(function* () {
              const work = workObservations(false);
              const kept = yield* acceptedCanonicalObservationOfKeptRoot(
                { type: "hook", name: "review" },
                () => false,
                verifiedTree,
              ).pipe(work.provide);
              return {
                status: Option.getOrUndefined(kept)?.observed.observation.status,
                treeHashes: work.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree")
                  .length,
              };
            });
          const verified = { root, accepted, integrity: accepted.treeIntegrity };
          return {
            observed: yield* observe(),
            verified: yield* observe(verified),
            otherRoot: yield* observe({ ...verified, root: nodePath.join(root, "src") }),
            copiedRow: yield* observe({ ...verified, accepted: { ...accepted } }),
            otherDigest: yield* observe({
              ...verified,
              integrity: Schema.decodeUnknownSync(TreeIntegritySchema)(
                `sha256-tree-v2:${"0".repeat(64)}`,
              ),
            }),
          };
        }).pipe(withWorkspaceReadView);
        // Only a digest of this root against this phase's accepted row stands
        // in for the hash, and the observation still compares it.
        expect(results).toEqual({
          observed: { status: "usable", treeHashes: 1 },
          verified: { status: "usable", treeHashes: 0 },
          otherRoot: { status: "usable", treeHashes: 1 },
          copiedRow: { status: "usable", treeHashes: 1 },
          otherDigest: { status: "materialization-mismatch", treeHashes: 0 },
        });
      }).pipe(created.workspace.provide, Effect.provide(recordedNodeServices));
    },
    { timeout: 60_000 },
  );

  it.effect(
    "prepares a Pack disable that observes a member whose canonical root is gone",
    () => {
      const created = makeInstallWorld();
      cleanups.push(created.cleanup);
      created.registry.writeSkill("review", [{ version: "1.0.0", body: "Review." }]);
      created.registry.writePack("reviews", [
        { version: "1.0.0", dependencies: { "@acme/skills/review": "^1.0.0" } },
      ]);
      let root = "";
      return Effect.gen(function* () {
        const counted = yield* measure(
          created,
          installPack("reviews").pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                root = acquiredRoot(created, "skills", "review");
                fs.rmSync(root, { recursive: true });
              }),
            ),
          ),
          DisableExtension.prepare({ type: "pack", name: "reviews" }),
        );
        if (counted.result._tag !== "SetActivation") throw new Error("Expected a change");
        const relative = nodePath.relative(created.workspace.root, root);
        // Nothing is left to remove, so the root is no retirement target: the
        // member's observation reports it unknown and the retirement absent.
        expect(counted.result.artifact.targets).toEqual([{ path: "axm.json", change: "updated" }]);
        expect(counted.result.artifact.references).toEqual([
          { path: relative, state: "unknown", reason: "canonical content retained" },
          { path: relative, state: "absent", reason: "canonical content is already absent" },
        ]);
        // Unchanged: the kept member is still observed in full.
        expect({
          treeHashes: counted.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree")
            .length,
          rootProbes: counted.recording.counts(root).access,
        }).toEqual({ treeHashes: 0, rootProbes: 2 });
      });
    },
    { timeout: 60_000 },
  );
});

/**
 * Enabling an installed, disabled Registry subject whose native outputs are
 * current. Settlement observes the subject's tree; step collection takes that
 * observation for a Hook, whose projected outcomes judge its tree again in the
 * phase, and for an installed Rule or Knowledge subject, whose contributors the
 * shared projection exposure selects again. A Skill has no later judgement, so
 * step collection still observes it.
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
      // Each outcome evaluation takes its validation's real path of the root,
      // and each selection frames the package hash from its observation's
      // walk; measured before: 6 probes and 9 directory reads.
      observed: { treeHashes: 4, rootDirectoryReads: 7, rootProbes: 4 },
    },
    {
      type: "rule",
      plural: "rules",
      publish: (r: InstallWorld["registry"]) =>
        r.writeRule("review", [{ version: "1.0.0", body: "Review." }]),
      steps: [],
      repeated: { treeHashes: 3, rootDirectoryReads: 5, rootProbes: 3 },
      observed: { treeHashes: 2, rootDirectoryReads: 4, rootProbes: 2 },
    },
    {
      type: "knowledge",
      plural: "knowledge",
      publish: (r: InstallWorld["registry"]) =>
        r.writeKnowledge("review", [{ version: "1.0.0", body: "# Review\n" }]),
      steps: [],
      repeated: { treeHashes: 3, rootDirectoryReads: 4, rootProbes: 3 },
      observed: { treeHashes: 2, rootDirectoryReads: 3, rootProbes: 2 },
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

  it.effect(
    "observes the Hook itself unless the handed observation read this phase's accepted row",
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
        const adapter = yield* StepFailureConversion;
        // Settlement's observation of the disabled Hook in the current graph.
        const settle = Effect.gen(function* () {
          const graph = yield* (yield* DesiredStateReader).graph();
          const node = graph.nodes.find((item) => item.type === "hook" && item.name === "review");
          if (node === undefined) throw new Error("Expected the declared hook");
          return yield* observeDesiredCanonical(node);
        });
        const earlierPhase = yield* settle.pipe(withWorkspaceReadView);
        const counts = yield* Effect.gen(function* () {
          const proposal = yield* proposeDesiredState([
            { kind: "activation", type: "hook", name: "review", enabled: true },
          ]);
          // Collect the enable's steps as activation does, counting tree hashes.
          const collect = (settledSubject?: AcceptedCanonicalObservation) =>
            Effect.gen(function* () {
              const work = workObservations(false);
              const collected = yield* collectMaterializeSteps({
                desiredState: proposal.after,
                settings: proposal.settings,
                selection: {
                  target: Option.none(),
                  types: [],
                  subjects: [{ type: "hook", name: "review" }],
                },
                requireSubagentSupport: true,
                inventories: "presence",
                ...(settledSubject === undefined ? {} : { settledSubject }),
                adapter,
              }).pipe(work.provide);
              expect(collected.steps).toEqual([]);
              return work.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree").length;
            });
          const settled = yield* settle;
          expect(settled.observation.status).toBe("usable");
          const accepted = settled.accepted;
          if (accepted === undefined) throw new Error("Expected an accepted row");
          return {
            observed: yield* collect(),
            handed: yield* collect(settled),
            copiedRow: yield* collect({ ...settled, accepted: { ...accepted } }),
            otherName: yield* collect({
              ...settled,
              desired: { ...settled.desired, name: "other" },
            }),
            earlierPhase: yield* collect(earlierPhase),
          };
        }).pipe(withWorkspaceReadView);
        // Only an observation of this Hook against this phase's accepted row
        // stands in; a structurally equal row, another name, or an earlier
        // read phase leaves step collection to hash the tree itself.
        expect(counts).toEqual({
          observed: 1,
          handed: 0,
          copiedRow: 1,
          otherName: 1,
          earlierPhase: 1,
        });
      }).pipe(created.workspace.provide, Effect.provide(recordedNodeServices));
    },
    { timeout: 60_000 },
  );
});

/** The inventory with `type` `name` no longer listed as installed. */
const notInstalled =
  (type: ExtensionType, name: string): InventoryView =>
  (inventory) => ({
    ...inventory,
    items: inventory.items.map((item) =>
      item.type === type && item.name === name ? { ...item, installed: false } : item,
    ),
  });

/** Install the Registry `type` `review`, then disable it. */
const installDisabled = (type: ExtensionType, plural: string) =>
  Effect.gen(function* () {
    const installed = yield* applyInstallAcceptingExecutionChanges(
      installRequest({
        type,
        subject: { kind: "source", source: `test:@acme/${plural}/review` },
      }),
    );
    expect(deriveOperationOutcome(installed)).toBe("applied");
    const disabled = yield* applyActivationAcceptingExecutionChanges({
      type,
      name: "review",
      enabled: false,
    });
    expect(disabled._tag === "Resolved" ? disabled.outcome : disabled._tag).toBe("applied");
  });

describe("Activation planning keeps step collection's judgement of a subject nothing selects again", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const rows = [
    {
      type: "rule",
      plural: "rules",
      publish: (r: InstallWorld["registry"]) =>
        r.writeRule("review", [{ version: "1.0.0", body: "Review." }]),
    },
    {
      type: "knowledge",
      plural: "knowledge",
      publish: (r: InstallWorld["registry"]) =>
        r.writeKnowledge("review", [{ version: "1.0.0", body: "# Review\n" }]),
    },
  ] as const;
  for (const row of rows)
    it.effect(
      `observes a ${row.type} the inventory does not list as installed`,
      () => {
        const created = makeInstallWorld();
        cleanups.push(created.cleanup);
        row.publish(created.registry);
        return Effect.gen(function* () {
          const counted = yield* measure(
            created,
            installDisabled(row.type, row.plural),
            EnableExtension.prepare({ type: row.type, name: "review" }),
            // Step collection then rematerializes the subject from its source,
            // and its prepared projection leaves the subject's tree unjudged.
            notInstalled(row.type, "review"),
          );
          const root = acquiredRoot(created, row.plural, "review");
          if (counted.result._tag !== "SetActivation") throw new Error("Expected a change");
          expect(stepsOf(counted.result)).toEqual([
            { key: `${row.type}:review`, readiness: "ready" },
          ]);
          // Unchanged: settlement's and step collection's own observations,
          // the last judgement of the tree in this phase.
          expect({
            treeHashes: counted.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree")
              .length,
            rootProbes: counted.recording.counts(root).access,
          }).toEqual({ treeHashes: 2, rootProbes: 2 });
        });
      },
      { timeout: 60_000 },
    );
});

describe("Activation planning still judges a handed Rule or Knowledge tree later in the phase", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /**
   * Prepare enabling `type` `review` with a foreign edit right after
   * settlement's tree hash, counting every tree hash of the preparation.
   */
  const prepareEditedAfterSettlement = (
    created: InstallWorld,
    type: ExtensionType,
    plural: string,
    file: string,
  ) =>
    Effect.gen(function* () {
      yield* installDisabled(type, plural);
      const root = acquiredRoot(created, plural, "review");
      let treeHashes = 0;
      const prepared = yield* EnableExtension.prepare({ type, name: "review" }).pipe(
        Effect.provideService(CurrentWorkObserver, {
          record: (fact) => {
            if (fact.kind !== "axm.hash.materialized-tree") return;
            treeHashes += 1;
            if (treeHashes === 1) fs.appendFileSync(nodePath.join(root, file), "Edited.\n");
          },
          detailSelected: () => false,
        }),
      );
      expect(treeHashes).toBeGreaterThan(0);
      if (prepared._tag !== "SetActivation") throw new Error("Expected a change");
      return { prepared, treeHashes };
    });

  it.effect(
    "blocks a rule enable whose tree changes after settlement observed it",
    () => {
      const created = makeInstallWorld();
      cleanups.push(created.cleanup);
      created.registry.writeRule("review", [{ version: "1.0.0", body: "Review." }]);
      return Effect.gen(function* () {
        const { prepared } = yield* prepareEditedAfterSettlement(
          created,
          "rule",
          "rules",
          nodePath.join("src", "RULE.md"),
        );
        // The shared projection selects the Rule again and blocks the change.
        expect(Option.isNone(prepared.refusal)).toBe(true);
        expect(Option.getOrUndefined(prepared.blocked)?.detail).toBe(
          "Cannot establish the sources exposed by the transition's shared projections",
        );
      }).pipe(created.workspace.provide, Effect.provide(recordedNodeServices));
    },
    { timeout: 60_000 },
  );

  it.effect(
    "leaves a knowledge bundle whose tree changes after settlement observed it to its later selection",
    () => {
      const created = makeInstallWorld();
      cleanups.push(created.cleanup);
      created.registry.writeKnowledge("review", [{ version: "1.0.0", body: "# Review\n" }]);
      return Effect.gen(function* () {
        const { prepared, treeHashes } = yield* prepareEditedAfterSettlement(
          created,
          "knowledge",
          "knowledge",
          nodePath.join("src", "index.md"),
        );
        // The shared projection selects the bundle again and judges its tree,
        // which excludes a bundle that is no longer usable from the region
        // rather than refusing the change.
        expect(treeHashes).toBe(2);
        expect(Option.isNone(prepared.refusal)).toBe(true);
        expect(Option.isNone(prepared.blocked)).toBe(true);
        expect(stepsOf(prepared)).toEqual([]);
      }).pipe(created.workspace.provide, Effect.provide(recordedNodeServices));
    },
    { timeout: 60_000 },
  );

  it.effect(
    "observes the rule itself unless its inventory lists it as installed",
    () => {
      const created = makeInstallWorld();
      cleanups.push(created.cleanup);
      created.registry.writeRule("review", [{ version: "1.0.0", body: "Review." }]);
      return Effect.gen(function* () {
        yield* installDisabled("rule", "rules");
        const adapter = yield* StepFailureConversion;
        const records = yield* WorkspaceRecords;
        /** Records whose Rule inventory is `read`. */
        const presenting = (
          read: (
            inventory: ExtensionInventory,
          ) => Effect.Effect<ExtensionInventory, WorkspaceRootEscape>,
        ) => ({
          ...records,
          getExtensionInventory: (
            type: Parameters<typeof records.getExtensionInventory>[0],
            options: Parameters<typeof records.getExtensionInventory>[1],
          ) =>
            type === "rule"
              ? records.getExtensionInventory(type, options).pipe(Effect.flatMap(read))
              : records.getExtensionInventory(type, options),
        });
        const failing = presenting(() =>
          Effect.fail(new WorkspaceRootEscape({ workspaceRoot: "here", allowedRoot: "there" })),
        );
        const results = yield* Effect.gen(function* () {
          const proposal = yield* proposeDesiredState([
            { kind: "activation", type: "rule", name: "review", enabled: true },
          ]);
          const graph = yield* (yield* DesiredStateReader).graph();
          const current = graph.nodes.find(
            (node) => node.type === "rule" && node.name === "review",
          );
          if (current === undefined) throw new Error("Expected the declared rule");
          const settled = yield* observeDesiredCanonical(current);
          expect(settled.observation.status).toBe("usable");
          // Collect the enable's steps as activation does, counting tree hashes.
          const collect = (
            presented: typeof records,
            settledSubject?: AcceptedCanonicalObservation,
          ) =>
            Effect.gen(function* () {
              const work = workObservations(false);
              const collected = yield* collectMaterializeSteps({
                desiredState: proposal.after,
                settings: proposal.settings,
                selection: {
                  target: Option.none(),
                  types: [],
                  subjects: [{ type: "rule", name: "review" }],
                },
                requireSubagentSupport: true,
                inventories: "presence",
                ...(settledSubject === undefined ? {} : { settledSubject }),
                adapter,
              }).pipe(
                Effect.provideService(WorkspaceRecords, presented),
                work.provide,
                Effect.result,
              );
              return {
                steps: Result.isSuccess(collected)
                  ? collected.success.steps.map((step) => step.key)
                  : collected.failure,
                treeHashes: work.facts.filter((fact) => fact.kind === "axm.hash.materialized-tree")
                  .length,
              };
            });
          const unlisted = presenting((inventory) =>
            Effect.succeed(notInstalled("rule", "review")(inventory)),
          );
          return {
            observed: yield* collect(records),
            handed: yield* collect(records, settled),
            unlisted: yield* collect(unlisted),
            unlistedHanded: yield* collect(unlisted, settled),
            failing: yield* collect(failing),
            failingHanded: yield* collect(failing, settled),
          };
        }).pipe(withWorkspaceReadView);
        // An installed Rule takes the handed observation. One the inventory
        // does not list, or whose inventory read fails, is observed again, and
        // the failure surfaces as it does without the handed observation.
        expect(results.observed).toEqual({ steps: [], treeHashes: 1 });
        expect(results.handed).toEqual({ steps: [], treeHashes: 0 });
        expect(results.unlisted.treeHashes).toBe(1);
        expect(results.unlistedHanded).toEqual(results.unlisted);
        expect(results.unlisted.steps).toEqual(["rule:review"]);
        expect(results.failing.treeHashes).toBe(1);
        expect(results.failingHanded).toEqual(results.failing);
        expect(results.failing.steps).toMatchObject({ _tag: "WorkspaceRootEscape" });
      }).pipe(created.workspace.provide, Effect.provide(recordedNodeServices));
    },
    { timeout: 60_000 },
  );
});
