/**
 * Canonical-extensions scanner: enumerates authored project type roots and
 * source-qualified acquired packages beneath `agent_extensions/` or the
 * corresponding user-scope `agent_extensions/` root.
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
import * as Schema from "effect/Schema";
import {
  type ExtensionType,
  decodeExtensionNameSync,
  ExtensionNameSchema,
  ExtensionTypeSchema,
} from "../../../extensions/common.js";
import { HandleSchema, type Handle } from "../../../extensions/handle.js";
import { MANIFEST_FILENAME_BY_TYPE } from "../../../publish/manifest-policy.js";
import { parseSkillMd } from "../../../skills/skill-content.js";
import { DISCOVERY_SKIPPED_DIRECTORIES } from "../../../extensions/discovery-walk.js";
import { makeAbsolutePath } from "../../../utils/path-types.js";
import type { Diagnostics } from "../diagnostics.js";
import type { WorkspaceLayout } from "../../layout.js";
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
  readonly diagnostics: Diagnostics;
  readonly layout: WorkspaceLayout;
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
 * - `subagent` → `${name}.md` (e.g., `code-reviewer.md`)
 */
const subjectFileNameFor = (type: ExtensionType, name: string): string | null => {
  switch (type) {
    case "skill":
      return "SKILL.md";
    case "subagent":
      return `${name}.md`;
    default:
      return null;
  }
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
    const { fs, path, layout, diagnostics } = deps;
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
      scope: layout.scope,
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

const manifestFilenames = new Set<string>(Object.values(MANIFEST_FILENAME_BY_TYPE));

const ScannableManifestIdentitySchema = Schema.Struct({
  owner: HandleSchema,
  type: ExtensionTypeSchema,
  name: ExtensionNameSchema,
});

interface ScannableManifestIdentity {
  readonly owner: Handle | null;
  readonly type: ExtensionType;
  readonly name: ReturnType<typeof decodeExtensionNameSync>;
}

const extensionTypeForManifest = (filename: string): ExtensionType | undefined => {
  switch (filename) {
    case "skill.json":
      return "skill";
    case "mcp.json":
      return "mcp-server";
    case "subagent.json":
      return "subagent";
    case "rule.json":
      return "rule";
    case "hook.json":
      return "hook";
    case "knowledge.json":
      return "knowledge";
    case "pack.json":
      return "pack";
    default:
      return undefined;
  }
};

const readNativeIdentity = (
  deps: CanonicalExtensionsScannerDeps,
  dir: string,
  entries: ReadonlyArray<string>,
): Effect.Effect<Option.Option<ScannableManifestIdentity>> =>
  Effect.gen(function* () {
    const filename = entries.find((entry) => manifestFilenames.has(entry));
    if (filename === undefined) return Option.none();
    const filenameType = extensionTypeForManifest(filename);
    if (filenameType === undefined) return Option.none();
    const raw = yield* deps.fs.readFileString(deps.path.join(dir, filename)).pipe(Effect.option);
    if (Option.isNone(raw)) {
      return Option.some({
        type: filenameType,
        name: decodeExtensionNameSync(deps.path.basename(dir)),
        owner: null,
      });
    }
    const identity = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(ScannableManifestIdentitySchema),
    )(raw.value).pipe(Effect.option);
    if (Option.isNone(identity) || MANIFEST_FILENAME_BY_TYPE[identity.value.type] !== filename) {
      return Option.some({
        type: filenameType,
        name: decodeExtensionNameSync(deps.path.basename(dir)),
        owner: null,
      });
    }
    return identity;
  });

const scanAcquiredDirectory = (
  deps: CanonicalExtensionsScannerDeps,
  dir: string,
): Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>> =>
  Effect.gen(function* () {
    const childPaths = yield* childEntries(SCANNER_NAME, deps.fs, deps.diagnostics, deps.path, dir);
    const entries = childPaths.map((childPath) => deps.path.basename(childPath));

    const nativeIdentity = yield* readNativeIdentity(deps, dir, entries);
    if (Option.isSome(nativeIdentity)) {
      const identity = nativeIdentity.value;
      const contentDir =
        identity.type === "pack" || identity.type === "mcp-server"
          ? dir
          : deps.path.join(dir, "src");
      const contentDirExists = yield* deps.fs.readDirectory(contentDir).pipe(
        Effect.as(true),
        Effect.catch(() => Effect.succeed(false)),
      );
      if (!contentDirExists) return [];
      return [
        yield* buildOccurrence(deps, {
          extensionType: identity.type,
          origin: "canonical-axm",
          nameDir: contentDir,
          name: identity.name,
          owner: identity.owner,
        }),
      ];
    }

    if (entries.includes("SKILL.md")) {
      const raw = yield* deps.fs
        .readFileString(deps.path.join(dir, "SKILL.md"))
        .pipe(Effect.option);
      const parsed = Option.flatMap(raw, (content) =>
        parseSkillMd(content, deps.path.basename(dir)),
      );
      if (Option.isSome(parsed)) {
        return [
          yield* buildOccurrence(deps, {
            extensionType: "skill",
            origin: "external-axm",
            nameDir: dir,
            name: parsed.value.name,
            owner: null,
          }),
        ];
      }
    }

    const childCandidates = entries
      .filter((entry) => !DISCOVERY_SKIPPED_DIRECTORIES.has(entry))
      .map((entry) => deps.path.join(dir, entry));
    const childDirs = yield* filterDirectories(deps.fs, childCandidates);
    const nested = yield* Effect.forEach(
      childDirs,
      (childDir) => scanAcquiredDirectory(deps, childDir),
      { concurrency: "unbounded" },
    );
    return nested.flat();
  });

const authoredTypeDirectories: ReadonlyArray<{
  readonly type: ExtensionType;
  readonly localDir: string;
}> = [
  { type: "skill", localDir: "skills" },
  { type: "mcp-server", localDir: "mcps" },
  { type: "subagent", localDir: "subagents" },
  { type: "rule", localDir: "rules" },
  { type: "hook", localDir: "hooks" },
  { type: "knowledge", localDir: "knowledge" },
  { type: "pack", localDir: "packs" },
];

const scanAuthoredType = (
  deps: CanonicalExtensionsScannerDeps,
  extensionType: ExtensionType,
): Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>> =>
  Effect.gen(function* () {
    if (deps.layout.scope !== "project" || deps.layout.owner === undefined) return [];
    const root = deps.layout.authoredRoot(extensionType);
    const packageCandidates = yield* childEntries(
      SCANNER_NAME,
      deps.fs,
      deps.diagnostics,
      deps.path,
      root,
    );
    const packageDirs = yield* filterDirectories(deps.fs, packageCandidates);
    const occurrences = yield* Effect.forEach(
      packageDirs,
      (packageDir) => {
        const nameDir =
          extensionType === "pack" || extensionType === "mcp-server"
            ? packageDir
            : deps.path.join(packageDir, "src");
        return deps.fs.readDirectory(nameDir).pipe(
          Effect.flatMap(() =>
            buildOccurrence(deps, {
              extensionType,
              origin: "canonical-axm",
              nameDir,
              name: deps.path.basename(packageDir),
              owner: deps.layout.scope === "project" ? (deps.layout.owner ?? null) : null,
            }),
          ),
          Effect.map((occurrence): ReadonlyArray<CanonicalExtensionOccurrence> => [occurrence]),
          Effect.catch(() => Effect.succeed([])),
        );
      },
      { concurrency: "unbounded" },
    );
    return occurrences.flat();
  });

// ---------------------------------------------------------------------------
// Scanner body
// ---------------------------------------------------------------------------

const scanCanonicalExtensions = Effect.fn("workspace.read-model.scanner.canonical-extensions")(
  function* (deps: CanonicalExtensionsScannerDeps) {
    const { layout } = deps;
    const extensionsRoot = layout.acquiredRoot;

    const acquired = yield* scanAcquiredDirectory(deps, extensionsRoot);
    if (layout.scope !== "project") return acquired;
    const authored = yield* Effect.forEach(
      authoredTypeDirectories,
      ({ type }) => scanAuthoredType(deps, type),
      { concurrency: "unbounded" },
    );
    return [...acquired, ...authored.flat()];
  },
);
