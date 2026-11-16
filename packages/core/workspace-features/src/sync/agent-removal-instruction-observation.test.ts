/**
 * Knowledge projection work while planning the instruction step of an agent removal.
 *
 * When the remaining membership needs a new instruction copy, the copy exposes
 * the whole instruction source, including the Knowledge discovery region, so
 * the step reads the Knowledge plans to name their contributors. Producing
 * those plans already observes them once; the step uses that observation
 * rather than observing the same plans a second time. These counts run the
 * production planning over a real temporary workspace, beneath the production
 * file system.
 */
import * as fs from "node:fs";
import * as nodePath from "node:path";

import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import {
  collectInstructionStep,
  StepFailureConversion,
} from "@agentxm/workspace-kernel/reconciliation";
import { applySync, makeSyncFixture } from "../testing/sync-fixture.js";
import { writeLocalKnowledgePackage } from "../testing/local-packages.js";

/** Two configured agents and one Knowledge bundle published into `AGENTS.md`. */
const knowledgeWorkspace = () => {
  const workspace = makeSyncFixture({
    settings: {
      owner: "@acme",
      agents: ["claude-code", "codex"],
      instructionFiles: {},
      knowledge: { "alpha-notes": "./vendor/alpha-notes" },
    },
    files: { "AGENTS.md": "# Root\n" },
  });
  writeLocalKnowledgePackage(workspace.root, { name: "alpha-notes" });
  return workspace;
};

/** The recording file system replaces the platform one beneath every fixture layer. */
const provideRecording = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.provide(Layer.merge(NodeServices.layer, layerRecordingFileSystem(NodeServices.layer))),
  );

/** The canonical copy the Knowledge projection reads its bundle from. */
const canonicalBundle = (snapshot: Readonly<Record<string, unknown>>): string => {
  const relative = Object.keys(snapshot).find(
    (file) =>
      file.startsWith("agent_extensions") &&
      file.endsWith(nodePath.join("alpha-notes", "src", "index.md")),
  );
  if (relative === undefined) throw new Error("No canonical copy of alpha-notes");
  return nodePath.dirname(nodePath.dirname(relative));
};

describe("Agent removal instruction planning", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /**
   * Plan the instruction step for the membership left after `codex` leaves,
   * as agent removal does, counting only the planning work.
   */
  const countPlanning = (
    workspace: ReturnType<typeof knowledgeWorkspace>,
    bundle: string,
    knowledgeFacts?: Parameters<typeof collectInstructionStep>[0]["knowledgeFacts"],
  ) =>
    Effect.gen(function* () {
      const recording = yield* FileSystemRecorder;
      recording.reset();
      const step = yield* workspace.provide(
        Effect.gen(function* () {
          return yield* collectInstructionStep({
            configuredAgents: ["claude-code"],
            projectionFacts: [],
            touchesRule: false,
            adapter: yield* StepFailureConversion,
            ...(knowledgeFacts === undefined ? {} : { knowledgeFacts }),
          });
        }),
      );
      return {
        step: Option.map(step, (planned) => ({
          readiness: planned.readiness,
          label: planned.label,
          exposureRefs: (planned.exposureRefs ?? []).map((ref) => `${ref.type} ${ref.name}`),
          errorMessage: planned.readiness === "error" ? planned.errorMessage : undefined,
        })),
        sourceReads: recording.contentReads(nodePath.join(workspace.root, "AGENTS.md")),
        lockfileReads: recording.contentReads(nodePath.join(workspace.root, "axm.lock")),
        bundleStats: recording.counts(nodePath.join(workspace.root, bundle)).stat ?? 0,
      };
    });

  it.effect("observes the Knowledge plans once for a new instruction copy", () => {
    const workspace = knowledgeWorkspace();
    cleanups.push(workspace.cleanup);
    return Effect.gen(function* () {
      yield* workspace.provide(applySync());
      const bundle = canonicalBundle(workspace.snapshot());
      // The remaining agent's copy is missing, so planning creates it.
      workspace.remove("CLAUDE.md");
      const counted = yield* countPlanning(workspace, bundle);
      expect(counted).toEqual({
        step: Option.some({
          readiness: "ready",
          label: "instruction files",
          // The new copy exposes the Knowledge region, so its bundle is named.
          exposureRefs: ["knowledge alpha-notes"],
          errorMessage: undefined,
        }),
        // One Knowledge observation beyond the instruction step's own work
        // (shown by the supplied-facts case below); a second observation of
        // the same plans would add a source read, a lockfile read and a
        // bundle stat.
        sourceReads: 2,
        lockfileReads: 8,
        bundleStats: 1,
      });
    }).pipe(provideRecording);
  });

  it.effect("does no Knowledge work when the caller supplies the Knowledge facts", () => {
    const workspace = knowledgeWorkspace();
    cleanups.push(workspace.cleanup);
    return Effect.gen(function* () {
      yield* workspace.provide(applySync());
      const bundle = canonicalBundle(workspace.snapshot());
      workspace.remove("CLAUDE.md");
      const counted = yield* countPlanning(workspace, bundle, []);
      expect(counted).toEqual({
        step: Option.some({
          readiness: "ready",
          label: "instruction files",
          exposureRefs: ["knowledge alpha-notes"],
          errorMessage: undefined,
        }),
        sourceReads: 1,
        lockfileReads: 4,
        bundleStats: 0,
      });
    }).pipe(provideRecording);
  });

  it.effect("does no Knowledge work when the remaining copies are current", () => {
    const workspace = knowledgeWorkspace();
    cleanups.push(workspace.cleanup);
    return Effect.gen(function* () {
      yield* workspace.provide(applySync());
      const bundle = canonicalBundle(workspace.snapshot());
      const counted = yield* countPlanning(workspace, bundle);
      expect(counted).toEqual({
        step: Option.none(),
        sourceReads: 1,
        lockfileReads: 2,
        bundleStats: 0,
      });
    }).pipe(provideRecording);
  });

  it.effect("reports a Knowledge observation failure as the instruction step's error", () => {
    const workspace = knowledgeWorkspace();
    cleanups.push(workspace.cleanup);
    return Effect.gen(function* () {
      yield* workspace.provide(applySync());
      const bundle = canonicalBundle(workspace.snapshot());
      workspace.remove("CLAUDE.md");
      // The instruction source now lives in another directory behind an alias,
      // so the Knowledge region's relative links cannot be shared through it.
      fs.mkdirSync(nodePath.join(workspace.root, "docs"));
      fs.renameSync(
        nodePath.join(workspace.root, "AGENTS.md"),
        nodePath.join(workspace.root, "docs", "AGENTS.md"),
      );
      fs.symlinkSync(
        nodePath.join("docs", "AGENTS.md"),
        nodePath.join(workspace.root, "AGENTS.md"),
      );
      const counted = yield* countPlanning(workspace, bundle);
      expect(counted.step).toEqual(
        Option.some({
          readiness: "error",
          label: "instruction files",
          exposureRefs: [],
          errorMessage:
            "Knowledge relative links cannot be shared through an instruction source alias with a different parent; native link-resolution semantics are unverified.",
        }),
      );
    }).pipe(provideRecording);
  });
});
