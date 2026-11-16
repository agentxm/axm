/**
 * Desired-state evaluation work while planning materialization.
 *
 * Step collection compares what it plans with the committed workspace's
 * current desired graph and output authority, which come from the current
 * no-option evaluation. Planning an agent addition evaluates that graph once
 * and hands it to step collection; collecting steps directly evaluates it
 * once, lazily, where the comparison first needs it. These counts run the
 * production planning outside any read view over a real temporary
 * workspace, beneath the production file system.
 */
import { writeFileSync } from "node:fs";
import * as nodePath from "node:path";
import { isDeepStrictEqual } from "node:util";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import {
  agentOutputAuthorityFrom,
  captureAgentOutputAuthority,
} from "@agentxm/workspace-kernel/projection";
import {
  collectMaterializeSteps,
  StepFailureConversion,
} from "@agentxm/workspace-kernel/reconciliation";
import {
  DesiredStateReader,
  SettingsReader,
  unresolvedPackRoutes,
  WorkspaceLocation,
  type DesiredStateReaderService,
} from "@agentxm/workspace-kernel/workspace-state";

import { SyncWorkspace } from "./sync-workspace.js";
import { applySync, makeSyncFixture, writeAuthoredRule } from "../testing/sync-fixture.js";

/** The recording file system replaces the platform one beneath every fixture layer. */
const provideRecording = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provide(Layer.merge(NodeServices.layer, layerRecordingFileSystem(NodeServices.layer))),
  );

const packManifest = (name: string) =>
  JSON.stringify({
    type: "pack",
    owner: "@acme",
    name,
    version: "1.0.0",
    description: "Pack",
    dependencies: {},
  });

/** A workspace with one installed authored Rule and one authored Pack. */
const plannedWorkspace = () => {
  const workspace = makeSyncFixture({
    settings: {
      owner: "@acme",
      agents: ["claude-code"],
      rules: { review: "workspace" },
      packs: { bundle: { source: "workspace" } },
    },
    files: { "packs/bundle/pack.json": packManifest("bundle") },
  });
  writeAuthoredRule(workspace.root, "review", "Review every change.");
  return workspace;
};

/** Run `measured` with the current reader counting its no-option evaluations. */
const countEvaluations = <A, E, R>(measured: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const reader = yield* DesiredStateReader;
    let evaluations = 0;
    const evaluate: DesiredStateReaderService["evaluate"] = (options) =>
      Effect.suspend(() => {
        if (options === undefined) evaluations++;
        return reader.evaluate(options);
      });
    const counting: DesiredStateReaderService = {
      ...reader,
      evaluate,
      graph: (options) => Effect.map(evaluate(options), (evaluation) => evaluation.graph),
    };
    const result = yield* measured.pipe(
      Effect.provideService(DesiredStateReader, counting),
      Effect.result,
    );
    return { result, evaluations };
  });

/** Physical reads of the documents a no-option evaluation reads; the absent user settings are probed. */
const documentReads = (workspace: ReturnType<typeof plannedWorkspace>) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    const location = yield* WorkspaceLocation;
    const inherited = nodePath.join(workspace.home, ".axm", "workspace", "axm.json");
    return {
      settings: recording.contentReads(location.settingsPath),
      inherited: recording.counts(inherited).access ?? 0,
      lockfile: recording.contentReads(location.lockPath),
      pack: recording.contentReads(nodePath.join(workspace.root, "packs/bundle/pack.json")),
    };
  });

describe("Materialization planning's desired-state evaluation", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "evaluates the current graph once while planning an agent addition",
    () => {
      const workspace = plannedWorkspace();
      cleanups.push(workspace.cleanup);
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            const recording = yield* FileSystemRecorder;
            recording.reset();
            const { result, evaluations } = yield* countEvaluations(
              SyncWorkspace.planMaterialization({
                configuredAgents: ["claude-code", "gemini-cli"],
                newlyConfiguredAgentIds: ["gemini-cli"],
              }),
            );
            expect({
              steps: result._tag === "Success" ? result.success.steps.map((step) => step.key) : [],
              evaluations,
              reads: yield* documentReads(workspace),
            }).toEqual({
              steps: [],
              // Planning's own evaluation; step collection evaluated three more (four before).
              evaluations: 1,
              // Each removed evaluation read the settings, probed the absent user settings, and
              // read the lockfile and the authored Pack manifest; the settings were also read
              // once more for the prior agent set (23, 9, 26 and 11 before).
              reads: { settings: 19, inherited: 6, lockfile: 23, pack: 8 },
            });
          }),
        )
        .pipe(provideRecording);
    },
    { timeout: 60_000 },
  );

  it.effect(
    "evaluates the current graph once while collecting steps directly",
    () => {
      const workspace = plannedWorkspace();
      cleanups.push(workspace.cleanup);
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            const graph = yield* (yield* DesiredStateReader).graph();
            const adapter = yield* StepFailureConversion;
            const recording = yield* FileSystemRecorder;
            recording.reset();
            const { result, evaluations } = yield* countEvaluations(
              collectMaterializeSteps({
                desiredState: graph,
                selection: { target: Option.none(), types: [] },
                inventories: "presence",
                adapter,
              }),
            );
            expect({
              success: result._tag === "Success",
              evaluations,
              reads: yield* documentReads(workspace),
            }).toEqual({
              success: true,
              // One lazy evaluation serves the MCP and Hook comparisons and the output authority
              // (three before).
              evaluations: 1,
              // Two evaluations and one prior agent-set read fewer (11, 5, 15 and 7 before).
              reads: { settings: 8, inherited: 3, lockfile: 13, pack: 5 },
            });
          }),
        )
        .pipe(provideRecording);
    },
    { timeout: 60_000 },
  );

  it.effect(
    "derives the prior output authority from the committed workspace, not from a proposal",
    () => {
      const workspace = plannedWorkspace();
      cleanups.push(workspace.cleanup);
      writeAuthoredRule(workspace.root, "lint", "Lint every change.");
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            const committed = yield* captureAgentOutputAuthority();
            // The proposal adds a Rule the committed workspace does not declare.
            const current = yield* (yield* SettingsReader).settings;
            const review = current.rules?.["review"];
            if (review === undefined) throw new Error("Expected the committed Rule");
            const settings = { ...current, rules: { ...current.rules, lint: review } };
            const proposal = yield* (yield* DesiredStateReader).evaluate({ settings });
            const proposed = yield* agentOutputAuthorityFrom(Effect.succeed(proposal));
            const adapter = yield* StepFailureConversion;
            const { result, evaluations } = yield* countEvaluations(
              collectMaterializeSteps({
                desiredState: proposal.graph,
                settings,
                selection: { target: Option.none(), types: [] },
                inventories: "presence",
                adapter,
              }),
            );
            if (result._tag !== "Success") throw new Error("Expected step collection to succeed");
            const prior = result.success.ruleProjection.priorAuthority;
            const ruleRegions = (authority: typeof committed | undefined) =>
              (authority?.expectedRegions.rule ?? []).map((region) => region.name).sort();
            expect({
              proposed: ruleRegions(proposed),
              prior: ruleRegions(prior),
              committedPrior: isDeepStrictEqual(prior, committed),
              evaluations,
            }).toEqual({
              proposed: ["lint", "review"],
              // The proposal's Rule is not yet the workspace's output.
              prior: ["review"],
              committedPrior: true,
              evaluations: 1,
            });
          }),
        )
        .pipe(provideRecording);
    },
    { timeout: 60_000 },
  );

  it.effect(
    "withholds native insertion while the committed workspace's Pack routes are unresolved",
    () => {
      const workspace = plannedWorkspace();
      cleanups.push(workspace.cleanup);
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            // The proposal no longer configures the Pack, so its own routes are all resolved.
            const current = yield* (yield* SettingsReader).settings;
            const settings = { ...current, packs: {} };
            const proposal = yield* (yield* DesiredStateReader).graph({ settings });
            workspace.remove("packs/bundle/pack.json");
            const committed = yield* (yield* DesiredStateReader).graph();
            const adapter = yield* StepFailureConversion;
            const { result, evaluations } = yield* countEvaluations(
              collectMaterializeSteps({
                desiredState: proposal,
                settings,
                configuredAgents: ["claude-code", "gemini-cli"],
                selection: { target: Option.none(), types: [] },
                inventories: "presence",
                adapter,
              }),
            );
            if (result._tag !== "Success") throw new Error("Expected step collection to succeed");
            expect({
              committedUnresolved: unresolvedPackRoutes(committed).length,
              proposedUnresolved: unresolvedPackRoutes(proposal).length,
              eligibleAgents: [
                ...(result.success.ruleProjection.nativeInsertionEligibleAgentIds ?? []),
              ],
              evaluations,
            }).toEqual({
              committedUnresolved: 1,
              proposedUnresolved: 0,
              // The added agent would be eligible if the proposal stood in for the committed graph.
              eligibleAgents: [],
              evaluations: 1,
            });
          }),
        )
        .pipe(provideRecording);
    },
    { timeout: 60_000 },
  );

  it.effect(
    "evaluates nothing when step collection fails before comparing with the current graph",
    () => {
      const workspace = plannedWorkspace();
      cleanups.push(workspace.cleanup);
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            const graph = yield* (yield* DesiredStateReader).graph();
            const adapter = yield* StepFailureConversion;
            const location = yield* WorkspaceLocation;
            writeFileSync(location.settingsPath, "{ not json");
            const { result, evaluations } = yield* countEvaluations(
              collectMaterializeSteps({ desiredState: graph, inventories: "presence", adapter }),
            );
            // The settings read fails first; the comparison's evaluation never runs.
            expect({
              failure: result._tag === "Failure" ? result.failure : undefined,
              evaluations,
            }).toMatchObject({
              failure: { _tag: "SettingsParseError", path: location.settingsPath },
              evaluations: 0,
            });
          }),
        )
        .pipe(provideRecording);
    },
    { timeout: 60_000 },
  );

  it.effect(
    "fails where the current graph is first compared when its evaluation fails",
    () => {
      const workspace = plannedWorkspace();
      cleanups.push(workspace.cleanup);
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            const graph = yield* (yield* DesiredStateReader).graph();
            const adapter = yield* StepFailureConversion;
            const location = yield* WorkspaceLocation;
            writeFileSync(location.lockPath, "{ not json");
            const { result, evaluations } = yield* countEvaluations(
              collectMaterializeSteps({ desiredState: graph, inventories: "presence", adapter }),
            );
            expect({
              failure: result._tag === "Failure" ? result.failure : undefined,
              evaluations,
            }).toMatchObject({
              failure: { _tag: "LockfileParseError", path: location.lockPath, raw: "{ not json" },
              evaluations: 1,
            });
          }),
        )
        .pipe(provideRecording);
    },
    { timeout: 60_000 },
  );
});
