/**
 * Materialize the repository index as an isolated, read-only lint workspace.
 *
 * Git checkout commands apply working-tree filters and line-ending conversion,
 * so they cannot represent the index byte-for-byte. This module enumerates
 * stage-0 entries, reads every unique blob through one `git cat-file --batch`
 * process, and recreates the indexed modes in a scoped temporary directory.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import { ChildProcess } from "effect/unstable/process";
import { createHash } from "node:crypto";
import { LintStagingFailed } from "./errors.js";
import { findGitRoot } from "@agentxm/extension-sources";

export interface StagedWorkspace {
  readonly gitRoot: string;
  readonly snapshotRoot: string;
  readonly workspaceRoot: string;
  readonly displayWorkspaceRoot: string;
  readonly fingerprint: string;
}

interface IndexEntry {
  readonly mode: string;
  readonly objectId: string;
  readonly path: string;
}

// Deliberately duplicated from the CLI-destined environment module: a feature
// package may not depend on application utilities, and this snapshot helper is
// within the sanctioned duplication budget for small pure functions.
// eslint-disable-next-line no-restricted-properties -- Centralized env var access point; callers filter the snapshot before passing it to child processes
const readEnvironment = (): Readonly<Record<string, string | undefined>> => ({ ...process.env });

const GIT_REPOSITORY_ENVIRONMENT_VARIABLES = new Set([
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_CONFIG",
  "GIT_CONFIG_COUNT",
  "GIT_CONFIG_PARAMETERS",
  "GIT_DIR",
  "GIT_GRAFT_FILE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_OBJECT_DIRECTORY",
  "GIT_PREFIX",
  "GIT_REPLACE_REF_BASE",
  "GIT_SHALLOW_FILE",
  "GIT_WORK_TREE",
]);

/** Remove repository-local variables inherited from Git hook processes. */
export const isolatedGitEnvironment = (): Record<string, string> => ({
  ...Object.fromEntries(
    Object.entries(readEnvironment()).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !GIT_REPOSITORY_ENVIRONMENT_VARIABLES.has(entry[0]),
    ),
  ),
  GIT_TERMINAL_PROMPT: "0",
  GIT_LFS_SKIP_SMUDGE: "1",
});

const stagedSnapshotError = (args: {
  readonly title?: string;
  readonly detail: string;
  readonly cause?: unknown;
}): LintStagingFailed =>
  new LintStagingFailed({
    category: "validation",
    title: args.title ?? "Git index snapshot failed",
    detail: args.detail,
    ...(args.cause === undefined ? {} : { cause: args.cause }),
  });

const parseIndexEntries = (
  raw: string,
): Effect.Effect<ReadonlyArray<IndexEntry>, LintStagingFailed> =>
  Effect.gen(function* () {
    const entries: Array<IndexEntry> = [];
    for (const record of raw.split("\0")) {
      if (record.length === 0) continue;
      const separator = record.indexOf("\t");
      if (separator < 0) {
        return yield* stagedSnapshotError({ detail: "Git returned an invalid index entry" });
      }

      const [mode, objectId, stage] = record.slice(0, separator).split(" ");
      const entryPath = record.slice(separator + 1);
      if (
        mode === undefined ||
        objectId === undefined ||
        stage === undefined ||
        entryPath.length === 0 ||
        !/^[0-9a-f]+$/.test(objectId)
      ) {
        return yield* stagedSnapshotError({ detail: "Git returned an invalid index entry" });
      }
      if (stage !== "0") {
        return yield* stagedSnapshotError({
          detail:
            "The Git index contains unmerged entries. Resolve the merge conflicts and stage the result before running axm lint --view git-index.",
        });
      }
      entries.push({ mode, objectId, path: entryPath });
    }
    return entries;
  });

const collectBytes = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  Effect.gen(function* () {
    const chunks = yield* Stream.runCollect(stream);
    const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  });

const collectText = <E>(stream: Stream.Stream<Uint8Array, E>) =>
  collectBytes(stream).pipe(Effect.map((bytes) => new TextDecoder().decode(bytes)));

const parseBatchBlobs = (
  bytes: Uint8Array,
  expectedObjectIds: ReadonlySet<string>,
): Effect.Effect<ReadonlyMap<string, Uint8Array>, LintStagingFailed> =>
  Effect.gen(function* () {
    const blobs = new Map<string, Uint8Array>();
    const decoder = new TextDecoder();
    let cursor = 0;

    while (cursor < bytes.length) {
      const headerEnd = bytes.indexOf(10, cursor);
      if (headerEnd < 0) {
        return yield* stagedSnapshotError({ detail: "Git returned an incomplete blob header" });
      }
      const header = decoder.decode(bytes.slice(cursor, headerEnd));
      const [objectId, objectType, sizeText] = header.split(" ");
      const size = sizeText === undefined ? Number.NaN : Number.parseInt(sizeText, 10);
      if (
        objectId === undefined ||
        objectType !== "blob" ||
        !expectedObjectIds.has(objectId) ||
        !Number.isSafeInteger(size) ||
        size < 0
      ) {
        return yield* stagedSnapshotError({
          detail: `Git returned an invalid blob header: ${header}`,
        });
      }

      const contentStart = headerEnd + 1;
      const contentEnd = contentStart + size;
      if (contentEnd >= bytes.length || bytes[contentEnd] !== 10) {
        return yield* stagedSnapshotError({ detail: "Git returned incomplete staged blob data" });
      }
      blobs.set(objectId, bytes.slice(contentStart, contentEnd));
      cursor = contentEnd + 1;
    }

    if (blobs.size !== expectedObjectIds.size) {
      return yield* stagedSnapshotError({ detail: "Git did not return every staged blob" });
    }
    return blobs;
  });

const readIndexEntries = (gitRoot: string) =>
  Effect.gen(function* () {
    const handle = yield* ChildProcess.make("git", ["ls-files", "--stage", "-z"], {
      cwd: gitRoot,
      env: isolatedGitEnvironment(),
      extendEnv: false,
    });
    const result = yield* Effect.all(
      {
        stdout: collectBytes(handle.stdout),
        stderr: collectText(handle.stderr),
        exitCode: handle.exitCode,
      },
      { concurrency: "unbounded" },
    );
    if (result.exitCode !== 0) {
      return yield* stagedSnapshotError({
        detail: `AXM could not enumerate the Git index${result.stderr.trim().length === 0 ? "" : `: ${result.stderr.trim()}`}`,
      });
    }
    const fingerprint = `sha256:${createHash("sha256").update(result.stdout).digest("hex")}`;
    const raw = new TextDecoder().decode(result.stdout);
    return { entries: yield* parseIndexEntries(raw), fingerprint };
  }).pipe(
    Effect.mapError((cause) =>
      cause._tag === "LintStagingFailed"
        ? cause
        : stagedSnapshotError({
            detail: "AXM could not enumerate the Git index. Confirm Git can read the repository.",
            cause,
          }),
    ),
  );

const readIndexBlobs = (args: {
  readonly gitRoot: string;
  readonly objectIds: ReadonlyArray<string>;
}) => {
  if (args.objectIds.length === 0) {
    return Effect.succeed<ReadonlyMap<string, Uint8Array>>(new Map());
  }

  const expectedObjectIds: ReadonlySet<string> = new Set(args.objectIds);
  const input = new TextEncoder().encode(`${args.objectIds.join("\n")}\n`);
  const process = Effect.gen(function* () {
    const handle = yield* ChildProcess.make("git", ["cat-file", "--batch"], {
      cwd: args.gitRoot,
      env: isolatedGitEnvironment(),
      extendEnv: false,
      stdin: Stream.make(input),
    });
    return yield* Effect.all(
      {
        stdout: collectBytes(handle.stdout),
        stderr: collectText(handle.stderr),
        exitCode: handle.exitCode,
      },
      { concurrency: "unbounded" },
    );
  }).pipe(
    Effect.mapError((cause) =>
      stagedSnapshotError({ detail: "Git could not read the staged blob data", cause }),
    ),
  );

  return Effect.gen(function* () {
    const result = yield* process;
    if (result.exitCode !== 0) {
      return yield* stagedSnapshotError({
        detail: `Git could not read the staged blob data${result.stderr.trim().length === 0 ? "" : `: ${result.stderr.trim()}`}`,
      });
    }
    return yield* parseBatchBlobs(result.stdout, expectedObjectIds);
  });
};

const writeIndexEntry = (args: {
  readonly entry: IndexEntry;
  readonly blobs: ReadonlyMap<string, Uint8Array>;
  readonly workspaceRoot: string;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const destination = path.resolve(args.workspaceRoot, args.entry.path);
    const relative = path.relative(args.workspaceRoot, destination);
    if (relative.length === 0 || relative.startsWith("..") || path.isAbsolute(relative)) {
      return yield* stagedSnapshotError({
        detail: `Git index path escapes the staged workspace: ${args.entry.path}`,
      });
    }

    const mapFileError = (cause: unknown) =>
      new LintStagingFailed({
        category: "internal",
        detail: `Failed to materialize staged path: ${args.entry.path}`,
        cause,
      });

    if (args.entry.mode === "160000") {
      yield* fs.makeDirectory(destination, { recursive: true }).pipe(Effect.mapError(mapFileError));
      return;
    }

    const blob = args.blobs.get(args.entry.objectId);
    if (blob === undefined) {
      return yield* stagedSnapshotError({
        detail: `Git did not return the staged blob for ${args.entry.path}`,
      });
    }
    yield* fs
      .makeDirectory(path.dirname(destination), { recursive: true })
      .pipe(Effect.mapError(mapFileError));

    if (args.entry.mode === "120000") {
      const target = yield* Effect.try({
        try: () => new TextDecoder("utf-8", { fatal: true }).decode(blob),
        catch: (cause) =>
          stagedSnapshotError({
            detail: `Staged symbolic-link target is not valid UTF-8: ${args.entry.path}`,
            cause,
          }),
      });
      yield* fs.symlink(target, destination).pipe(Effect.mapError(mapFileError));
      return;
    }

    if (args.entry.mode !== "100644" && args.entry.mode !== "100755") {
      return yield* stagedSnapshotError({
        detail: `Unsupported Git index mode '${args.entry.mode}' for ${args.entry.path}`,
      });
    }
    yield* fs
      .writeFile(destination, blob, { mode: args.entry.mode === "100755" ? 0o755 : 0o644 })
      .pipe(Effect.mapError(mapFileError));
  });

export const materializeGitIndexWorkspace = Effect.fn("Lint.materializeGitIndexWorkspace")(
  function* (startPath: string, options: { readonly selectRepositoryRoot?: boolean } = {}) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const resolvedStartPath = path.resolve(startPath);
    const gitRoot = yield* findGitRoot(resolvedStartPath);

    if (Option.isNone(gitRoot)) {
      return yield* stagedSnapshotError({
        title: "Git index unavailable",
        detail: `axm lint --view git-index requires a Git repository; no .git entry was found from '${resolvedStartPath}'`,
      });
    }

    const displayWorkspaceRoot = options.selectRepositoryRoot ? gitRoot.value : resolvedStartPath;
    const selectedRelative = path.relative(gitRoot.value, displayWorkspaceRoot);
    if (selectedRelative.startsWith("..") || path.isAbsolute(selectedRelative)) {
      return yield* stagedSnapshotError({
        detail: `Lint path '${displayWorkspaceRoot}' is outside Git repository '${gitRoot.value}'`,
      });
    }

    const snapshotRoot = yield* fs.makeTempDirectoryScoped({ prefix: "axm-lint-git-index-" }).pipe(
      Effect.mapError(
        (cause) =>
          new LintStagingFailed({
            category: "internal",
            detail: "Failed to create the temporary Git-index snapshot",
            cause,
          }),
      ),
    );
    const { entries, fingerprint } = yield* readIndexEntries(gitRoot.value);
    const objectIds = [
      ...new Set(entries.filter((entry) => entry.mode !== "160000").map((entry) => entry.objectId)),
    ];
    const blobs = yield* readIndexBlobs({ gitRoot: gitRoot.value, objectIds });
    yield* Effect.forEach(
      entries,
      (entry) => writeIndexEntry({ entry, blobs, workspaceRoot: snapshotRoot }),
      {
        concurrency: 32,
        discard: true,
      },
    );

    const workspaceRoot =
      selectedRelative.length === 0 ? snapshotRoot : path.resolve(snapshotRoot, selectedRelative);
    yield* fs.makeDirectory(workspaceRoot, { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new LintStagingFailed({
            category: "internal",
            detail: "Failed to select Git-index workspace",
            cause,
          }),
      ),
    );

    return {
      gitRoot: gitRoot.value,
      snapshotRoot,
      workspaceRoot,
      displayWorkspaceRoot,
      fingerprint,
    } satisfies StagedWorkspace;
  },
);
