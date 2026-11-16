import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { RegistryTransportTest } from "@agentxm/registry-client/testing";
import { decodeRelativePathSync } from "@agentxm/extension-model/unstable/path-types";
import {
  UNCONSTRAINED_DESIRED_NODE,
  AcceptedResolutionWriter,
  DesiredStateWriter,
  SettingsWriter,
  type KnowledgeLockEntry,
  type ProjectionUnitPath,
  type RecordedProjectionRow,
} from "@agentxm/workspace-kernel/workspace-state";
import {
  MockWorkspaceTransactionScope,
  WorkspaceReadTest,
  type WorkspaceReadTestFacts,
  extensionName,
  handle,
  treeIntegrityOfSync,
} from "@agentxm/workspace-kernel/workspace-state/testing";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { WorkspaceFileWriteLocksLive } from "@agentxm/workspace-kernel/settlement/live";
import { FootprintRecorderTest } from "@agentxm/workspace-kernel/planning/testing";
import {
  KnowledgeManager,
  type KnowledgeManagerService,
} from "@agentxm/workspace-kernel/materialization";
import { SourceHostProviders, SourceNotResolvable } from "@agentxm/workspace-kernel/sources";
import { WorkspaceCatalogLive } from "@agentxm/workspace-kernel/sources/live";
import {
  CodingAgentRepositoryLive,
  NativeWriteAuthorityLive,
} from "@agentxm/workspace-kernel/projection/live";
import { KnowledgeManagerLive } from "./manager.js";

/** A valid acquired `handbook` bundle at its canonical root, accepted as it is. */
const acquiredHandbook = (
  workspaceRoot: string,
): Omit<WorkspaceReadTestFacts, "baseDir" | "runtimeDir"> => {
  const canonical = nodePath.join(
    workspaceRoot,
    "agent_extensions",
    "_local",
    "project",
    "sources",
    "handbook",
  );
  mkdirSync(nodePath.join(canonical, "src"), { recursive: true });
  writeFileSync(
    nodePath.join(canonical, "knowledge.json"),
    JSON.stringify({
      owner: "@acme",
      type: "knowledge",
      name: "handbook",
      version: "1.0.0",
      format: { name: "okf", version: "0.2" },
      bundleRoot: "src",
    }),
  );
  writeFileSync(
    nodePath.join(canonical, "src", "index.md"),
    '---\nokf_version: "0.2"\n---\n# Knowledge\n',
  );
  writeFileSync(
    nodePath.join(canonical, "src", "concept.md"),
    "---\ntype: concept\n---\n# A useful concept\n",
  );
  const locked: KnowledgeLockEntry = {
    source: { type: "path", path: decodeRelativePathSync("sources/handbook") },
    identity: { owner: handle("@acme"), name: extensionName("handbook") },
    resolved: { tree: treeIntegrityOfSync(canonical) },
    treeIntegrity: treeIntegrityOfSync(canonical),
  };
  return {
    settings: {
      instructionFiles: {},
      knowledge: { handbook: { source: "./sources/handbook", enabled: true } },
    },
    lockfile: { lockfileVersion: 1, skills: {}, knowledge: { handbook: locked } },
    graph: {
      packMembership: [],
      nodes: [
        {
          type: "knowledge",
          name: "handbook",
          identity: { authority: "path", locator: "./sources/handbook" },
          source: "./sources/handbook",
          enabled: true,
          constraint: UNCONSTRAINED_DESIRED_NODE,
          origins: [{ type: "settings", source: "./sources/handbook", enabled: true }],
        },
      ],
      mcpSourceClosures: [],
      problems: [],
    },
  };
};

/**
 * Run `run` against the production manager over a recording filesystem in a
 * real temporary workspace whose `AGENTS.md` starts as `# Project\n`. Region
 * rows persist across the calls `run` makes; `reset` forgets recorded calls.
 */
const recordedManager = <A, E, R>(
  run: (
    manager: KnowledgeManagerService,
    reset: () => void,
    workspaceRoot: string,
  ) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const workspaceRoot = mkdtempSync(
      nodePath.join(realpathSync(tmpdir()), "axm-knowledge-projection-apply-"),
    );
    try {
      const instructionsPath = nodePath.join(workspaceRoot, "AGENTS.md");
      writeFileSync(instructionsPath, "# Project\n");
      const axmDir = nodePath.join(workspaceRoot, ".axm");
      const rows = new Map<ProjectionUnitPath, RecordedProjectionRow>();
      let recording: ReturnType<typeof makeRecordingFileSystem>["recording"] | undefined;
      const platform = Layer.provideMerge(
        Layer.effect(
          FileSystem.FileSystem,
          Effect.gen(function* () {
            const recorded = makeRecordingFileSystem(yield* FileSystem.FileSystem);
            recording = recorded.recording;
            return recorded.fileSystem;
          }),
        ),
        NativePlatformTest,
      );
      const layer = KnowledgeManagerLive.pipe(
        Layer.provideMerge(WorkspaceCatalogLive),
        Layer.provideMerge(CodingAgentRepositoryLive),
        Layer.provideMerge(NativeWriteAuthorityLive),
        Layer.provideMerge(
          Layer.mergeAll(
            WorkspaceReadTest({
              baseDir: workspaceRoot,
              runtimeDir: axmDir,
              ...acquiredHandbook(workspaceRoot),
            }),
            Layer.mock(SettingsWriter, { setEntry: () => Effect.void }),
            Layer.mock(DesiredStateWriter, {
              declare: () => Effect.void,
              undeclare: () => Effect.void,
            }),
            Layer.mock(AcceptedResolutionWriter, {
              setAccepted: () => Effect.void,
              removeAccepted: () => Effect.void,
              withBatch: (effect) => effect,
              projectionRows: (kind) =>
                Effect.sync(() => (kind === "knowledge" ? new Map(rows) : new Map())),
              stageProjections: (changes) =>
                Effect.sync(() => {
                  for (const change of changes) {
                    if (change.kind !== "knowledge") continue;
                    if (change.row === undefined) rows.delete(change.path);
                    else
                      rows.set(change.path, {
                        row: change.row,
                        stale: change.row.gen === undefined,
                      });
                  }
                }),
            }),
            FootprintRecorderTest,
          ),
        ),
        Layer.provideMerge(MockWorkspaceTransactionScope(axmDir)),
        Layer.provide(
          Layer.succeed(SourceHostProviders, {
            resolveNamedRegistry: () => Effect.die("not used"),
            find: () => Effect.succeed([]),
            fetch: () =>
              Effect.fail(new SourceNotResolvable({ category: "validation", detail: "not used" })),
            acquireForTransition: () =>
              Effect.fail(new SourceNotResolvable({ category: "validation", detail: "not used" })),
            cloneUrl: () => Option.none(),
            origin: () => "test",
          }),
        ),
        Layer.provideMerge(WorkspaceFileWriteLocksLive),
        Layer.provideMerge(
          Layer.provideMerge(RegistryTransportTest(FetchHttpClient.layer), platform),
        ),
      );
      const outcome = yield* Effect.gen(function* () {
        const manager = yield* KnowledgeManager;
        const reset = () => recording?.reset();
        reset();
        return yield* run(manager, reset, workspaceRoot);
      }).pipe(Effect.result, Effect.provide(layer));
      return {
        outcome,
        recording,
        instructionsPath,
        workspaceRoot,
        instructions: readFileSync(instructionsPath, "utf8"),
      };
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

const handbookTarget = { type: "knowledge" as const, name: "handbook" };

/**
 * Each re-render of the discovery region, with the instruction file's content
 * reads and entry probes it makes when it writes the region and when it finds
 * the region current. A catalog refresh also runs in its own transaction.
 */
const regionRerenders = [
  {
    name: "catalog refresh",
    rerender: (manager: KnowledgeManagerService) => manager.refreshCatalog(),
    writing: { reads: 10, readLinks: 36 },
    current: { reads: 2, readLinks: 14 },
  },
  {
    name: "deactivation",
    rerender: (manager: KnowledgeManagerService) =>
      manager.materializeDeactivate({ target: handbookTarget }),
    writing: { reads: 8, readLinks: 28 },
    current: { reads: 2, readLinks: 12 },
  },
] as const;

const instructionWork = (
  recording: ReturnType<typeof makeRecordingFileSystem>["recording"] | undefined,
  instructionsPath: string,
) => ({
  reads: recording?.contentReads(instructionsPath),
  readLinks: recording?.calls({ path: instructionsPath, method: "readLink" }).length,
});

describe("KnowledgeManager discovery region re-render", () => {
  for (const { name, rerender, writing, current } of regionRerenders) {
    it.effect(`observes the instruction file once before writing it in a ${name}`, () =>
      Effect.gen(function* () {
        const { outcome, recording, instructionsPath, instructions } = yield* recordedManager(
          (manager) => rerender(manager),
        );

        expect(outcome._tag).toBe("Success");
        expect(instructions).toContain("# Project\n");
        expect(instructions).toContain(
          "[handbook](agent_extensions/_local/project/sources/handbook/src/index.md)",
        );
        expect(recording?.writes(instructionsPath)).toBe(1);
        // The plan's eager dry run observes the file once and decides the
        // alias reconciliation; the write re-resolves its route and reads the
        // file again under its exclusive lock and after it.
        expect(instructionWork(recording, instructionsPath)).toEqual(writing);
      }),
    );

    it.effect(`confirms a current region under the write lock in a ${name}`, () =>
      Effect.gen(function* () {
        const { outcome, recording, instructionsPath } = yield* recordedManager((manager, reset) =>
          Effect.gen(function* () {
            yield* manager.refreshCatalog();
            reset();
            yield* rerender(manager);
          }),
        );

        expect(outcome._tag).toBe("Success");
        expect(recording?.writes(instructionsPath)).toBe(0);
        // The eager dry run finds the region current; the write's own read
        // under its exclusive lock confirms it.
        expect(instructionWork(recording, instructionsPath)).toEqual(current);
      }),
    );
  }

  it.effect("observes an instruction file edited after an earlier refresh afresh", () =>
    Effect.gen(function* () {
      const { outcome, recording, instructionsPath, instructions } = yield* recordedManager(
        (manager, reset, workspaceRoot) =>
          Effect.gen(function* () {
            yield* manager.refreshCatalog();
            reset();
            // A foreign edit after the first refresh: the next one observes it.
            yield* Effect.sync(() =>
              writeFileSync(nodePath.join(workspaceRoot, "AGENTS.md"), "# Edited\n"),
            );
            yield* manager.refreshCatalog();
          }),
      );

      expect(outcome._tag).toBe("Success");
      // The later refresh sees the edit, not the earlier refresh's region.
      expect(recording?.writes(instructionsPath)).toBe(1);
      expect(instructions).toContain("# Edited\n");
      expect(instructions).toContain("[handbook]");
      // Nothing from the earlier refresh stands in: the same work as a first one.
      expect(instructionWork(recording, instructionsPath)).toEqual({ reads: 10, readLinks: 36 });
    }),
  );
});
