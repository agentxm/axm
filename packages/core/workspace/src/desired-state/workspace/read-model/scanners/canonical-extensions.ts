/**
 * Canonical-extensions scanner: enumerates authored project type roots and
 * identity-qualified acquired packages beneath `agent_extensions/` or the
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
 * - workspace-root path-escape is checked at provider construction (Phase 9),
 *   not inside the scanner.
 *
 * Directory metadata classifies candidates without enumerating them twice.
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
} from "@agentxm/extension-model/unstable/extensions/common";
import { HandleSchema, type Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import {
  extensionTypeForManifestFilename,
  MANIFEST_FILENAME_BY_TYPE,
  MANIFEST_FILENAMES,
} from "@agentxm/extension-content";
import { parseSkillMd } from "@agentxm/extension-content";
import { DISCOVERY_SKIPPED_DIRECTORIES } from "@agentxm/extension-model/unstable/discovery-walk";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import type { Diagnostics } from "../diagnostics.js";
import { isInstallRootStagingName } from "../../install-root.js";
import type { WorkspaceLayout } from "../../layout.js";
import {
  childEntries,
  directoryExists,
  fileExists,
  filterDirectories,
  readTextFile,
  SCANNER_IO_CONCURRENCY,
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

const readNativeIdentity = (
  deps: CanonicalExtensionsScannerDeps,
  dir: string,
  entries: ReadonlyArray<string>,
): Effect.Effect<Option.Option<ScannableManifestIdentity>> =>
  Effect.gen(function* () {
    const filename = entries.find((entry) => MANIFEST_FILENAMES.has(entry));
    if (filename === undefined) return Option.none();
    const filenameType = extensionTypeForManifestFilename(filename);
    if (filenameType === undefined) return Option.none();
    const raw = yield* readTextFile(
      SCANNER_NAME,
      deps.fs,
      deps.diagnostics,
      deps.path.join(dir, filename),
    );
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

const inspectAcquiredDirectory = (
  deps: CanonicalExtensionsScannerDeps,
  dir: string,
): Effect.Effect<{
  readonly occurrences: ReadonlyArray<CanonicalExtensionOccurrence>;
  readonly children: ReadonlyArray<string>;
}> =>
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
      const contentDirExists = yield* directoryExists(
        SCANNER_NAME,
        deps.fs,
        deps.diagnostics,
        contentDir,
      );
      if (!contentDirExists) return { occurrences: [], children: [] };
      return {
        children: [],
        occurrences: [
          yield* buildOccurrence(deps, {
            extensionType: identity.type,
            origin: "canonical-axm",
            nameDir: contentDir,
            name: identity.name,
            owner: identity.owner,
          }),
        ],
      };
    }

    if (entries.includes("SKILL.md")) {
      const raw = yield* readTextFile(
        SCANNER_NAME,
        deps.fs,
        deps.diagnostics,
        deps.path.join(dir, "SKILL.md"),
      );
      const parsed = Option.flatMap(raw, (content) =>
        parseSkillMd(content, deps.path.basename(dir)),
      );
      if (Option.isSome(parsed)) {
        return {
          children: [],
          occurrences: [
            yield* buildOccurrence(deps, {
              extensionType: "skill",
              origin: "external-axm",
              nameDir: dir,
              name: parsed.value.name,
              owner: null,
            }),
          ],
        };
      }
    }

    const childCandidates = entries
      .filter(
        (entry) => !DISCOVERY_SKIPPED_DIRECTORIES.has(entry) && !isInstallRootStagingName(entry),
      )
      .map((entry) => deps.path.join(dir, entry));
    // A frontier already admits sixteen directories; classification within
    // one directory stays serial instead of opening another fan-out level.
    const children = yield* filterDirectories(
      SCANNER_NAME,
      deps.fs,
      deps.diagnostics,
      childCandidates,
      1,
    );
    return { children, occurrences: [] };
  });

const scanAcquiredDirectory = (
  deps: CanonicalExtensionsScannerDeps,
  root: string,
): Effect.Effect<ReadonlyArray<CanonicalExtensionOccurrence>> =>
  Effect.gen(function* () {
    type Visit = { readonly directory: string; readonly position: ReadonlyArray<number> };
    let frontier: ReadonlyArray<Visit> = [{ directory: root, position: [] }];
    const found: Array<{
      readonly position: ReadonlyArray<number>;
      readonly occurrence: CanonicalExtensionOccurrence;
    }> = [];
    while (frontier.length > 0) {
      const observations = yield* Effect.forEach(
        frontier,
        ({ directory, position }) =>
          inspectAcquiredDirectory(deps, directory).pipe(
            Effect.map((observed) => ({ ...observed, position })),
          ),
        { concurrency: SCANNER_IO_CONCURRENCY },
      );
      frontier = observations.flatMap(({ children, occurrences, position }) => {
        for (const occurrence of occurrences) found.push({ position, occurrence });
        return children.map((directory, index) => ({ directory, position: [...position, index] }));
      });
    }
    // Frontier admission changes execution order, not the existing depth-first
    // observation order. Positions retain the filesystem's own sibling order.
    found.sort((left, right) => {
      for (let index = 0; index < Math.min(left.position.length, right.position.length); index++) {
        const difference = (left.position[index] ?? 0) - (right.position[index] ?? 0);
        if (difference !== 0) return difference;
      }
      return left.position.length - right.position.length;
    });
    return found.map(({ occurrence }) => occurrence);
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
    const packageDirs = yield* filterDirectories(
      SCANNER_NAME,
      deps.fs,
      deps.diagnostics,
      packageCandidates,
    );
    const occurrences = yield* Effect.forEach(
      packageDirs,
      (packageDir) =>
        Effect.gen(function* () {
          const nameDir =
            extensionType === "pack" || extensionType === "mcp-server"
              ? packageDir
              : deps.path.join(packageDir, "src");
          const present = yield* directoryExists(SCANNER_NAME, deps.fs, deps.diagnostics, nameDir);
          if (!present) return [];
          return [
            yield* buildOccurrence(deps, {
              extensionType,
              origin: "canonical-axm",
              nameDir,
              name: deps.path.basename(packageDir),
              owner: deps.layout.scope === "project" ? (deps.layout.owner ?? null) : null,
            }),
          ];
        }),
      { concurrency: SCANNER_IO_CONCURRENCY },
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
    const authored = yield* Effect.forEach(authoredTypeDirectories, ({ type }) =>
      scanAuthoredType(deps, type),
    );
    return [...acquired, ...authored.flat()];
  },
);
