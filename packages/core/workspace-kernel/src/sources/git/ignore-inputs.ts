import { annotateWork, withWork } from "@agentxm/host-primitives/work-observation";
import * as crypto from "node:crypto";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type { SelectionRule } from "../../acquisition/index.js";
import { isLexicallyWithin, isNotFound } from "@agentxm/host-primitives";
import { findGitRoot } from "../../locations/index.js";

class IgnoreDiscoveryFailed extends Data.TaggedError("IgnoreDiscoveryFailed")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

/** What the walk observed of one listed entry without following it. */
type ListedEntryFacts =
  | { readonly kind: "link"; readonly target: string }
  | ({ readonly kind: "entry" } & Pick<FileSystem.File.Info, "type" | "size" | "mode">);

/**
 * The package tree exactly as one observation listed it, keyed by the
 * directory path relative to the package root ("" for the root, joined with
 * the platform separator). Names keep their listing order. A `.git` entry is
 * never examined, so it has no facts.
 */
type PackageListing = {
  readonly names: (relativeDirectory: string) => ReadonlyArray<string> | undefined;
  readonly facts: (relativeDirectory: string, name: string) => ListedEntryFacts | undefined;
};

interface IgnoreSnapshot {
  readonly boundaryRoot: string;
  readonly packageDirectory: string;
  readonly rules: ReadonlyArray<SelectionRule>;
  readonly fingerprint: string;
  readonly listing?: PackageListing;
  /** The Git root the walk from the package found, when this observation walked for one. */
  readonly gitRoot?: Option.Option<string>;
}

/** Rediscover every time, including missing ancestor files and newly created nested files. */
export const observeGitIgnoreInputs = (input: {
  readonly packageRoot: string;
  /** Acquisition callers supply the original source boundary. */
  readonly boundaryRoot?: string;
  /**
   * Return the package listing this observation walked, for a caller that
   * walks the same tree within the same operation and holds it no longer.
   */
  readonly retainListing?: boolean;
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const readLink = (absolute: string) =>
      fs.readLink(absolute).pipe(
        Effect.catchIf(
          (error) => {
            const cause = error.reason.cause;
            return (
              typeof cause === "object" &&
              cause !== null &&
              "code" in cause &&
              cause.code === "EINVAL"
            );
          },
          () => Effect.succeed(undefined),
        ),
      );
    const packageRoot = path.resolve(input.packageRoot);
    const gitRoot = input.boundaryRoot === undefined ? yield* findGitRoot(packageRoot) : undefined;
    const boundaryRoot =
      input.boundaryRoot === undefined
        ? Option.getOrElse(gitRoot ?? Option.none(), () => packageRoot)
        : path.resolve(input.boundaryRoot);
    if (!isLexicallyWithin(path, boundaryRoot, packageRoot)) {
      return yield* new IgnoreDiscoveryFailed({
        detail: "The package is outside its ignore discovery boundary.",
      });
    }
    const packageDirectory = path.relative(boundaryRoot, packageRoot).split(path.sep).join("/");
    const directories: Array<string> = [];
    let ancestor = packageRoot;
    while (true) {
      directories.unshift(ancestor);
      if (ancestor === boundaryRoot) break;
      ancestor = path.dirname(ancestor);
    }
    // Facts of an exactly named ".gitignore" each walked directory listed.
    const listedIgnoreInputs = new Map<string, ListedEntryFacts>();
    const listedNames = new Map<string, ReadonlyArray<string>>();
    const listedFacts = new Map<string, ReadonlyMap<string, ListedEntryFacts>>();
    const pending = [{ directory: packageRoot, relative: "" }];
    while (pending.length > 0) {
      const next = pending.pop();
      if (next === undefined) break;
      const { directory, relative } = next;
      const names = yield* fs.readDirectory(directory);
      const facts = new Map<string, ListedEntryFacts>();
      for (const name of [...names].sort().reverse()) {
        if (name === ".git") continue;
        const kept = input.retainListing === true || name === ".gitignore";
        const absolute = path.join(directory, name);
        const target = yield* readLink(absolute);
        if (target !== undefined) {
          if (kept) facts.set(name, Object.freeze({ kind: "link", target }));
          continue;
        }
        const info = yield* fs.stat(absolute);
        if (kept)
          facts.set(
            name,
            Object.freeze({ kind: "entry", type: info.type, size: info.size, mode: info.mode }),
          );
        if (info.type !== "Directory") continue;
        directories.push(absolute);
        pending.push({ directory: absolute, relative: path.join(relative, name) });
      }
      const ignoreInput = facts.get(".gitignore");
      if (ignoreInput !== undefined) listedIgnoreInputs.set(directory, ignoreInput);
      if (input.retainListing === true) {
        listedNames.set(relative, Object.freeze([...names]));
        listedFacts.set(relative, facts);
      }
    }
    directories.sort((left, right) => {
      const depth = (value: string) => path.relative(boundaryRoot, value).split(path.sep).length;
      return depth(left) - depth(right) || left.localeCompare(right);
    });
    const rules: Array<SelectionRule> = [];
    const observed: Array<{ readonly file: string; readonly contents: string }> = [];
    for (const directory of directories) {
      const absolute = path.join(directory, ".gitignore");
      // The walk already observed an input it listed under this exact name;
      // any other spelling, or an ancestor the walk never listed, is probed.
      const listed = listedIgnoreInputs.get(directory);
      const link =
        listed === undefined
          ? yield* readLink(absolute).pipe(
              Effect.catchIf(isNotFound, () => Effect.succeed(undefined)),
            )
          : listed.kind === "link"
            ? listed.target
            : undefined;
      if (link !== undefined) {
        return yield* new IgnoreDiscoveryFailed({
          detail: "A publication .gitignore must be a regular file, not a symbolic link.",
        });
      }
      const info =
        listed?.kind === "entry"
          ? listed
          : yield* fs
              .stat(absolute)
              .pipe(Effect.catchIf(isNotFound, () => Effect.succeed(undefined)));
      if (info === undefined) continue;
      // Git does not follow symbolic links when accessing a .gitignore file.
      if (info.type !== "File") {
        return yield* new IgnoreDiscoveryFailed({
          detail: "A publication .gitignore must be a regular file.",
        });
      }
      const contents = yield* fs.readFileString(absolute);
      const file = path.relative(boundaryRoot, absolute).split(path.sep).join("/");
      const baseDirectory = path.relative(boundaryRoot, directory).split(path.sep).join("/");
      observed.push({ file, contents });
      contents.split(/\r?\n/).forEach((pattern, index) => {
        if (pattern === "" || pattern.startsWith("#")) return;
        rules.push({
          pattern,
          baseDirectory,
          origin: { kind: "gitignore", file, line: index + 1 },
        });
      });
    }
    const fingerprint = yield* Effect.gen(function* () {
      const input = JSON.stringify({ packageDirectory, observed });
      const digest = yield* Effect.sync(() =>
        crypto.createHash("sha256").update(input).digest("hex"),
      );
      yield* annotateWork({
        "axm.work.count": 1,
        "axm.work.bytes": Buffer.byteLength(input),
      });
      return digest;
    }).pipe((effect) => withWork("axm.hash.git-ignore", effect));
    const listing: PackageListing = {
      names: (relativeDirectory) => listedNames.get(relativeDirectory),
      facts: (relativeDirectory, name) => listedFacts.get(relativeDirectory)?.get(name),
    };
    return {
      boundaryRoot,
      packageDirectory,
      rules,
      fingerprint,
      ...(input.retainListing === true ? { listing } : {}),
      ...(gitRoot === undefined ? {} : { gitRoot }),
    } satisfies IgnoreSnapshot;
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof IgnoreDiscoveryFailed
        ? cause
        : new IgnoreDiscoveryFailed({
            detail: "Cannot read publication ignore inputs.",
            cause,
          }),
    ),
  );
