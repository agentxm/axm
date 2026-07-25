/**
 * Canonical-extensions scanner: enumerates `.axm/extensions/<owner>/<local-type>/<name>/src`
 * (canonical AXM) and `.axm/extensions/external/<local-type>/<name>`
 * (external AXM) materializations across all extension types.
 *
 * Per Decision 5 of the workspace read-model design, scanner output is
 * occurrence-shaped. Each emitted occurrence carries the scanner-tier origin
 * discriminator (`canonical-axm` | `external-axm`) plus the extension type;
 * Phase 7 maps these into per-subject origin unions.
 *
 * Each occurrence carries structural fields the subject modules need for
 * cross-platform path handling — `pathSegments` (the absolute path split via
 * the `Path` service) and `subjectFile` (the canonical primary content file
 * for the subject type, e.g., `<dir>/SKILL.md` for skills) — plus a probed
 * `subjectFileExists` flag so subject modules do not hardcode presence.
 *
 * Scanner contract:
 *
 * - Public effect carries no `FileSystem | Path` requirement. Construction
 *   takes a deps record and returns an `Effect<ReadonlyArray<…>>`.
 * - Per-file partial failures (a directory we cannot enumerate) become
 *   diagnostic warnings, not errors. The error channel stays empty.
 * - WorkspaceMutations-root path-escape is checked at provider construction (Phase 9),
 *   not inside the scanner.
 *
 * The scanner avoids `fs.stat` and uses only `fs.exists` / `fs.readDirectory`
 * so it remains compatible with the fixture builder's in-memory `FileSystem`.
 * "Is this a directory" is decided by whether `readDirectory` returns
 * successfully; non-directory entries are silently ignored.
 */

import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import { type ExtensionType, decodeExtensionNameSync } from "../../../extensions/common.js";
import { decodeHandleSync, type Handle } from "../../../extensions/handle.js";
import { makeAbsolutePath } from "../../../utils/path-types.js";
import { AXM_DIR_NAME } from "../../paths.js";
import type { Diagnostics } from "../diagnostics.js";
import type { Scope } from "../types.js";
import {
  childEntries,
  fileExists,
  filterDirectories,
  splitAbsolutePathSegments,
} from "./fs-helpers.js";
import type { CanonicalExtensionOccurrence } from "./types.js";

const SCANNER_NAME = "canonical-extensions";

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface CanonicalExtensionsScannerDeps {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly workspaceRoot: string;
  readonly scope: Scope;
  readonly diagnostics: Diagnostics;
}

/**
 * Closure helper: returns the dependency-closed scanner effect.
 */
export const makeCanonicalExtensionsScanner = (
  deps: CanonicalExtensionsScannerDeps,
): Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>> => scanCanonicalExtensions(deps);

// ---------------------------------------------------------------------------
// Subject file mapping
// ---------------------------------------------------------------------------

/**
 * Map an extension type + name to the canonical primary content file name
 * inside the subject's directory, when the subject has one. Subject types
 * without a fixed primary file return `null`.
 *
 * - `skill` → `SKILL.md` (fixed)
 * - `command` → `${name}.md` (e.g., `review-pr.md`)
 * - `subagent` → `${name}.md` (e.g., `code-reviewer.md`)
 */
const subjectFileNameFor = (type: ExtensionType, name: string): string | null => {
  switch (type) {
    case "skill":
      return "SKILL.md";
    case "command":
    case "subagent":
      return `${name}.md`;
    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const EXTERNAL_OWNER_SEGMENT = "external";

const isOwnerSegment = (entry: string): boolean =>
  entry.length > 0 && entry !== EXTERNAL_OWNER_SEGMENT;

const extensionTypeFromLocalDir = (entry: string): ExtensionType | null => {
  switch (entry) {
    case "skills":
      return "skill";
    case "commands":
      return "command";
    case "mcps":
      return "mcp-server";
    case "subagents":
      return "subagent";
    case "files":
      return "files";
    case "rules":
      return "rule";
    case "hooks":
      return "hook";
    case "packs":
      return "pack";
    default:
      return null;
  }
};

/**
 * Build one occurrence record from a discovered subject directory. Probes
 * the canonical subject file (e.g., `SKILL.md`) when applicable.
 */
const buildOccurrence = (
  deps: CanonicalExtensionsScannerDeps,
  args: {
    readonly extensionType: ExtensionType;
    readonly origin: "canonical-axm" | "external-axm";
    readonly nameDir: string;
    readonly name?: string;
    readonly owner: Handle | null;
  },
): Effect.Effect<CanonicalExtensionOccurrence> =>
  Effect.gen(function* () {
    const { fs, path, scope, diagnostics } = deps;
    const resolvedName = args.name ?? path.basename(args.nameDir);
    const subjectFileName = subjectFileNameFor(args.extensionType, resolvedName);
    const subjectFile =
      subjectFileName === null
        ? Option.none()
        : Option.some(makeAbsolutePath(path, path.join(args.nameDir, subjectFileName)));
    const subjectFileExists = Option.isSome(subjectFile)
      ? yield* fileExists(SCANNER_NAME, fs, diagnostics, subjectFile.value)
      : false;
    const contentLocation = makeAbsolutePath(path, args.nameDir);
    const occurrence: CanonicalExtensionOccurrence = {
      _tag: "canonical-extension",
      scope,
      type: args.extensionType,
      origin: args.origin,
      name: decodeExtensionNameSync(resolvedName),
      owner: args.owner,
      contentLocation,
      pathSegments: splitAbsolutePathSegments(path, args.nameDir),
      subjectFile,
      subjectFileExists,
    };
    return occurrence;
  });

const scanCanonicalForOwner = (
  deps: CanonicalExtensionsScannerDeps,
  ownerDirAbsolute: string,
  ownerName: Handle,
): Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>> =>
  Effect.gen(function* () {
    const { fs, path, diagnostics } = deps;
    const typeCandidates = yield* childEntries(
      SCANNER_NAME,
      fs,
      diagnostics,
      path,
      ownerDirAbsolute,
    );
    const typeDirs = yield* filterDirectories(fs, typeCandidates);

    const occurrences = yield* Effect.forEach(
      typeDirs,
      (typeDirAbsolute) =>
        Effect.gen(function* () {
          const extensionType = extensionTypeFromLocalDir(path.basename(typeDirAbsolute));
          if (extensionType === null) {
            const empty: ReadonlyArray<CanonicalExtensionOccurrence> = [];
            return empty;
          }
          const packageChildCandidates = yield* childEntries(
            SCANNER_NAME,
            fs,
            diagnostics,
            path,
            typeDirAbsolute,
          );
          const packageDirs = yield* filterDirectories(fs, packageChildCandidates);
          const packageOccurrences = yield* Effect.forEach(
            packageDirs,
            (packageDir) =>
              Effect.gen(function* () {
                const nameDir =
                  extensionType === "pack" ? packageDir : path.join(packageDir, "src");
                const nameDirExists = yield* fs.readDirectory(nameDir).pipe(
                  Effect.as(true),
                  Effect.catch(() => Effect.succeed(false)),
                );
                if (!nameDirExists) {
                  const empty: ReadonlyArray<CanonicalExtensionOccurrence> = [];
                  return empty;
                }
                const occurrence = yield* buildOccurrence(deps, {
                  extensionType,
                  origin: "canonical-axm",
                  nameDir,
                  name: path.basename(packageDir),
                  owner: ownerName,
                });
                return [occurrence];
              }),
            { concurrency: "unbounded" },
          );
          return packageOccurrences.flat();
        }),
      { concurrency: "unbounded" },
    );
    return occurrences.flat();
  });

const scanExternal = (
  deps: CanonicalExtensionsScannerDeps,
  externalDirAbsolute: string,
): Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>> =>
  Effect.gen(function* () {
    const { fs, path, diagnostics } = deps;
    const typeCandidates = yield* childEntries(
      SCANNER_NAME,
      fs,
      diagnostics,
      path,
      externalDirAbsolute,
    );
    const typeDirs = yield* filterDirectories(fs, typeCandidates);

    const occurrences = yield* Effect.forEach(
      typeDirs,
      (typeDirAbsolute) =>
        Effect.gen(function* () {
          const extensionType = extensionTypeFromLocalDir(path.basename(typeDirAbsolute));
          if (extensionType === null) {
            const empty: ReadonlyArray<CanonicalExtensionOccurrence> = [];
            return empty;
          }
          const nameCandidates = yield* childEntries(
            SCANNER_NAME,
            fs,
            diagnostics,
            path,
            typeDirAbsolute,
          );
          const nameDirs = yield* filterDirectories(fs, nameCandidates);
          return yield* Effect.forEach(
            nameDirs,
            (nameDir) =>
              buildOccurrence(deps, {
                extensionType,
                origin: "external-axm",
                nameDir,
                owner: null,
              }),
            { concurrency: "unbounded" },
          );
        }),
      { concurrency: "unbounded" },
    );
    return occurrences.flat();
  });

// ---------------------------------------------------------------------------
// Scanner body
// ---------------------------------------------------------------------------

const scanCanonicalExtensions = Effect.fn("workspace.read-model.scanner.canonical-extensions")(
  function* (deps: CanonicalExtensionsScannerDeps) {
    const { fs, path, workspaceRoot, diagnostics } = deps;
    const extensionsRoot = path.join(workspaceRoot, AXM_DIR_NAME, "extensions");

    const ownerCandidates = yield* childEntries(
      SCANNER_NAME,
      fs,
      diagnostics,
      path,
      extensionsRoot,
    );
    const ownerDirs = yield* filterDirectories(fs, ownerCandidates);

    const occurrences = yield* Effect.forEach(
      ownerDirs,
      (ownerDir) => {
        const ownerName = path.basename(ownerDir);
        if (ownerName === EXTERNAL_OWNER_SEGMENT) {
          return scanExternal(deps, ownerDir);
        }
        if (!isOwnerSegment(ownerName)) {
          const empty: ReadonlyArray<CanonicalExtensionOccurrence> = [];
          return Effect.succeed(empty);
        }
        return scanCanonicalForOwner(deps, ownerDir, decodeHandleSync(ownerName));
      },
      { concurrency: "unbounded" },
    );

    return occurrences.flat();
  },
);
