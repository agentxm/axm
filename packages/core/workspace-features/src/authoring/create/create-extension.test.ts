import * as fs from "node:fs";
import * as nodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";
import { FileSystemRecorder, type RecordedFileSystemCall } from "@agentxm/test-support";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { groupInstallTargetsByDirectory } from "@agentxm/workspace-kernel/materialization";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { CodingAgentRepository } from "@agentxm/workspace-kernel/projection";
import { WorkspaceLocation } from "@agentxm/workspace-kernel/workspace-state";

import { authoringTypes } from "../test-support/authoring-packages.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
} from "../test-support/authoring-workspace.js";
import { createRequestFor } from "../test-support/create-requests.js";
import { recordingAuthoringWorkspaceLayer } from "../test-support/recording-authoring-workspace.js";
import { CreateExtension, type CreatableExtensionType } from "./create-extension.js";

describe("CreateExtension name validation", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const invalidNames = ["review-", "-review", "Review", "re view", "a".repeat(65)];

  for (const row of authoringTypes)
    for (const name of invalidNames)
      it.effect(`refuses ${row.type} name ${JSON.stringify(name)} as a typed failure`, () =>
        Effect.gen(function* () {
          const created = makeAuthoringWorkspace({ owner: "@acme", agents: [] });
          cleanups.push(created.cleanup);
          const before = created.snapshot();

          const failure = yield* CreateExtension.prepare(createRequestFor(row.type, name)).pipe(
            Effect.provide(authoringWorkspaceLayer(created)),
            Effect.flip,
          );

          expect(failure).toMatchObject({ _tag: "ScaffoldNameInvalid", name, maxLength: 64 });
          expect(created.snapshot()).toEqual(before);
        }),
      );
});

describe("CreateExtension prepared work", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const workspaceFor = () => {
    const created = makeAuthoringWorkspace({ owner: "@acme", agents: ["claude-code"] });
    cleanups.push(created.cleanup);
    created.writeSettings({ owner: "@acme", agents: ["claude-code"], instructionFiles: {} });
    return created;
  };

  /** The recorded calls and `axm.hash.package` executions of one measured effect. */
  const measure = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const recording = yield* FileSystemRecorder;
      recording.reset();
      const work = workObservations(false);
      const value = yield* work.provide(effect);
      return {
        value,
        calls: recording.calls(),
        hashes: work.facts.filter((fact) => fact.kind === "axm.hash.package").length,
      };
    });

  /** Prepare and apply one creation, measuring each phase on its own. */
  const prepareAndApply = (type: CreatableExtensionType) =>
    Effect.gen(function* () {
      const prepare = yield* measure(CreateExtension.prepare(createRequestFor(type, "review")));
      const apply = yield* measure(CreateExtension.previewOrApply(prepare.value, applyExecution));
      expect(deriveOperationOutcome(apply.value)).toBe("applied");
      return { prepare, apply };
    });

  /** Per-staging-root counts for the preview stagings a phase created. */
  const stagingCounts = (
    calls: ReadonlyArray<RecordedFileSystemCall>,
    files: ReadonlyArray<string>,
  ) => {
    const roots = calls
      .filter(
        (call) =>
          call.method === "makeTempDirectoryScoped" &&
          call.outcome === "success" &&
          nodePath.basename(call.path).startsWith("axm-create-preview-"),
      )
      .map((call) => call.path);
    return {
      stagings: roots.length,
      rootReadDirectory: roots.map(
        (root) =>
          calls.filter((call) => call.method === "readDirectory" && call.path === root).length,
      ),
      readFile: files.map((file) =>
        roots.reduce(
          (sum, root) =>
            sum +
            calls.filter(
              (call) => call.method === "readFile" && call.path === nodePath.join(root, file),
            ).length,
          0,
        ),
      ),
      writes: roots.reduce(
        (sum, root) =>
          sum +
          calls.filter(
            (call) =>
              (call.method === "writeFile" ||
                call.method === "file.write" ||
                call.method === "file.writeAll") &&
              call.path.startsWith(`${root}/`),
          ).length,
        0,
      ),
    };
  };

  // Measured before the preflight took the scaffold hash it already holds:
  // per phase, one preview staging whose root the package hash walked once,
  // and that hash's read of every staged file.
  const before = {
    rule: { files: ["rule.json", "src/RULE.md"], prepareHashes: 1, applyHashes: 3, reads: [3, 2] },
    knowledge: {
      files: ["knowledge.json", "src/index.md"],
      prepareHashes: 1,
      applyHashes: 2,
      reads: [3, 2],
    },
    subagent: {
      files: ["subagent.json", "src/review.md"],
      prepareHashes: 1,
      applyHashes: 3,
      reads: [4, 3],
    },
  } as const;

  // Each preflight run's Rule or Knowledge manager prepares from the manifest
  // that run decoded, and the Subagent manager's observation reuses its own
  // destination validation's package load, so one read of each named staged
  // file goes per phase.
  const sharedRunReads = { rule: [1, 0], knowledge: [1, 0], subagent: [1, 1] } as const;
  // Under the lock the Rule and Subagent install records the hash the
  // transaction's own listing computed for the authored package.
  const sharedListingHash = { rule: 1, knowledge: 0, subagent: 1 } as const;

  for (const type of ["rule", "knowledge", "subagent"] as const)
    it.effect(`stages the ${type} preview without hashing what it just wrote`, () => {
      const created = workspaceFor();
      return Effect.gen(function* () {
        const { prepare, apply } = yield* prepareAndApply(type);
        const measured = before[type];
        const shared = sharedRunReads[type];
        const expected = {
          stagings: 1,
          rootReadDirectory: [0],
          readFile: measured.reads.map((count, index) => count - 1 - (shared[index] ?? 0)),
        };
        expect(prepare.hashes).toBe(measured.prepareHashes - 1);
        expect(stagingCounts(prepare.calls, measured.files)).toMatchObject(expected);
        expect(apply.hashes).toBe(measured.applyHashes - 1 - sharedListingHash[type]);
        expect(stagingCounts(apply.calls, measured.files)).toMatchObject(expected);
      }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(created)));
    });

  it.effect("still stages a hook preview in both phases", () => {
    // A hook preflight has no native demand, but staging still proves the
    // temporary directory can hold the scaffold before anything is published.
    const created = workspaceFor();
    return Effect.gen(function* () {
      const { prepare, apply } = yield* prepareAndApply("hook");
      expect(prepare.hashes).toBe(0);
      expect(apply.hashes).toBe(1);
      for (const phase of [prepare, apply])
        expect(stagingCounts(phase.calls, [])).toMatchObject({
          stagings: 1,
          rootReadDirectory: [0],
          writes: 6,
        });
    }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(created)));
  });

  it.effect("resolves skill destinations once while preparing and again under the lock", () => {
    const created = workspaceFor();
    const skillDirectories = [".claude/skills", ".agents/skills"].map((relative) =>
      nodePath.join(created.root, relative),
    );
    const resolutionCalls = (calls: ReadonlyArray<RecordedFileSystemCall>) =>
      calls.filter(
        (call) =>
          (call.method === "realPath" || call.method === "readLink") &&
          skillDirectories.includes(call.path),
      ).length;
    return Effect.gen(function* () {
      // One standalone resolution of every skill destination, as creation resolves it.
      const standalone = yield* measure(
        Effect.gen(function* () {
          const location = yield* WorkspaceLocation;
          const agents = yield* (yield* CodingAgentRepository).getMaterializationAgents();
          const installable = [];
          for (const agent of agents) {
            const outcome = yield* agent.resolveEffectiveSkillsDir({
              workspaceRoot: location.baseDir,
              scope: location.scope,
            });
            if (outcome._tag === "supported")
              installable.push({ agentId: agent.id, targetDir: nodePath.normalize(outcome.dir) });
          }
          return yield* groupInstallTargetsByDirectory(installable, location.baseDir);
        }),
      );
      const { prepare, apply } = yield* prepareAndApply("skill");
      // Measured before preparation reused its first resolution: 16 calls while
      // preparing (two resolutions plus the per-target checks). Applying makes
      // 98: the authored-step preflight resolves both destinations once in its
      // shared document phase (4 calls), and from the transaction's first
      // snapshot on, under the lock, the destinations resolve fresh (94).
      const resolution = resolutionCalls(standalone.calls);
      expect(resolution).toBe(4);
      expect(resolutionCalls(prepare.calls)).toBe(16 - resolution);
      expect(resolutionCalls(apply.calls)).toBe(98);
    }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(created)));
  });

  it.effect("resolves each skill destination entry and the root once while preparing", () => {
    const created = workspaceFor();
    const targets = [".claude/skills/review", ".agents/skills/review"].map((relative) =>
      nodePath.join(created.root, relative),
    );
    const counted = (calls: ReadonlyArray<RecordedFileSystemCall>, target: string) => ({
      readLink: calls.filter((call) => call.method === "readLink" && call.path === target).length,
      stat: calls.filter((call) => call.method === "stat" && call.path === target).length,
      realPath: calls.filter((call) => call.method === "realPath" && call.path === target).length,
    });
    return Effect.gen(function* () {
      const { prepare, apply } = yield* prepareAndApply("skill");
      // While preparing, each destination's entry is resolved by its check and
      // classified from that resolution, and the workspace root is resolved
      // once as the native root for both checks.
      expect({
        targets: targets.map((target) => counted(prepare.calls, target)),
        root: counted(prepare.calls, created.root),
      }).toEqual({
        targets: [
          { readLink: 3, stat: 2, realPath: 0 },
          { readLink: 3, stat: 2, realPath: 0 },
        ],
        root: { readLink: 1, stat: 1, realPath: 6 },
      });
      // Under the lock every destination check and classification resolves afresh.
      expect({
        targets: targets.map((target) => counted(apply.calls, target)),
        root: counted(apply.calls, created.root),
      }).toEqual({
        targets: [
          { readLink: 28, stat: 16, realPath: 4 },
          { readLink: 28, stat: 16, realPath: 4 },
        ],
        root: { readLink: 75, stat: 240, realPath: 246 },
      });
      const step = prepare.value.execution.plan.jobs[0]?.steps[0];
      const planned = step?.artifact?.nativeLocations ?? [];
      expect(
        planned.map(({ address, ownership, state, policyReasons }) => ({
          address,
          ownership,
          state,
          policyReasons,
        })),
      ).toEqual([
        {
          address: { kind: "entry", path: targets[1] },
          ownership: "absent",
          state: "created",
          policyReasons: ["workspace-shared-skills"],
        },
        {
          address: { kind: "entry", path: targets[0] },
          ownership: "absent",
          state: "created",
          policyReasons: [],
        },
      ]);
      expect(planned[1]?.configuredConsumers).toEqual(["claude-code"]);
    }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(created)));
  });

  it.effect("refuses a skill whose agent directory is retargeted after preparation", () => {
    const created = workspaceFor();
    fs.mkdirSync(nodePath.join(created.root, ".skills-a"), { recursive: true });
    created.write(".skills-b/review/SKILL.md", "Foreign skill.\n");
    fs.mkdirSync(nodePath.join(created.root, ".claude"), { recursive: true });
    const link = nodePath.join(created.root, ".claude/skills");
    fs.symlinkSync("../.skills-a", link);
    return Effect.gen(function* () {
      const candidate = yield* CreateExtension.prepare(createRequestFor("skill", "review"));
      fs.rmSync(link);
      fs.symlinkSync("../.skills-b", link);
      const before = created.snapshot();
      const resolution = yield* CreateExtension.previewOrApply(candidate, applyExecution);
      expect(deriveOperationOutcome(resolution)).toBe("blocked");
      expect(resolution.blocking).toMatchObject({
        class: "stale-candidate",
        detail: "The execution candidate became stale before apply.",
      });
      expect(created.snapshot()).toEqual(before);
      expect(fs.readlinkSync(link)).toBe("../.skills-b");
    }).pipe(Effect.provide(recordingAuthoringWorkspaceLayer(created)));
  });
});
