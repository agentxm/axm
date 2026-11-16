/**
 * Post-write verification work inside a closure.
 *
 * A closure verifies its result twice after its last write: the materialize
 * operation checks that the installation is observable, and the closure checks
 * its native outputs. Each verification is one fresh read phase, so its readers
 * share one physical observation of the workspace documents instead of parsing
 * them once per reader. These counts run real managers over a real temporary
 * workspace, beneath the production read views.
 */
import * as fs from "node:fs";
import * as nodePath from "node:path";

import { CurrentWorkObserver, type WorkFact } from "@agentxm/host-primitives/work-observation";
import {
  FileSystemRecorder,
  makeRecordingFileSystem,
  type FileSystemRecording,
} from "@agentxm/test-support";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import * as Tracer from "effect/Tracer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import { applyPlanExecution } from "@agentxm/workspace-kernel/operations";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { SyncWorkspace } from "./sync-workspace.js";
import {
  applySync,
  makeFileRegistry,
  addConfiguredAgent,
  makeSyncFixture,
  syncRequest,
  withdrawMcpServer,
  type SyncFixture,
} from "../testing/sync-fixture.js";
import { writeLocalHookPackage, writeLocalSkillPackage } from "../testing/local-packages.js";

const spanName = (span: Tracer.AnySpan | undefined) =>
  span === undefined ? "none" : span._tag === "Span" ? span.name : "external";

const parentOf = (span: Tracer.AnySpan): Tracer.AnySpan | undefined =>
  span._tag === "Span" ? Option.getOrUndefined(span.parent) : undefined;

const ancestors = function* (span: Tracer.AnySpan | undefined) {
  for (let current = span; current !== undefined; current = parentOf(current)) yield current;
};

const operationPhase = (span: Tracer.AnySpan | undefined) => {
  for (const current of ancestors(span))
    if (current instanceof Tracer.NativeSpan && current.name === "axm.operation.phase")
      return String(current.attributes.get("axm.operation.phase"));
  return "none";
};

const isWithin = (span: Tracer.AnySpan | undefined, ancestor: Tracer.AnySpan) => {
  for (const current of ancestors(span)) if (current === ancestor) return true;
  return false;
};

/**
 * One observed invocation: spans, work facts with their parent span, and the
 * calls recorded by the workspace `FileSystem` the read views are built over.
 * Direct `node:fs` native I/O, such as native skill links, is not visible.
 */
const makeObservation = () => {
  const spans: Tracer.NativeSpan[] = [];
  const facts: Array<{ readonly fact: WorkFact; readonly parent: Tracer.AnySpan | undefined }> = [];
  /** Optional test interventions at span boundaries and file reads. */
  const hooks: {
    started?: (span: Tracer.NativeSpan) => void;
    ended?: (span: Tracer.NativeSpan) => void;
    failRead?: (path: string) => boolean;
  } = {};
  class ObservedSpan extends Tracer.NativeSpan {
    override end(endTime: bigint, exit: Exit.Exit<unknown, unknown>) {
      const open = this.status._tag === "Started";
      super.end(endTime, exit);
      if (open) hooks.ended?.(this);
    }
  }
  const tracer = Tracer.make({
    span(options) {
      const span = new ObservedSpan(options);
      spans.push(span);
      hooks.started?.(span);
      return span;
    },
  });
  let recording: FileSystemRecording | undefined;
  const fileSystemLayer = Layer.effectContext(
    Effect.gen(function* () {
      const made = makeRecordingFileSystem(yield* FileSystem.FileSystem);
      recording = made.recording;
      const base = made.fileSystem;
      // A read the test marks unreadable fails as the platform reports a denied read.
      const fileSystem = FileSystem.make({
        ...base,
        readFile: (path) =>
          Effect.suspend(() =>
            hooks.failRead?.(path) === true
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: "PermissionDenied",
                    module: "FileSystem",
                    method: "readFile",
                    pathOrDescriptor: path,
                  }),
                )
              : base.readFile(path),
          ),
      });
      return Context.make(FileSystem.FileSystem, fileSystem).pipe(
        Context.add(FileSystemRecorder, made.recording),
      );
    }),
  ).pipe(Layer.provide(NodeServices.layer));
  const observed = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.withTracer(tracer),
      Effect.withTracerEnabled(true),
      Effect.provideService(CurrentWorkObserver, {
        record: (fact, parent) => {
          facts.push({ fact, parent });
        },
        detailSelected: () => false,
      }),
    );
  /** Forget fixture setup and preparation; only the observed segment remains. */
  const reset = () => {
    recording?.reset();
    spans.length = 0;
    facts.length = 0;
  };
  const parses = (kind: "axm.parse.settings" | "axm.parse.lockfile", within?: Tracer.AnySpan) =>
    facts.filter(
      ({ fact, parent }) =>
        fact.kind === kind &&
        (within === undefined ? operationPhase(parent) === "apply" : isWithin(parent, within)),
    ).length;
  const observationPhases = () => spans.filter((span) => span.name === "axm.observation.phase");
  /** Apply-time read phases, labelled by the verification they enclose. */
  const verificationPhases = () =>
    observationPhases()
      .filter((phase) => operationPhase(phase) === "apply")
      .map((phase) => ({
        verification: spans.some(
          (span) => span.name.endsWith(".isInstalled") && parentOf(span) === phase,
        )
          ? "operation"
          : "closure",
        settings: parses("axm.parse.settings", phase),
        lockfile: parses("axm.parse.lockfile", phase),
      }));
  /** Parses under a manager's installation-presence check during apply. */
  const presenceParses = (kind: "axm.parse.settings" | "axm.parse.lockfile") =>
    facts.filter(
      ({ fact, parent }) =>
        fact.kind === kind &&
        operationPhase(parent) === "apply" &&
        [...ancestors(parent)].some((span) => spanName(span).endsWith(".isInstalled")),
    ).length;
  const summary = (root: string) => ({
    settingsParses: parses("axm.parse.settings"),
    lockfileParses: parses("axm.parse.lockfile"),
    presenceSettingsParses: presenceParses("axm.parse.settings"),
    presenceLockfileParses: presenceParses("axm.parse.lockfile"),
    settingsContentReads: recording?.contentReads(nodePath.join(root, "axm.json")),
    lockfileContentReads: recording?.contentReads(nodePath.join(root, "axm.lock")),
    observationPhases: observationPhases().length,
    verificationPhases: verificationPhases(),
  });
  return { hooks, fileSystemLayer, observed, reset, summary };
};

type Observation = ReturnType<typeof makeObservation>;

const provideObserved =
  (observation: Observation) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    // The recording file system replaces the platform one beneath every fixture layer.
    effect.pipe(Effect.provide(Layer.merge(NodeServices.layer, observation.fileSystemLayer)));

/** Prepare a restore, forget the preparation's work, then apply the prepared candidate. */
const observeRestore = (workspace: SyncFixture, observation: Observation) =>
  workspace.provide(
    observation.observed(
      Effect.gen(function* () {
        const candidate = yield* SyncWorkspace.prepare(syncRequest());
        if (candidate._tag === "AlreadyReconciled") throw new Error("Expected a restore plan");
        observation.reset();
        return yield* SyncWorkspace.previewOrApply(candidate, preapprovedPlanExecution);
      }),
    ),
  );

const skillWorkspace = (names: ReadonlyArray<string>) => {
  const workspace = makeSyncFixture({
    settings: {
      owner: "@acme",
      agents: ["claude-code"],
      skills: Object.fromEntries(names.map((name) => [name, `./vendor/${name}`])),
    },
  });
  for (const name of names) writeLocalSkillPackage(workspace.root, { name });
  return workspace;
};

const describeOutcome = (result: {
  readonly units: ReadonlyArray<{
    readonly id: string;
    readonly state: string;
    readonly disposition?: string;
    readonly error?: { readonly category: string; readonly detail: string };
  }>;
  readonly failure?: { readonly category: string; readonly detail: string };
}) => ({
  units: result.units.map((unit) => ({
    id: unit.id,
    state: unit.state,
    ...(unit.disposition === undefined ? {} : { disposition: unit.disposition }),
    ...(unit.error === undefined
      ? {}
      : { category: unit.error.category, detail: unit.error.detail }),
  })),
  ...(result.failure === undefined
    ? {}
    : { failure: { category: result.failure.category, detail: result.failure.detail } }),
});

/** Run `edit` once, when the first span named `name` starts or ends during apply. */
const onceAt = (
  observation: Observation,
  moment: "started" | "ended",
  name: string,
  edit: () => void,
) => {
  let done = false;
  observation.hooks[moment] = (span) => {
    if (done || span.name !== name || operationPhase(span) !== "apply") return;
    done = true;
    edit();
  };
};

/**
 * Forget preparation when the prepared candidate starts executing, for
 * helpers that prepare and apply in one call.
 */
const resetAtApply = (observation: Observation) => {
  let done = false;
  observation.hooks.started = (span) => {
    if (done || span.name !== "resolveExecutionCandidate") return;
    done = true;
    observation.reset();
  };
};

/** Workspace paths created by an apply, relative to the project root. */
const createdPaths = (workspace: SyncFixture, before: Readonly<Record<string, string>>) =>
  Object.keys(workspace.snapshot()).filter((path) => !(path in before));

const verified = (verification: "operation" | "closure") => ({
  verification,
  settings: 1,
  lockfile: 1,
});

describe("Post-write verification observation", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  // Per restored closure: the materialize operation's check and the closure's
  // native-output check each parse settings and the lockfile once. Validation
  // opens one fresh observation that the candidate check and the plan's own
  // freshness check share, so it reads settings and the lockfile once each
  // instead of once per check.
  for (const [names, expected] of [
    [
      ["review"],
      {
        settingsParses: 6,
        lockfileParses: 6,
        presenceSettingsParses: 1,
        presenceLockfileParses: 1,
        settingsContentReads: 9,
        lockfileContentReads: 13,
        observationPhases: 4,
        verificationPhases: [verified("operation"), verified("closure")],
      },
    ],
    [
      ["review", "triage"],
      {
        settingsParses: 12,
        lockfileParses: 12,
        presenceSettingsParses: 2,
        presenceLockfileParses: 2,
        settingsContentReads: 17,
        lockfileContentReads: 25,
        observationPhases: 6,
        verificationPhases: [
          verified("operation"),
          verified("closure"),
          verified("operation"),
          verified("closure"),
        ],
      },
    ],
  ] as const) {
    it.effect(
      `verifies each of ${names.length} restored path skill closures in one phase per check`,
      () => {
        const workspace = skillWorkspace(names);
        cleanups.push(workspace.cleanup);
        const observation = makeObservation();
        return Effect.gen(function* () {
          const result = yield* observeRestore(workspace, observation);
          expect(describeOutcome(result).units.map((unit) => unit.state)).toEqual(
            names.map(() => "committed"),
          );
          expect(observation.summary(workspace.root)).toEqual(expected);
        }).pipe(provideObserved(observation));
      },
    );
  }

  it.effect("verifies a restored Registry skill closure in one phase per check", () => {
    const registry = makeFileRegistry();
    cleanups.push(registry.cleanup);
    registry.writeSkill("review", [{ version: "1.0.0", body: "Initial review." }]);
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        sources: [registry.source],
        skills: { review: "test:@acme/skills/review@^1.0.0" },
      },
    });
    cleanups.push(workspace.cleanup);
    const observation = makeObservation();
    return Effect.gen(function* () {
      const result = yield* observeRestore(workspace, observation);
      expect(describeOutcome(result).units.map((unit) => unit.state)).toEqual(["committed"]);
      // Validation shares one fresh observation of settings and the lockfile.
      expect(observation.summary(workspace.root)).toEqual({
        settingsParses: 6,
        lockfileParses: 6,
        presenceSettingsParses: 1,
        presenceLockfileParses: 1,
        settingsContentReads: 9,
        lockfileContentReads: 13,
        observationPhases: 4,
        verificationPhases: [verified("operation"), verified("closure")],
      });
    }).pipe(provideObserved(observation));
  });

  it.effect("verifies existing outputs in one phase per check when an agent joins", () => {
    const workspace = skillWorkspace(["review"]);
    cleanups.push(workspace.cleanup);
    const observation = makeObservation();
    resetAtApply(observation);
    return Effect.gen(function* () {
      yield* workspace.provide(applySync());
      const result = yield* workspace.provide(
        observation.observed(addConfiguredAgent("cursor", preapprovedPlanExecution)),
      );
      expect(describeOutcome(result)).toEqual({
        units: [
          { id: "Add cursor", state: "committed" },
          { id: "skill:review", state: "committed" },
        ],
      });
      expect(observation.summary(workspace.root)).toEqual({
        settingsParses: 14,
        lockfileParses: 13,
        presenceSettingsParses: 1,
        presenceLockfileParses: 1,
        settingsContentReads: 22,
        lockfileContentReads: 16,
        observationPhases: 2,
        verificationPhases: [verified("operation"), verified("closure")],
      });
    }).pipe(provideObserved(observation));
  });

  it.effect("opens no verification phase for an MCP withdrawal that retains nothing", () => {
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        mcpServers: {
          demo: { connection: { transport: "stdio", command: "node", args: ["server.js"] } },
        },
      },
    });
    cleanups.push(workspace.cleanup);
    const observation = makeObservation();
    resetAtApply(observation);
    return Effect.gen(function* () {
      yield* workspace.provide(applySync());
      const result = yield* workspace.provide(observation.observed(withdrawMcpServer("demo")));
      expect(describeOutcome(result).units.map((unit) => unit.state)).toEqual(["committed"]);
      expect(observation.summary(workspace.root)).toEqual({
        settingsParses: 14,
        lockfileParses: 3,
        presenceSettingsParses: 4,
        presenceLockfileParses: 2,
        settingsContentReads: 24,
        lockfileContentReads: 7,
        observationPhases: 1,
        verificationPhases: [],
      });
    }).pipe(provideObserved(observation));
  });

  describe("verification outcomes", () => {
    it.effect("refuses a required native output replaced after the write", () => {
      const workspace = skillWorkspace(["review"]);
      cleanups.push(workspace.cleanup);
      const observation = makeObservation();
      const native = nodePath.join(workspace.root, ".claude", "skills", "review");
      onceAt(observation, "ended", "SkillManager.isInstalled", () => {
        const target = fs.realpathSync(native);
        fs.rmSync(native);
        fs.cpSync(target, native, { recursive: true });
        fs.appendFileSync(nodePath.join(native, "SKILL.md"), "Foreign edit.\n");
      });
      return Effect.gen(function* () {
        const before = workspace.snapshot();
        const result = yield* observeRestore(workspace, observation);
        const detail = `Required native output does not match desired content after reconciliation: ${native}`;
        expect(describeOutcome(result)).toEqual({
          units: [
            {
              id: "skill:review",
              state: "failed",
              disposition: "retained",
              category: "conflict",
              detail,
            },
          ],
          failure: { category: "conflict", detail: `${detail} (conflict)` },
        });
        expect(createdPaths(workspace, before)).toEqual([
          ".claude",
          ".claude/skills",
          ".claude/skills/review",
          ".claude/skills/review/SKILL.md",
        ]);
        expect(workspace.readFile(".claude/skills/review/SKILL.md")).toContain("Foreign edit.");
      }).pipe(provideObserved(observation));
    });

    it.effect("refuses a native skill link retargeted after the write", () => {
      const workspace = skillWorkspace(["review"]);
      cleanups.push(workspace.cleanup);
      const observation = makeObservation();
      const native = nodePath.join(workspace.root, ".claude", "skills", "review");
      onceAt(observation, "ended", "SkillManager.isInstalled", () => {
        const copy = nodePath.join(workspace.root, "elsewhere");
        fs.cpSync(fs.realpathSync(native), copy, { recursive: true });
        fs.rmSync(native);
        fs.symlinkSync(copy, native);
      });
      return Effect.gen(function* () {
        const before = workspace.snapshot();
        const result = yield* observeRestore(workspace, observation);
        const detail = `Required native output does not match desired content after reconciliation: ${native}`;
        expect(describeOutcome(result)).toEqual({
          units: [
            {
              id: "skill:review",
              state: "failed",
              disposition: "retained",
              category: "conflict",
              detail,
            },
          ],
          failure: { category: "conflict", detail: `${detail} (conflict)` },
        });
        expect(createdPaths(workspace, before)).toEqual([
          ".claude",
          ".claude/skills",
          ".claude/skills/review",
          "elsewhere",
          "elsewhere/SKILL.md",
        ]);
      }).pipe(provideObserved(observation));
    });

    it.effect("reports an unreadable required native file and restores the closure", () => {
      const workspace = makeSyncFixture({
        settings: { owner: "@acme", agents: ["claude-code"], hooks: { audit: "./vendor/audit" } },
      });
      cleanups.push(workspace.cleanup);
      writeLocalHookPackage(workspace.root, { name: "audit" });
      const observation = makeObservation();
      const nativeSettings = nodePath.join(workspace.root, ".claude", "settings.json");
      // Fail every read of the shared hook file from the closure's final
      // evidence read until restoration begins.
      let unreadable: boolean | undefined;
      let failedReads = 0;
      observation.hooks.started = (span) => {
        if (operationPhase(span) !== "apply") return;
        if (span.name === "Hook.readEvidence" && unreadable === undefined) unreadable = true;
        if (span.name === "axm.rollback.restore") unreadable = false;
      };
      observation.hooks.failRead = (path) => {
        const fails = unreadable === true && path === nativeSettings;
        if (fails) failedReads += 1;
        return fails;
      };
      return Effect.gen(function* () {
        const before = workspace.snapshot();
        const result = yield* workspace.provide(
          observation.observed(
            Effect.gen(function* () {
              const candidate = yield* SyncWorkspace.prepare(syncRequest());
              if (candidate._tag === "AlreadyReconciled")
                throw new Error("Expected a restore plan");
              observation.reset();
              return yield* SyncWorkspace.previewOrApply(
                candidate,
                applyPlanExecution({
                  approval: "preapproved",
                  acceptedPolicies: new Set(["accept-execution-changes"]),
                  recovery: { command: ["sync"], arguments: [] },
                }),
              );
            }),
          ),
        );
        const detail = "Cannot verify final native output postconditions";
        expect(describeOutcome(result)).toEqual({
          units: [
            {
              id: expect.stringContaining("managed hook projections"),
              state: "failed",
              disposition: "restored",
              category: "conflict",
              detail,
            },
          ],
          failure: { category: "conflict", detail: `${detail} (conflict)` },
        });
        expect(failedReads).toBe(1);
        expect(workspace.snapshot()).toEqual(before);
      }).pipe(provideObserved(observation));
    });

    it.effect(
      "rolls back only the closure whose canonical package vanished before its check",
      () => {
        const workspace = skillWorkspace(["review", "triage"]);
        cleanups.push(workspace.cleanup);
        const observation = makeObservation();
        onceAt(observation, "started", "SkillManager.isInstalled", () => {
          fs.rmSync(
            nodePath.join(
              workspace.root,
              "agent_extensions",
              "_local",
              "project",
              "vendor",
              "review",
            ),
            { recursive: true },
          );
        });
        return Effect.gen(function* () {
          const before = workspace.snapshot();
          const result = yield* observeRestore(workspace, observation);
          expect(describeOutcome(result)).toEqual({
            units: [
              {
                id: "skill:review",
                state: "failed",
                disposition: "retained",
                category: "internal",
                detail: "LifecyclePostconditionViolated",
              },
              { id: "skill:triage", state: "committed" },
            ],
            failure: { category: "internal", detail: "LifecyclePostconditionViolated (internal)" },
          });
          expect(createdPaths(workspace, before)).toEqual([
            ".agents",
            ".agents/skills",
            ".agents/skills/triage",
            ".claude",
            ".claude/skills",
            ".claude/skills/triage",
            "agent_extensions",
            "agent_extensions/_local",
            "agent_extensions/_local/project",
            "agent_extensions/_local/project/vendor",
            "agent_extensions/_local/project/vendor/triage",
            "agent_extensions/_local/project/vendor/triage/skill.json",
            "agent_extensions/_local/project/vendor/triage/src",
            "agent_extensions/_local/project/vendor/triage/src/SKILL.md",
          ]);
        }).pipe(provideObserved(observation));
      },
    );
  });
});
