/**
 * What a publish preparation observes of Git while it assesses each
 * package's source state.
 *
 * The archive's ignore discovery already walked from each package to its Git
 * root, and the HEAD revision and object format of one repository do not
 * vary between the packages it holds; the assessment takes both from the
 * same preparation rather than observing them again. Each package's HEAD
 * subtree and working payload are still compared on their own, and the
 * apply's revalidation observes everything afresh.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import * as os from "node:os";

import { makeRecordingFileSystem, type FileSystemRecording } from "@agentxm/test-support";
import { applyPlanExecution } from "@agentxm/workspace-kernel/operations";
import {
  GitDirectoryComparison,
  type GitDirectoryComparisonService,
} from "@agentxm/workspace-kernel/sources";
import { GitDirectoryComparisonLive } from "@agentxm/workspace-kernel/sources/live";
import { isolatedGitEnv } from "@agentxm/workspace-kernel/sources/testing";
import { WorkspaceReadViews } from "@agentxm/workspace-kernel/workspace-state";
import { afterEach, describe, expect, it, vi } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import {
  makePublishWorld,
  publishDocument,
  requestFor,
  type PublishWorld,
} from "../test-helpers.js";
import { prepare, previewOrApply } from "./use-case.js";

const git = (cwd: string, ...args: ReadonlyArray<string>) =>
  execFileSync("git", args, { cwd, env: isolatedGitEnv(process.env), stdio: "pipe" });

const commitAll = (cwd: string) => {
  git(cwd, "add", ".");
  git(cwd, "-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-qm", "init");
};

/** A world whose project root is a Git repository holding two authored skills. */
const twoSkillWorld = (
  compare: GitDirectoryComparisonService["compare"],
  options: { readonly include?: ReadonlyArray<string> } = {},
) => {
  const world = makePublishWorld({
    settings: { skills: { a: "workspace", b: "workspace" } },
    compare,
  });
  const a = world.write("skill", {
    name: "a",
    ...(options.include === undefined ? {} : { publishInclude: options.include }),
  });
  const b = world.write("skill", { name: "b" });
  git(world.root, "init", "-q");
  return { world, a, b };
};

/**
 * Every Git process the run starts, by its arguments, through a `git` on
 * PATH that logs and then runs the real one.
 */
const gitProcessLog = (directory: string) => {
  const bin = nodePath.join(directory, "bin");
  const log = nodePath.join(directory, "git.log");
  const real = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(
    nodePath.join(bin, "git"),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\nexec '${real}' "$@"\n`,
    { mode: 0o700 },
  );
  vi.stubEnv("PATH", `${bin}${nodePath.delimiter}${process.env["PATH"] ?? ""}`);
  return {
    reset: () => fs.rmSync(log, { force: true }),
    count: (prefix: string) =>
      fs.existsSync(log)
        ? fs
            .readFileSync(log, "utf8")
            .split("\n")
            .filter((line) => line.startsWith(prefix)).length
        : 0,
  };
};

/** Probes of each ancestor's `.git` entry between a package and the project root. */
const rootProbes = (recording: FileSystemRecording, root: string, packageDir: string) => {
  const probes: Record<string, number> = {};
  for (
    let directory = packageDir;
    directory.startsWith(root);
    directory = nodePath.dirname(directory)
  ) {
    probes[nodePath.relative(root, directory) || "."] =
      recording.counts(nodePath.join(directory, ".git")).access ?? 0;
  }
  return probes;
};

const scratches: Array<string> = [];
/** A directory outside every world's repository, removed after each example. */
const scratch = () => {
  const directory = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-git-log-")));
  scratches.push(directory);
  return directory;
};

const apply = applyPlanExecution({
  approval: "preapproved",
  acceptedPolicies: new Set(["accept-warnings"]),
  recovery: { command: [], arguments: [] },
});

/** One run's recorded ports: the ambient filesystem, the live-observation one, and the Git comparison's. */
interface RecordedRun {
  readonly recording: FileSystemRecording;
  readonly recorded: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
}

/**
 * Run `body` in the world with every filesystem port a publish uses recorded,
 * the live Git comparison built over the same recording.
 */
const withRecordedRun = <A, E, R>(
  world: PublishWorld,
  setCompare: (compare: GitDirectoryComparisonService["compare"]) => void,
  body: (run: RecordedRun) => Effect.Effect<A, E, R>,
) =>
  world.provide(
    Effect.gen(function* () {
      const views = yield* WorkspaceReadViews;
      const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
      const live = yield* GitDirectoryComparison.pipe(
        Effect.provide(GitDirectoryComparisonLive),
        Effect.provideService(FileSystem.FileSystem, fileSystem),
      );
      setCompare(live.compare);
      const recorded = <A1, E1, R1>(effect: Effect.Effect<A1, E1, R1>) =>
        effect.pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(WorkspaceReadViews, {
            ...views,
            liveObservations: Context.add(
              views.liveObservations,
              FileSystem.FileSystem,
              fileSystem,
            ),
          }),
        );
      return yield* body({ recording, recorded });
    }),
  );

describe("Publish source assessment sharing", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const world of worlds.splice(0)) world.cleanup();
    for (const directory of scratches.splice(0))
      fs.rmSync(directory, { recursive: true, force: true });
  });

  const delegating = () => {
    let current: GitDirectoryComparisonService["compare"] | undefined;
    const compare: GitDirectoryComparisonService["compare"] = (input) =>
      current === undefined ? Effect.die("No live comparison yet") : current(input);
    return { compare, set: (next: typeof compare) => void (current = next) };
  };

  /** Git work of one phase: `.git` probes per directory and Git processes by kind. */
  const gitWork = (
    recording: FileSystemRecording,
    processes: ReturnType<typeof gitProcessLog>,
    world: PublishWorld,
    packages: ReadonlyArray<string>,
  ) => ({
    probes: Object.assign({}, ...packages.map((dir) => rootProbes(recording, world.root, dir))),
    processes: {
      head: processes.count("rev-parse --verify HEAD"),
      unbornHead: processes.count("symbolic-ref") + processes.count("for-each-ref"),
      objectFormat: processes.count("rev-parse --show-object-format"),
      subtrees: processes.count("ls-tree"),
    },
  });

  /** Prepare a publish of both skills (and, when asked, apply it) and count each phase's Git work. */
  const observeRun = (
    world: PublishWorld,
    comparison: ReturnType<typeof delegating>,
    packages: ReadonlyArray<string>,
    options: { readonly apply?: boolean } = {},
  ) => {
    const processes = gitProcessLog(scratch());
    return withRecordedRun(world, comparison.set, ({ recording, recorded }) =>
      Effect.gen(function* () {
        recording.reset();
        processes.reset();
        const prepared = yield* recorded(
          prepare(requestFor(world, { preview: options.apply !== true })),
        );
        const preparation = gitWork(recording, processes, world, packages);
        if (prepared._tag !== "Ready") return yield* Effect.die("Expected a ready preparation");
        const states = prepared.candidate.uploadCandidates.map(
          (candidate) => candidate.sourceAssessment?.state?.status ?? "outside-git",
        );
        if (options.apply !== true) return { preparation, states };
        recording.reset();
        processes.reset();
        const outcome = yield* recorded(previewOrApply(prepared.candidate, apply));
        expect(publishDocument(outcome).counts).toMatchObject({ published: 2 });
        return { preparation, states, application: gitWork(recording, processes, world, packages) };
      }),
    );
  };

  it.effect("walks to the Git root once per package and reads HEAD once per repository", () =>
    Effect.gen(function* () {
      const comparison = delegating();
      const { world, a, b } = twoSkillWorld(comparison.compare);
      worlds.push(world);
      commitAll(world.root);

      const run = yield* observeRun(world, comparison, [a, b]);

      expect(run).toEqual({
        preparation: {
          // One walk per package: its directory, then the ancestors it shares.
          probes: { "skills/a": 1, "skills/b": 1, skills: 2, ".": 2 },
          processes: { head: 1, unbornHead: 0, objectFormat: 1, subtrees: 2 },
        },
        states: ["matches-head", "matches-head"],
      });
    }),
  );

  it.effect("reads an unborn HEAD once for the packages of one repository", () =>
    Effect.gen(function* () {
      const comparison = delegating();
      const { world, a, b } = twoSkillWorld(comparison.compare);
      worlds.push(world);

      const run = yield* observeRun(world, comparison, [a, b]);

      expect(run).toEqual({
        preparation: {
          probes: { "skills/a": 1, "skills/b": 1, skills: 2, ".": 2 },
          processes: { head: 1, unbornHead: 2, objectFormat: 0, subtrees: 0 },
        },
        states: ["no-head", "no-head"],
      });
    }),
  );

  it.effect("walks again for a package whose explicit include skips ignore discovery", () =>
    Effect.gen(function* () {
      const comparison = delegating();
      const { world, a, b } = twoSkillWorld(comparison.compare, { include: ["**"] });
      worlds.push(world);
      commitAll(world.root);

      const run = yield* observeRun(world, comparison, [a, b]);

      expect(run).toEqual({
        preparation: {
          probes: { "skills/a": 1, "skills/b": 1, skills: 2, ".": 2 },
          processes: { head: 1, unbornHead: 0, objectFormat: 1, subtrees: 2 },
        },
        states: ["matches-head", "matches-head"],
      });
    }),
  );

  it.effect("reads HEAD once for each of two repositories", () =>
    Effect.gen(function* () {
      const comparison = delegating();
      const { world, a, b } = twoSkillWorld(comparison.compare);
      worlds.push(world);
      git(b, "init", "-q");
      commitAll(b);
      commitAll(world.root);

      const run = yield* observeRun(world, comparison, [a, b]);

      expect(run).toEqual({
        preparation: {
          probes: { "skills/a": 1, "skills/b": 1, skills: 1, ".": 1 },
          processes: { head: 2, unbornHead: 0, objectFormat: 2, subtrees: 2 },
        },
        states: ["matches-head", "matches-head"],
      });
    }),
  );

  it.effect("revalidates each package's Git source state afresh before uploading", () =>
    Effect.gen(function* () {
      const comparison = delegating();
      const { world, a, b } = twoSkillWorld(comparison.compare);
      worlds.push(world);
      commitAll(world.root);

      const run = yield* observeRun(world, comparison, [a, b], { apply: true });

      expect(run).toEqual({
        preparation: {
          probes: { "skills/a": 1, "skills/b": 1, skills: 2, ".": 2 },
          processes: { head: 1, unbornHead: 0, objectFormat: 1, subtrees: 2 },
        },
        states: ["matches-head", "matches-head"],
        // The rebuild's ignore discovery and the comparison each walk, and
        // every comparison reads HEAD itself.
        application: {
          probes: { "skills/a": 2, "skills/b": 2, skills: 4, ".": 4 },
          processes: { head: 2, unbornHead: 0, objectFormat: 2, subtrees: 2 },
        },
      });
    }),
  );
});
