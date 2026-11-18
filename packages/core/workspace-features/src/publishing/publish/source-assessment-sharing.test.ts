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
import { assessPublishSourceState } from "../source-state.js";
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

describe("Publish source assessment payload reads", () => {
  const worlds: Array<PublishWorld> = [];
  afterEach(() => {
    for (const world of worlds.splice(0)) world.cleanup();
  });

  const delegating = () => {
    let current: GitDirectoryComparisonService["compare"] | undefined;
    const compare: GitDirectoryComparisonService["compare"] = (input) =>
      current === undefined ? Effect.die("No live comparison yet") : current(input);
    return { compare, set: (next: typeof compare) => void (current = next) };
  };

  /** Payload entries of the fixture package, relative to its directory. */
  const payload = [
    "skill.json",
    "src/SKILL.md",
    "notes.md",
    "alias.md",
    "drafts/old.md",
    "empty",
    // The comparison names an empty directory with its trailing separator.
    "empty/",
  ];

  /**
   * One authored skill holding an included file, an included link to it, an
   * excluded draft, and an empty directory, committed when `repository` asks.
   */
  const notesWorld = (
    compare: GitDirectoryComparisonService["compare"],
    repository: "committed" | "unborn" | "none",
  ) => {
    const world = makePublishWorld({ settings: { skills: { notes: "workspace" } }, compare });
    const dir = world.write("skill", { name: "notes", publishExclude: ["drafts/**"] });
    fs.writeFileSync(nodePath.join(dir, "notes.md"), "committed notes\n");
    fs.symlinkSync("notes.md", nodePath.join(dir, "alias.md"));
    fs.mkdirSync(nodePath.join(dir, "drafts"));
    fs.writeFileSync(nodePath.join(dir, "drafts", "old.md"), "draft\n");
    fs.mkdirSync(nodePath.join(dir, "empty"));
    if (repository !== "none") git(world.root, "init", "-q");
    if (repository === "committed") commitAll(world.root);
    return { world, dir };
  };

  /** Edit every kind of payload entry after the commit, the draft included. */
  const editAfterCommit = (dir: string) => {
    fs.writeFileSync(nodePath.join(dir, "notes.md"), "edited notes\n");
    fs.rmSync(nodePath.join(dir, "alias.md"));
    fs.symlinkSync("./notes.md", nodePath.join(dir, "alias.md"));
    fs.chmodSync(nodePath.join(dir, "src", "SKILL.md"), 0o755);
    fs.writeFileSync(nodePath.join(dir, "drafts", "old.md"), "edited draft\n");
  };

  const payloadReads = (recording: FileSystemRecording, dir: string) =>
    Object.fromEntries(
      payload.map((relative) => {
        const { readLink, stat, readFile } = recording.counts(nodePath.join(dir, relative));
        return [relative, { readLink: readLink ?? 0, stat: stat ?? 0, readFile: readFile ?? 0 }];
      }),
    );

  const observe = (
    world: PublishWorld,
    comparison: ReturnType<typeof delegating>,
    dir: string,
    options: { readonly apply?: boolean } = {},
  ) =>
    withRecordedRun(world, comparison.set, ({ recording, recorded }) =>
      Effect.gen(function* () {
        recording.reset();
        const prepared = yield* recorded(
          prepare(requestFor(world, { preview: options.apply !== true, acceptWarnings: true })),
        );
        const preparation = payloadReads(recording, dir);
        if (prepared._tag !== "Ready") return yield* Effect.die("Expected a ready preparation");
        const candidate = prepared.candidate.uploadCandidates[0];
        if (candidate === undefined) return yield* Effect.die("Expected one upload candidate");
        const assessment = candidate.sourceAssessment;
        // An assessment that reads every payload entry itself, for reference.
        const live = yield* assessPublishSourceState({
          directory: candidate.extensionDir,
          archivePlan: candidate.archivePlan,
          selection: candidate.fileSelection,
        });
        expect(assessment).toEqual(live);
        if (options.apply !== true) return { preparation, assessment };
        recording.reset();
        const outcome = yield* recorded(previewOrApply(prepared.candidate, apply));
        expect(publishDocument(outcome).counts).toMatchObject({ published: 1 });
        return { preparation, assessment, application: payloadReads(recording, dir) };
      }),
    );

  const reads = (readLink: number, stat: number, readFile: number) => ({
    readLink,
    stat,
    readFile,
  });

  it.effect("hashes the payload the archive read instead of reading it again", () =>
    Effect.gen(function* () {
      const comparison = delegating();
      const { world, dir } = notesWorld(comparison.compare, "committed");
      worlds.push(world);
      editAfterCommit(dir);

      const run = yield* observe(world, comparison, dir);

      expect(run.assessment?.state).toMatchObject({
        status: "differs-from-head",
        differences: [
          { path: "alias.md", change: "modified" },
          // Git cannot hold an empty directory.
          { path: "empty/", change: "added" },
          { path: "notes.md", change: "modified" },
          { path: "src/SKILL.md", change: "modified" },
        ],
      });
      expect(run.preparation).toEqual({
        // The canonical observation, the candidate decode and the archive read the manifest.
        "skill.json": reads(1, 1, 3),
        "src/SKILL.md": reads(1, 1, 1),
        // The archive's link containment check also reads the link it resolves.
        "notes.md": reads(2, 1, 1),
        "alias.md": reads(1, 0, 0),
        // An excluded draft's bytes were never archived, so the assessment reads them.
        "drafts/old.md": reads(1, 1, 1),
        empty: reads(1, 1, 0),
        "empty/": reads(0, 0, 0),
      });
    }),
  );

  it.effect("takes the observations of an existing directory by its original paths", () =>
    Effect.gen(function* () {
      const comparison = delegating();
      const world = makePublishWorld({ compare: comparison.compare });
      worlds.push(world);
      const dir = nodePath.join(world.root, "upstream");
      fs.mkdirSync(nodePath.join(dir, "empty"), { recursive: true });
      fs.writeFileSync(nodePath.join(dir, "SKILL.md"), "# Upstream\n");
      fs.writeFileSync(nodePath.join(dir, "notes.md"), "committed notes\n");
      fs.symlinkSync("notes.md", nodePath.join(dir, "alias.md"));
      git(world.root, "init", "-q");
      commitAll(world.root);
      fs.writeFileSync(nodePath.join(dir, "notes.md"), "edited notes\n");

      const run = yield* withRecordedRun(world, comparison.set, ({ recording, recorded }) =>
        Effect.gen(function* () {
          recording.reset();
          const prepared = yield* recorded(
            prepare(
              requestFor(world, {
                selectors: ["@acme/skills/review"],
                from: dir,
                packageVersion: "1.0.0",
                preview: true,
              }),
            ),
          );
          const counts = Object.fromEntries(
            ["SKILL.md", "notes.md", "alias.md", "empty/"].map((relative) => {
              const { readLink, stat, readFile } = recording.counts(nodePath.join(dir, relative));
              return [relative, reads(readLink ?? 0, stat ?? 0, readFile ?? 0)];
            }),
          );
          if (prepared._tag !== "Ready") return yield* Effect.die("Expected a ready preparation");
          const candidate = prepared.candidate.uploadCandidates[0];
          if (candidate === undefined) return yield* Effect.die("Expected one upload candidate");
          const live = yield* assessPublishSourceState({
            directory: candidate.extensionDir,
            archivePlan: candidate.archivePlan,
            payloadPrefix: "src/",
            selection: candidate.fileSelection,
          });
          expect(candidate.sourceAssessment).toEqual(live);
          return { counts, state: candidate.sourceAssessment?.state };
        }),
      );

      expect(run.counts).toEqual({
        "SKILL.md": reads(1, 1, 1),
        "notes.md": reads(2, 1, 1),
        "alias.md": reads(1, 0, 0),
        "empty/": reads(0, 0, 0),
      });
      expect(run.state).toMatchObject({
        status: "differs-from-head",
        directory: "upstream",
        differences: [
          { path: "empty/", change: "added" },
          { path: "notes.md", change: "modified" },
        ],
      });
    }),
  );

  it.effect("reads no payload again outside Git or without a HEAD commit", () =>
    Effect.gen(function* () {
      for (const repository of ["none", "unborn"] as const) {
        const comparison = delegating();
        const { world, dir } = notesWorld(comparison.compare, repository);
        worlds.push(world);

        const run = yield* observe(world, comparison, dir);

        expect({ repository, preparation: run.preparation }).toEqual({
          repository,
          preparation: {
            "skill.json": reads(1, 1, 3),
            "src/SKILL.md": reads(1, 1, 1),
            "notes.md": reads(2, 1, 1),
            "alias.md": reads(1, 0, 0),
            "drafts/old.md": reads(1, 1, 0),
            empty: reads(1, 1, 0),
            "empty/": reads(0, 0, 0),
          },
        });
        expect(run.assessment?.state?.status).toBe(repository === "none" ? undefined : "no-head");
      }
    }),
  );

  it.effect("revalidates the payload from live reads before uploading", () =>
    Effect.gen(function* () {
      const comparison = delegating();
      const { world, dir } = notesWorld(comparison.compare, "committed");
      worlds.push(world);
      editAfterCommit(dir);

      const run = yield* observe(world, comparison, dir, { apply: true });

      // The apply observes every payload entry afresh, its revalidation's
      // comparison included, exactly as many times as before.
      expect(run.application).toEqual({
        "skill.json": reads(5, 5, 5),
        "src/SKILL.md": reads(5, 5, 5),
        "notes.md": reads(6, 5, 5),
        "alias.md": reads(5, 0, 0),
        "drafts/old.md": reads(5, 5, 4),
        empty: reads(4, 4, 0),
        "empty/": reads(1, 1, 0),
      });
    }),
  );
});
