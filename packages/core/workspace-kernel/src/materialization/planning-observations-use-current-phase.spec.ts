import { expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Tracer from "effect/Tracer";
import { defineSpecification } from "@agentxm/specification-metadata";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { OfflineHttpClient, RegistryClientFactoryTest } from "@agentxm/registry-client/testing";
import { NativeWriteAuthorityPermissive } from "../agent-adapters/testing.js";
import { NativePlatformTest, withDetailedWork } from "../locations/testing.js";
import { WorkspaceTransactionScope } from "../settlement/index.js";
import { WorkspaceFileWriteLocksLive } from "../settlement/live.js";
import {
  DesiredStateReader,
  LockfileReader,
  SettingsReader,
  WorkspaceLocation,
  WorkspaceRecords,
  withWorkspaceObservationReadView,
} from "../workspace-state/index.js";
import { makeBaseManagerMembers } from "./index.js";
import { WorkspaceStateLive, layer as WorkspaceLive } from "../workspace-state/live.js";
import {
  ProjectionParticipants,
  WorkspaceInvariantFacts,
  type ProjectionParticipant,
} from "../projection/index.js";
import { WorkspaceInvariantFactsLive } from "../projection/live.js";

export const specification = defineSpecification({
  requirement: "workspace/materialization/planning-observations-use-current-phase",
  title: "Planning consumers share the executing phase's observations",
  statement:
    "Planning consumers shall consume the executing workspace phase's stable document and desired-state observations, sharing equivalent reads with their caller and observing fresh inputs in a subsequent phase.",
  class: "functional",
  role: "supporting",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  boundary: "platform",
  boundaryRationale:
    "Production workspace readers and invariant evaluation share real filesystem documents across registered participant ports; no mutation or remote publication is exercised.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

it.effect(
  "nested participants share decoding and evaluation, then reobserve after phase exit",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const root = yield* fs.makeTempDirectoryScoped();
      const marker = `${root}/marker.txt`;
      const settingsWithSource = (name: string) =>
        JSON.stringify({
          sources: [{ name, type: "registry", location: "https://registry.example.test" }],
        });
      yield* fs.writeFileString(`${root}/axm.json`, settingsWithSource("original"));
      yield* fs.writeFileString(`${root}/axm.lock`, "version = 1\n");
      yield* fs.writeFileString(marker, "original");
      const spans: Tracer.NativeSpan[] = [];
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      const seen: string[] = [];
      const suppliedGraphs: Parameters<ProjectionParticipant["projectionPlans"]>[0][] = [];
      const participant: ProjectionParticipant = {
        units: [],
        projectionPlans: (options) =>
          withWorkspaceObservationReadView(
            Effect.gen(function* () {
              suppliedGraphs.push(options);
              yield* (yield* LockfileReader).lockfile.pipe(Effect.orDie);
              yield* (yield* DesiredStateReader).graph().pipe(Effect.orDie);
              seen.push(
                yield* (yield* FileSystem.FileSystem).readFileString(marker).pipe(Effect.orDie),
              );
              return [];
            }),
          ).pipe(Effect.orDie),
      };
      const state = WorkspaceStateLive({
        projectRoot: decodeAbsolutePathSync(root),
        scope: "project",
        allowUninitialized: true,
      });
      const layer = WorkspaceInvariantFactsLive.pipe(
        Layer.provideMerge(state),
        Layer.provide(
          Layer.succeed(ProjectionParticipants, {
            aggregates: [participant, participant],
            subagents: Option.none(),
          }),
        ),
        Layer.provide(RegistryClientFactoryTest(OfflineHttpClient)),
        Layer.provide(NativeWriteAuthorityPermissive),
      );
      yield* Effect.gen(function* () {
        const facts = yield* WorkspaceInvariantFacts;
        const liveSettings = yield* SettingsReader;
        const manager = makeBaseManagerMembers({
          location: yield* WorkspaceLocation,
          type: "hook",
          spanPrefix: "PlanningHookManager",
          settings: liveSettings,
          records: yield* WorkspaceRecords,
          refName: (ref) => ref.hook.name,
          materializeInstall: () => Effect.die("Inspection never materializes"),
        });
        const sourceNames = (settings: typeof liveSettings) =>
          settings.configuredSources.pipe(
            Effect.map((sources) => sources.map((source) => source.name)),
          );
        expect(yield* sourceNames(liveSettings)).toContain("original");
        spans.length = 0; // Workspace construction is a separate validation obligation.
        yield* withWorkspaceObservationReadView(
          Effect.gen(function* () {
            yield* (yield* LockfileReader).lockfile;
            yield* (yield* DesiredStateReader).graph();
            expect(yield* (yield* FileSystem.FileSystem).readFileString(marker)).toBe("original");
            const phaseSettings = yield* SettingsReader;
            expect(yield* sourceNames(phaseSettings)).toContain("original");
            yield* fs.writeFileString(marker, "external edit");
            yield* fs.writeFileString(`${root}/axm.json`, settingsWithSource("edited"));
            expect(yield* sourceNames(phaseSettings)).toContain("original");
            expect(yield* facts.projectionFacts).toEqual([]);
            expect(yield* manager.isInstalled({ target: { type: "hook", name: "missing" } })).toBe(
              false,
            );
            expect(yield* manager.isInstalled({ target: { type: "hook", name: "missing" } })).toBe(
              false,
            );
          }),
        );
        expect(seen).toEqual(["original", "original"]);
        expect(spans.filter((span) => span.name === "axm.parse.lockfile")).toHaveLength(1);
        expect(spans.filter((span) => span.name === "DesiredStateReader.evaluate")).toHaveLength(1);
        expect(yield* sourceNames(liveSettings)).toContain("edited");
        yield* withWorkspaceObservationReadView(
          Effect.gen(function* () {
            expect(yield* sourceNames(yield* SettingsReader)).toContain("edited");
            yield* facts.projectionFacts;
          }),
        );
        expect(seen).toEqual(["original", "original", "external edit", "external edit"]);
        expect(spans.filter((span) => span.name === "axm.parse.lockfile")).toHaveLength(2);
        expect(spans.filter((span) => span.name === "DesiredStateReader.evaluate")).toHaveLength(2);
        yield* withWorkspaceObservationReadView(
          Effect.gen(function* () {
            const proposed = yield* (yield* DesiredStateReader).graph();
            yield* facts.projectionFactsForGraph(proposed);
            expect(suppliedGraphs.slice(-2)).toEqual([
              { desiredGraph: proposed },
              { desiredGraph: proposed },
            ]);
          }),
        );
      }).pipe(
        Effect.provide(
          layer.pipe(
            Layer.provideMerge(
              ConfigProvider.layer(
                ConfigProvider.fromEnv({ env: { AXM_USER_HOME: `${root}/home` } }),
              ),
            ),
          ),
        ),
        withDetailedWork(tracer),
      );
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.provideMerge(WorkspaceFileWriteLocksLive, NativePlatformTest)),
    ),
);

it.effect(
  "separate workspace compositions retain their own readers in a shared layer memo map",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const firstRoot = yield* fs.makeTempDirectoryScoped();
      const secondRoot = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(`${firstRoot}/axm.json`, JSON.stringify({ agents: ["codex"] }));
      yield* fs.writeFileString(
        `${secondRoot}/axm.json`,
        JSON.stringify({ agents: ["claude-code"] }),
      );
      const workspace = (root: string) =>
        WorkspaceLive({
          projectRoot: decodeAbsolutePathSync(root),
          scope: "project",
          allowUninitialized: true,
        });
      const firstLayer = workspace(firstRoot);
      const secondLayer = workspace(secondRoot);
      const memo = yield* Layer.makeMemoMap;
      const scope = yield* Effect.scope;
      const first = yield* Layer.buildWithMemoMap(firstLayer, memo, scope);
      const second = yield* Layer.buildWithMemoMap(secondLayer, memo, scope);
      const repeated = yield* Layer.buildWithMemoMap(firstLayer, memo, scope);
      expect(Context.get(first, SettingsReader)).toBe(Context.get(repeated, SettingsReader));
      expect((yield* Context.get(first, SettingsReader).settings).agents).toEqual(["codex"]);
      expect((yield* Context.get(second, SettingsReader).settings).agents).toEqual(["claude-code"]);
      const readInPhase = withWorkspaceObservationReadView(
        Effect.gen(function* () {
          return yield* (yield* SettingsReader).settings;
        }),
      );
      expect((yield* readInPhase.pipe(Effect.provide(first))).agents).toEqual(["codex"]);
      expect((yield* readInPhase.pipe(Effect.provide(second))).agents).toEqual(["claude-code"]);
      const firstTransaction = Context.get(first, WorkspaceTransactionScope);
      const secondTransaction = Context.get(second, WorkspaceTransactionScope);
      expect(yield* firstTransaction.acquire({ command: "workspace-isolation" })).toEqual(
        Option.none(),
      );
      expect(yield* firstTransaction.isHeld).toBe(true);
      expect(yield* Context.get(repeated, WorkspaceTransactionScope).isHeld).toBe(true);
      expect(yield* secondTransaction.isHeld).toBe(false);
    }).pipe(
      Effect.scoped,
      Effect.provide(
        Layer.mergeAll(NativeWriteAuthorityPermissive, WorkspaceFileWriteLocksLive).pipe(
          Layer.provideMerge(NativePlatformTest),
        ),
      ),
    ),
);
