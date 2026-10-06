/**
 * Git operations for cloning repositories at specific refs.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import { createHash } from "node:crypto";
import * as FileSystem from "effect/FileSystem";
import * as Array from "effect/Array";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { simpleGit, type SimpleGit, type SimpleGitOptions } from "simple-git";
import { OperationRequestBudget, redactRegistryText } from "@agentxm/registry-client";

import { GitOperationFailed, type GitOperation } from "../errors.js";
import { inheritedGitEnvironment } from "../../acquisition/index.js";

// -----------------------------------------------------------------------------
// Internal Helpers
// -----------------------------------------------------------------------------

const withGitRequestPermit = <A, E, R>(url: string, effect: Effect.Effect<A, E, R>) =>
  Effect.serviceOption(OperationRequestBudget).pipe(
    Effect.flatMap((budget) =>
      Option.isNone(budget) ? effect : budget.value.withAttempt(gitRequestOrigin(url), effect),
    ),
  );

const gitRequestOrigin = (url: string): string => {
  try {
    const parsed = new URL(url);
    return parsed.host.length === 0
      ? url
      : parsed.origin === "null"
        ? `${parsed.protocol}//${parsed.host}`
        : parsed.origin;
  } catch {
    const host = /^(?:[^@]+@)?([^:]+):/u.exec(url)?.[1];
    return host === undefined ? url : `ssh://${host}`;
  }
};

const INTERACTIVE_COMMAND_VARIABLES: ReadonlySet<string> = new Set([
  "editor",
  "visual",
  "git_editor",
  "git_sequence_editor",
  "pager",
  "git_pager",
]);

const createGit = (baseDir: string, abort?: AbortSignal): SimpleGit => {
  // Git never opens an editor or pager here, and simple-git rejects inherited
  // editor and pager commands. Remove them under the same trimmed,
  // case-insensitive key match simple-git applies; keep every other key.
  const environment = {
    ...Object.fromEntries(
      Object.entries(inheritedGitEnvironment()).filter(
        ([key]) => !INTERACTIVE_COMMAND_VARIABLES.has(key.trim().toLowerCase()),
      ),
    ),
    GIT_TERMINAL_PROMPT: "0",
    GIT_LFS_SKIP_SMUDGE: "1",
  };
  const options: Partial<SimpleGitOptions> = {
    baseDir,
    binary: "git",
    maxConcurrentProcesses: 1,
    // Preserve this process's explicit transport context under the v4 environment
    // guard. Unsafe-operation checks still validate the forwarded settings.
    allowEnvironment: Object.keys(environment),
    unsafe: { allowUnsafeSshCommand: true },
    ...(abort === undefined ? {} : { abort }),
  };

  return simpleGit(options).env(environment);
};

const foreignReason = (error: unknown): string | undefined => {
  const message =
    typeof error === "string" ? error : error instanceof Error ? error.message : undefined;
  const reason = message?.trim();
  return reason === undefined || reason.length === 0 ? undefined : reason;
};

/**
 * Maps unknown errors to the typed git failure with appropriate context. The
 * detail carries the foreign reason when there is one, with credential shapes
 * such as URL userinfo redacted; the original error stays in `cause`.
 */
const mapGitError =
  (operation: GitOperation, context?: string) =>
  (error: unknown): GitOperationFailed => {
    const baseMessage = context ?? `Git ${operation} failed`;
    const reason = foreignReason(error);

    return new GitOperationFailed({
      operation,
      detail: redactRegistryText(reason === undefined ? baseMessage : `${baseMessage}: ${reason}`),
      cause: error,
    });
  };

/** Interrupt the child before returning a typed failure when Git stops responding. */
export const withGitOperationDeadline =
  (
    operation: GitOperation,
    duration: Duration.Input = Duration.minutes(5),
  ): (<A, R>(
    effect: Effect.Effect<A, GitOperationFailed, R>,
  ) => Effect.Effect<A, GitOperationFailed, R>) =>
  <A, R>(
    effect: Effect.Effect<A, GitOperationFailed, R>,
  ): Effect.Effect<A, GitOperationFailed, R> =>
    effect.pipe(
      Effect.timeoutOrElse({
        duration,
        orElse: () =>
          Effect.fail(
            new GitOperationFailed({
              operation,
              detail: `Git ${operation} exceeded its operation deadline`,
            }),
          ),
      }),
    );

const toPosixPath = (value: string, separator: string): string =>
  separator === "/" ? value : value.split(separator).join("/");

const relativeTreePath = (
  repositoryDirectory: string,
  repositoryPath: string,
): string | undefined => {
  if (repositoryDirectory === ".") return repositoryPath;
  const prefix = `${repositoryDirectory}/`;
  return repositoryPath.startsWith(prefix) ? repositoryPath.slice(prefix.length) : undefined;
};

const parseHeadBlobs = (
  output: string,
  repositoryDirectory: string,
): ReadonlyMap<string, { readonly mode: string; readonly objectId?: string }> => {
  const blobs = new Map<string, { readonly mode: string; readonly objectId?: string }>();
  for (const record of output.split("\0")) {
    if (record.length === 0) continue;
    const separator = record.indexOf("\t");
    if (separator < 0) throw new Error(`Unexpected ls-tree output: ${record}`);
    const [mode, objectType, objectId] = record.slice(0, separator).split(" ");
    if (mode === undefined || objectType === undefined || objectId === undefined) {
      throw new Error(`Unexpected ls-tree output: ${record}`);
    }
    if (objectType !== "blob" || (!mode.startsWith("100") && mode !== "120000")) continue;
    const path = relativeTreePath(repositoryDirectory, record.slice(separator + 1));
    if (path !== undefined) blobs.set(path, { mode, objectId });
  }
  return blobs;
};

const readHeadRevision = async (git: SimpleGit): Promise<string | undefined> => {
  try {
    return (await git.revparse(["--verify", "HEAD"])).trim();
  } catch (cause) {
    try {
      const symbolicRef = (await git.raw(["symbolic-ref", "--quiet", "HEAD"])).trim();
      const refObject = (
        await git.raw(["for-each-ref", "--format=%(objectname)", symbolicRef])
      ).trim();
      if (refObject.length === 0) return undefined;
      throw cause;
    } catch {
      throw cause;
    }
  }
};

/** One raw payload-entry difference between a Git HEAD subtree and the working tree. */
export interface GitDirectoryDifference {
  readonly path: string;
  readonly change: "added" | "modified" | "deleted";
  readonly headObject?: string;
  readonly workingObject?: string;
}

/** Git evidence for one directory, before feature-specific archive filtering. */
export interface GitDirectoryComparisonResult {
  readonly repositoryRoot: string;
  readonly repositoryDirectory: string;
  readonly headRevision?: string;
  readonly differences: ReadonlyArray<GitDirectoryDifference>;
}

// -----------------------------------------------------------------------------
// Git Operations
// -----------------------------------------------------------------------------

/**
 * Shallow clone a git repository (depth 1, single branch).
 * Significantly faster than a full clone for read-only use cases like skill discovery.
 *
 * @param url - Repository URL (HTTPS or SSH)
 * @param destination - Local path to clone to
 * @param ref - Optional git ref (branch or tag) to clone
 * @returns Effect that resolves on success or fails with GitError
 *
 * @experimental This API is unstable and may change without notice.
 */
export const shallowClone = (url: string, destination: string, ref?: string) =>
  Effect.gen(function* () {
    if (ref !== undefined && /^[a-f0-9]{40}$/iu.test(ref)) {
      return yield* shallowFetchCommit(url, destination, ref);
    }
    const path = yield* Path.Path;
    return yield* withGitRequestPermit(
      url,
      Effect.tryPromise({
        try: (signal) =>
          createGit(path.dirname(destination), signal).clone(url, destination, [
            "--depth",
            "1",
            "--single-branch",
            ...(ref ? ["--branch", ref] : []),
          ]),
        catch: mapGitError("clone", `Failed to shallow clone ${url}`),
      }),
    );
  }).pipe(withGitOperationDeadline("clone"), Effect.withSpan("Git.shallowClone"));

/** Initialize a shallow checkout at one immutable, remote-reachable commit. */
export const shallowFetchCommit = (url: string, destination: string, commit: string) =>
  Effect.gen(function* () {
    const mapError = mapGitError(
      "fetch-commit",
      `Failed to fetch recorded commit ${commit} from ${url}`,
    );
    yield* Effect.tryPromise({
      try: async (signal) => {
        const git = createGit(destination, signal);
        await git.init();
        await git.addRemote("origin", url);
      },
      catch: mapError,
    });
    yield* withGitRequestPermit(
      url,
      Effect.tryPromise({
        try: (signal) =>
          createGit(destination, signal).raw(["fetch", "--depth", "1", "origin", commit]),
        catch: mapError,
      }),
    );
    yield* Effect.tryPromise({
      try: (signal) => createGit(destination, signal).raw(["checkout", "--detach", "FETCH_HEAD"]),
      catch: mapError,
    });
  }).pipe(withGitOperationDeadline("fetch-commit"), Effect.withSpan("Git.shallowFetchCommit"));

/** Remote branch and tag names advertised by a Git repository. */
export interface GitRemoteRefs {
  readonly branches: ReadonlyArray<string>;
  readonly tags: ReadonlyArray<string>;
}

const parseRemoteRefs = (output: string): GitRemoteRefs => {
  const branches = new Set<string>();
  const tags = new Set<string>();
  for (const line of output.split("\n")) {
    const ref = line.trim().split(/\s+/u).at(1);
    if (ref?.startsWith("refs/heads/")) branches.add(ref.slice("refs/heads/".length));
    if (ref?.startsWith("refs/tags/")) {
      tags.add(ref.slice("refs/tags/".length).replace(/\^\{\}$/u, ""));
    }
  }
  return { branches: [...branches], tags: [...tags] };
};

/** List the remote's advertised branches and tags without cloning it. */
export const listRemoteRefs = (url: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return yield* withGitRequestPermit(
      url,
      Effect.tryPromise({
        try: (signal) =>
          createGit(path.resolve("."), signal).raw(["ls-remote", "--heads", "--tags", url]),
        catch: mapGitError("list-remote-refs", `Failed to list remote Git refs from ${url}`),
      }).pipe(Effect.map(parseRemoteRefs)),
    );
  }).pipe(withGitOperationDeadline("list-remote-refs"), Effect.withSpan("Git.listRemoteRefs"));

/** Read one configured remote URL from a local repository. */
export const getRemoteUrl = (repoPath: string, remoteName: string) =>
  Effect.tryPromise({
    try: async (signal) => {
      const remotes = await createGit(repoPath, signal).getRemotes(true);
      const remote = remotes.find((candidate) => candidate.name === remoteName);
      const url = remote?.refs.fetch.trim();
      return url === undefined || url.length === 0 ? Option.none<string>() : Option.some(url);
    },
    catch: mapGitError("get-remote-url", `Failed to read Git remote '${remoteName}'`),
  }).pipe(withGitOperationDeadline("get-remote-url"), Effect.withSpan("Git.getRemoteUrl"));

/** Get the immutable commit checked out at HEAD. */
export const getCommitSha = (repoPath: string) =>
  Effect.tryPromise({
    try: async (signal) => (await createGit(repoPath, signal).revparse(["HEAD"])).trim(),
    catch: mapGitError("get-commit-sha", "Failed to get checked-out commit SHA"),
  }).pipe(withGitOperationDeadline("get-commit-sha"), Effect.withSpan("Git.getCommitSha"));

/** Read the single tag that points at the checked-out commit. */
export const getExactTag = (repoPath: string) =>
  Effect.tryPromise({
    try: async (signal) => {
      const tags = (await createGit(repoPath, signal).raw(["tag", "--points-at", "HEAD"]))
        .split("\n")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
        .sort();
      return tags.length === 1 ? Option.some(tags[0] ?? "") : Option.none<string>();
    },
    catch: mapGitError("get-exact-tag", "Failed to read the tag at the checked-out commit"),
  }).pipe(withGitOperationDeadline("get-exact-tag"), Effect.withSpan("Git.getExactTag"));

/**
 * Get the git tree SHA for a path within a repository.
 *
 * The tree SHA is a hash of the directory's contents at the current commit.
 * Unlike commit SHA, it is stable across rebases that don't change content.
 *
 * @param repoPath - Path to the git repository root
 * @param subPath - Optional subpath within the repository (defaults to root ".")
 * @returns Effect that resolves to the tree SHA, or fails if path is not in a git repo
 *
 * @experimental This API is unstable and may change without notice.
 */
export const getTreeSha = (repoPath: string, subPath = ".") =>
  Effect.tryPromise({
    try: async (signal) => {
      const git = createGit(repoPath, signal);

      // For root directory, use rev-parse HEAD^{tree}
      if (subPath === "." || subPath === "") {
        const result = await git.revparse(["HEAD^{tree}"]);
        return result.trim();
      }

      // For subdirectories, use ls-tree to get the tree object SHA
      // ls-tree returns: <mode> <type> <sha>\t<path>
      const result = await git.raw(["ls-tree", "HEAD", subPath]);
      const trimmed = result.trim();
      if (!trimmed) {
        throw new Error(`Path '${subPath}' not found in repository`);
      }
      // Parse the output: "040000 tree <sha>\t<path>" or "100644 blob <sha>\t<path>"
      const parts = trimmed.split(/\s+/);
      if (parts[0] !== "040000" || parts[1] !== "tree")
        throw new Error(`Path '${subPath}' is not a directory tree`);
      const sha = Option.getOrThrowWith(
        Array.get(parts, 2),
        () => new Error(`Unexpected ls-tree output: ${trimmed}`),
      );
      return sha;
    },
    catch: mapGitError("get-tree-sha", `Failed to get tree SHA for '${subPath}'`),
  }).pipe(withGitOperationDeadline("get-tree-sha"), Effect.withSpan("Git.getTreeSha"));

/**
 * Compare an exact set of current payload entries with the corresponding Git
 * HEAD subtree. The caller owns which current paths belong to its material
 * boundary; deleted HEAD paths remain present in the returned difference set
 * so that boundary can classify them too.
 */
export const compareDirectoryToHead = (
  repositoryRoot: string,
  directory: string,
  currentPaths: ReadonlyArray<string>,
): Effect.Effect<
  GitDirectoryComparisonResult,
  GitOperationFailed,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const repositoryDirectory = toPosixPath(path.relative(repositoryRoot, directory), path.sep);
    const normalizedDirectory = repositoryDirectory.length === 0 ? "." : repositoryDirectory;
    const head = yield* Effect.tryPromise({
      try: async (signal) => {
        const git = createGit(repositoryRoot, signal);
        const revision = await readHeadRevision(git);
        if (revision === undefined) return undefined;
        const treeOutput = await git.raw([
          "ls-tree",
          "-r",
          "-z",
          "--full-tree",
          "HEAD",
          "--",
          normalizedDirectory,
        ]);
        const objectFormat = (await git.revparse(["--show-object-format"])).trim();
        if (objectFormat !== "sha1" && objectFormat !== "sha256") {
          throw new Error(`Unsupported Git object format: ${objectFormat}`);
        }
        return { revision, blobs: parseHeadBlobs(treeOutput, normalizedDirectory), objectFormat };
      },
      catch: mapGitError("compare-directory-to-head"),
    });
    if (head === undefined) {
      return {
        repositoryRoot,
        repositoryDirectory: normalizedDirectory,
        differences: [...currentPaths]
          .sort((a, b) => a.localeCompare(b))
          .map((currentPath) => ({ path: currentPath, change: "added" as const })),
      } satisfies GitDirectoryComparisonResult;
    }

    // Git hashes a link's raw target, not its referent. Read payload entries
    // without following links so dangling links and cycles remain comparable.
    const workingBlobs = new Map<string, { readonly mode: string; readonly objectId?: string }>();
    for (const currentPath of currentPaths) {
      const absolute = path.join(directory, currentPath);
      const target = yield* fs.readLink(absolute).pipe(Effect.option);
      let bytes: Uint8Array;
      let mode: string;
      if (Option.isSome(target)) {
        bytes = new TextEncoder().encode(target.value);
        mode = "120000";
      } else {
        const info = yield* fs.stat(absolute);
        if (info.type === "Directory") {
          // Git cannot represent an empty directory; report it as added without
          // inventing a Git blob identity for it.
          workingBlobs.set(currentPath, { mode: "040000" });
          continue;
        }
        if (info.type !== "File") {
          return yield* new GitOperationFailed({
            operation: "compare-directory-to-head",
            detail: `Unsupported payload entry: ${currentPath}`,
          });
        }
        bytes = yield* fs.readFile(absolute);
        mode = (info.mode & 0o111) === 0 ? "100644" : "100755";
      }
      const objectId = createHash(head.objectFormat)
        .update(`blob ${bytes.byteLength}\0`)
        .update(bytes)
        .digest("hex");
      workingBlobs.set(currentPath, { mode, objectId });
    }
    const allPaths = [...new Set([...head.blobs.keys(), ...workingBlobs.keys()])].sort((a, b) =>
      a.localeCompare(b),
    );
    const differences = allPaths.flatMap((currentPath): ReadonlyArray<GitDirectoryDifference> => {
      const previous = head.blobs.get(currentPath);
      const current = workingBlobs.get(currentPath);
      if (previous?.objectId === current?.objectId && previous?.mode === current?.mode) return [];
      return [
        {
          path: currentPath,
          change: previous === undefined ? "added" : current === undefined ? "deleted" : "modified",
          ...(previous?.objectId === undefined ? {} : { headObject: previous.objectId }),
          ...(current?.objectId === undefined ? {} : { workingObject: current.objectId }),
        },
      ];
    });
    return {
      repositoryRoot,
      repositoryDirectory: normalizedDirectory,
      headRevision: head.revision,
      differences,
    } satisfies GitDirectoryComparisonResult;
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof GitOperationFailed
        ? cause
        : mapGitError(
            "compare-directory-to-head",
            `Failed to compare '${directory}' with Git HEAD`,
          )(cause),
    ),
    withGitOperationDeadline("compare-directory-to-head"),
    Effect.withSpan("Git.compareDirectoryToHead"),
  );
