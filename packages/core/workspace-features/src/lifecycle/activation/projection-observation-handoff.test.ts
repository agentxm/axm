/**
 * Activation and removal observe each shared projection plan once per owner
 * call: the manager's eager pre-write observation is handed to the consumer
 * that would otherwise observe the same plans again before any write, and the
 * after and before exposure passes share one native syntax observation view.
 *
 * Counts are exact for these fixtures. Each observation of the hook unit reads
 * `.claude/settings.json` once; each observation of an instruction region reads
 * `AGENTS.md` once. Every example names the count observed when each consumer
 * observed the plans again, and the count without those repeated observations.
 */
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, describe, expect, it } from "@effect/vitest";

import type { ExtensionType } from "@agentxm/extension-model/unstable/extensions";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { SETTINGS_ENTRY_KEYS } from "@agentxm/workspace-kernel/workspace-state";

import type { LifecycleFixture } from "../testing.js";
import { applyUninstall, previewUninstall, uninstallRequest } from "../uninstall/test-helpers.js";
import {
  applyActivation,
  previewActivation,
  workspaceWithAuthoredExtension,
} from "./test-helpers.js";

// The recording filesystem replaces the platform one; the rest of the platform services stay.
const recordedNodeServices = Layer.provideMerge(
  layerRecordingFileSystem(NodeFileSystem.layer),
  NodeServices.layer,
);

const SETTINGS = ".claude/settings.json";
const INSTRUCTIONS = "AGENTS.md";

/**
 * A workspace holding one authored extension with an instruction file and
 * claude-code configured. Knowledge discovery renders into the instruction
 * file only when instruction files are managed.
 */
const arrange = (
  type: ExtensionType,
  enabled: boolean,
  instructionFiles: boolean = type === "knowledge",
): LifecycleFixture => {
  const workspace = workspaceWithAuthoredExtension({ type, name: "review", enabled });
  workspace.writeFile(INSTRUCTIONS, "# Human instructions\n");
  if (instructionFiles)
    workspace.writeFile(
      "axm.json",
      JSON.stringify({
        owner: "@acme",
        agents: ["claude-code"],
        instructionFiles: { fileName: INSTRUCTIONS, gitignoreAliases: false },
        [SETTINGS_ENTRY_KEYS[type]]: { review: { source: "workspace", enabled } },
      }),
    );
  return workspace;
};

/** Run `setup`, forget its work, then count what `measured` reads and parses. */
const measure = <A, E, R>(
  workspace: LifecycleFixture,
  setup: Effect.Effect<unknown, unknown, R>,
  measured: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const recording = yield* FileSystemRecorder;
    yield* setup;
    recording.reset();
    const work = workObservations(false);
    const result = yield* measured.pipe(work.provide);
    return {
      result,
      settingsReads: recording.contentReads(nodePath.join(workspace.root, SETTINGS)),
      instructionReads: recording.contentReads(nodePath.join(workspace.root, INSTRUCTIONS)),
      nativeParses: work.facts.filter((fact) => fact.kind === "axm.parse.native").length,
    };
  }).pipe(workspace.provide, Effect.provide(recordedNodeServices));

const outcomeOf = (resolved: { readonly _tag: string; readonly outcome?: string }) =>
  resolved.outcome ?? resolved._tag;

describe("Activation hands each manager's eager projection observation to its consumer", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  /** A workspace whose enabled hook `review` is registered in `.claude/settings.json`. */
  const enabledHook = () => {
    const workspace = arrange("hook", false);
    cleanups.push(workspace.cleanup);
    return {
      workspace,
      setup: applyActivation({ type: "hook", name: "review", enabled: true }),
    };
  };

  it.effect(
    "previews a hook disable observing the withdrawal and each exposure pass once",
    () =>
      Effect.gen(function* () {
        const { workspace, setup } = enabledHook();
        const counted = yield* measure(
          workspace,
          setup,
          previewActivation({ type: "hook", name: "review", enabled: false }),
        );
        expect(outcomeOf(counted.result)).toBe("previewed");
        // Repeated: 7 reads and 20 parses. The withdrawal gate and both exposure
        // passes each drop one dry run; the before pass parses through the
        // after pass's syntax view.
        expect(counted).toMatchObject({ settingsReads: 4, nativeParses: 8 });
      }),
    { timeout: 30_000 },
  );

  it.effect(
    "applies a hook disable observing the withdrawal and each exposure pass once",
    () =>
      Effect.gen(function* () {
        const { workspace, setup } = enabledHook();
        const counted = yield* measure(
          workspace,
          setup,
          applyActivation({ type: "hook", name: "review", enabled: false }),
        );
        expect(outcomeOf(counted.result)).toBe("applied");
        expect(workspace.readFile(SETTINGS)).not.toContain("review");
        // Repeated: 13 reads and 28 parses. The aggregate render applies under
        // the lock and keeps its own reads.
        expect(counted).toMatchObject({ settingsReads: 10, nativeParses: 16 });
      }),
    { timeout: 30_000 },
  );

  it.effect(
    "previews a hook enable observing the configured outcomes and the exposure pass once",
    () =>
      Effect.gen(function* () {
        const { workspace, setup } = enabledHook();
        const counted = yield* measure(
          workspace,
          setup.pipe(
            Effect.andThen(applyActivation({ type: "hook", name: "review", enabled: false })),
          ),
          previewActivation({ type: "hook", name: "review", enabled: true }),
        );
        expect(outcomeOf(counted.result)).toBe("previewed");
        // Repeated: 5 reads and 12 parses.
        expect(counted).toMatchObject({ settingsReads: 3, nativeParses: 6 });
      }),
    { timeout: 30_000 },
  );

  it.effect(
    "previews a hook removal observing each projection once",
    () =>
      Effect.gen(function* () {
        const { workspace, setup } = enabledHook();
        const counted = yield* measure(
          workspace,
          setup,
          previewUninstall(uninstallRequest({ type: "hook", selector: "review" })),
        );
        // Repeated: 8 reads and 17 parses.
        expect(counted).toMatchObject({ settingsReads: 6, nativeParses: 9 });
      }),
    { timeout: 30_000 },
  );

  it.effect(
    "applies a hook removal observing each projection once before the locked writes",
    () =>
      Effect.gen(function* () {
        const { workspace, setup } = enabledHook();
        const counted = yield* measure(
          workspace,
          setup,
          applyUninstall(uninstallRequest({ type: "hook", selector: "review" })),
        );
        expect(workspace.readFile(SETTINGS)).not.toContain("review");
        // Repeated: 17 reads and 31 parses.
        expect(counted).toMatchObject({ settingsReads: 15, nativeParses: 23 });
      }),
    { timeout: 30_000 },
  );

  it.effect(
    "renders a handed hook observation without reconciling instruction aliases",
    () =>
      Effect.gen(function* () {
        // Instruction files are managed and the claude-code alias is absent.
        // The hook changes in both renders; only instruction regions may
        // decide alias reconciliation, so no alias appears.
        const workspace = arrange("hook", false, true);
        cleanups.push(workspace.cleanup);
        yield* Effect.gen(function* () {
          const enabled = yield* applyActivation({ type: "hook", name: "review", enabled: true });
          expect(outcomeOf(enabled)).toBe("applied");
          expect(workspace.readFile(SETTINGS)).toContain("review");
          expect(workspace.exists("CLAUDE.md")).toBe(false);
          const disabled = yield* applyActivation({
            type: "hook",
            name: "review",
            enabled: false,
          });
          expect(outcomeOf(disabled)).toBe("applied");
          expect(workspace.readFile(SETTINGS)).not.toContain("review");
        }).pipe(workspace.provide, Effect.provide(recordedNodeServices));
        expect(workspace.exists("CLAUDE.md")).toBe(false);
        expect(workspace.readFile(INSTRUCTIONS)).toBe("# Human instructions\n");
      }),
    { timeout: 30_000 },
  );

  it.effect(
    "previews a rule disable observing the instructions region once per pass",
    () =>
      Effect.gen(function* () {
        const workspace = arrange("rule", false);
        cleanups.push(workspace.cleanup);
        const counted = yield* measure(
          workspace,
          applyActivation({ type: "rule", name: "review", enabled: true }),
          previewActivation({ type: "rule", name: "review", enabled: false }),
        );
        expect(outcomeOf(counted.result)).toBe("previewed");
        // Repeated: 5 reads; each exposure pass drops one.
        expect(counted).toMatchObject({ instructionReads: 3 });
      }),
    { timeout: 30_000 },
  );

  it.effect(
    "applies a rule disable handing the region observation to the aggregate render",
    () =>
      Effect.gen(function* () {
        const workspace = arrange("rule", false);
        cleanups.push(workspace.cleanup);
        const counted = yield* measure(
          workspace,
          applyActivation({ type: "rule", name: "review", enabled: true }),
          applyActivation({ type: "rule", name: "review", enabled: false }),
        );
        expect(outcomeOf(counted.result)).toBe("applied");
        expect(workspace.readFile(INSTRUCTIONS)).toBe("# Human instructions\n");
        // Repeated: 15 reads; the exposure passes drop two and the aggregate
        // render consumes the rule manager's observation instead of a third.
        expect(counted).toMatchObject({ instructionReads: 12 });
      }),
    { timeout: 30_000 },
  );

  // Instruction files are managed here, so `AGENTS.md` is both the discovery
  // region and the source of the instruction-file aliases. Each
  // instruction-file observation reads it once and shares those bytes between
  // its decisions and its witness digest; the witness re-check before a write
  // still reads it fresh.
  const knowledgeRows = [
    { mode: "preview", enabled: true, repeated: 11, observed: 7 },
    { mode: "preview", enabled: false, repeated: 7, observed: 5 },
    { mode: "apply", enabled: true, repeated: 28, observed: 23 },
    { mode: "apply", enabled: false, repeated: 20, observed: 17 },
  ] as const;
  for (const { mode, enabled, repeated, observed } of knowledgeRows) {
    it.effect(
      `${mode === "preview" ? "previews" : "applies"} a knowledge ${enabled ? "enable" : "disable"} observing the discovery region once per consumer`,
      () =>
        Effect.gen(function* () {
          const workspace = arrange("knowledge", false);
          cleanups.push(workspace.cleanup);
          const counted = yield* measure(
            workspace,
            enabled
              ? Effect.void
              : applyActivation({ type: "knowledge", name: "review", enabled: true }),
            (mode === "preview" ? previewActivation : applyActivation)({
              type: "knowledge",
              name: "review",
              enabled,
            }),
          );
          expect(outcomeOf(counted.result)).toBe(mode === "preview" ? "previewed" : "applied");
          expect(counted.instructionReads, `repeated observations read ${repeated} times`).toBe(
            observed,
          );
        }),
      { timeout: 30_000 },
    );
  }
});
