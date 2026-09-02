/**
 * Fixture builder: synthesizes minimal workspace trees from declarative specs
 * against an in-memory `FileSystem` for tests.
 *
 * Phase 5 of the workspace read-model change. Downstream phases (scanners,
 * per-extension subject modules, the live `WorkspaceReadModel` service, and
 * golden-fixture scenario tests) call `buildFixture(spec)` to materialize a
 * minimal directory tree; named scenario constructors below provide the
 * canonical specs for the spec scenarios listed in `proposal.md`.
 *
 * Key design choices:
 *
 * - The builder operates on a self-contained in-memory `Map<string, string>`
 *   filesystem, exposed through `FileSystem.makeNoop`. No `node:fs` is used.
 *   Tests get deterministic, ordered file sets without touching disk.
 * - Path-escape attempts (entries containing `..` segments or absolute paths)
 *   fail the builder with `PathEscapeError`. This makes the upcoming
 *   Phase 9 `WorkspaceRootEscape` test a separate, deliberate scenario and
 *   eliminates the chance of a leaky test fixture corrupting the host fs.
 * - Settings and lockfile files are serialized through `JSON.stringify` and
 *   `YAML.stringify` respectively when their `_tag === "valid"`. For
 *   `byteCorrupt`, the literal bytes are written verbatim. For
 *   `schemaInvalid`, the JSON/YAML serialization of the spec object is
 *   written so the parser accepts it but the schema decoder rejects it.
 * - The builder NEVER constructs the live `WorkspaceReadModel` itself. The
 *   sibling `test-layer.ts` exposes a `WorkspaceReadModelTest` layer that
 *   composes the builder output with the real (Phase 9) Live layer; in
 *   Phase 5 it falls back to a `Layer.fail` placeholder.
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import YAML from "yaml";
import { AGENTS } from "@agentxm/extension-model/unstable/agents/registry";
import type { AgentId } from "@agentxm/extension-model/unstable/agents/types";
import type { Settings } from "../../../settings/schema.js";
import { makeAbsolutePath } from "@agentxm/extension-model/unstable/path-types";
import { resolveProjectWorkspaceLayout, resolveUserWorkspaceLayout } from "../../layout.js";

// ---------------------------------------------------------------------------
// Public spec shape
// ---------------------------------------------------------------------------

/**
 * A file-spec describes one workspace file. The four tags express the four
 * source-cell states that WorkspaceReadModel source loaders distinguish:
 * absent, valid (parses + decodes), byte-corrupt (parser rejects), and
 * schema-invalid (parser accepts but decoder rejects).
 */
export type FileSpec =
  | { readonly _tag: "absent" }
  | {
      readonly _tag: "valid";
      /**
       * Object content for files with a known structure (axm.json,
       * lockfile, .mcp.json). The builder serializes through `JSON.stringify`
       * for JSON files and `YAML.stringify` for YAML files. Pass a string
       * literal to bypass serialization.
       */
      readonly contents: object | string;
    }
  | { readonly _tag: "byteCorrupt"; readonly bytes: string }
  | {
      readonly _tag: "schemaInvalid";
      /**
       * Object content that serializes cleanly as JSON/YAML but fails the
       * relevant Schema decoder. The builder writes the serialized form so
       * `JSON.parse` / `YAML.parse` succeed.
       */
      readonly contents: object;
    };

/**
 * A tree of files. Keys are workspace-relative paths (no leading slash, no
 * `..` segments). Values are either the file's contents as a string (for
 * inline content) or a `FileSpec` discriminator (for absent/byte-corrupt/
 * schema-invalid).
 */
export type TreeFiles = Readonly<Record<string, string | FileSpec>>;

/**
 * Per-scope file specs. `settings` and `lockfile` are scoped settings/lockfile
 * files. `axmExtensions` synthesizes contents under the scope's
 * `agent_extensions/` directory.
 * `agentDirs` synthesizes per-agent rendered directories. `mcpJson` writes
 * `.mcp.json` at the workspace/user root. `agentSettings` writes per-agent
 * native settings files (e.g. `.claude/settings.json`).
 */
export interface ScopeFiles {
  readonly settings?: FileSpec;
  readonly lockfile?: FileSpec;
  readonly axmExtensions?: TreeFiles;
  readonly agentDirs?: Readonly<Record<string, TreeFiles>>;
  readonly mcpJson?: FileSpec;
  readonly agentSettings?: Readonly<Record<string, FileSpec>>;
}

/**
 * Top-level fixture spec. `workspaceRoot` is the project root; `userHome` is
 * the user-scope home directory (workspace state lives at
 * `${userHome}/.axm/workspace/`).
 */
export interface FixtureSpec {
  readonly workspaceRoot: string;
  readonly userHome: string;
  readonly project?: ScopeFiles;
  readonly user?: ScopeFiles;
}

/**
 * Test deps returned from `buildFixture(spec)`. Downstream layers consume
 * `fs` and `path` to satisfy the `FileSystem` and `Path` services. `files`
 * exposes the raw map for diagnostic snapshots (test-only).
 */
export interface FixtureTestDeps {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly files: ReadonlyMap<string, string>;
  readonly workspaceRoot: string;
  readonly userHome: string;
}

export const resolveFixtureProjectLayout = (deps: FixtureTestDeps, settings: Settings = {}) =>
  resolveProjectWorkspaceLayout(makeAbsolutePath(deps.path, deps.workspaceRoot), settings).pipe(
    Effect.provideService(FileSystem.FileSystem, deps.fs),
    Effect.provideService(Path.Path, deps.path),
  );

export const resolveFixtureUserLayout = (deps: FixtureTestDeps, settings: Settings = {}) =>
  resolveUserWorkspaceLayout(makeAbsolutePath(deps.path, deps.userHome), settings).pipe(
    Effect.provideService(Path.Path, deps.path),
  );

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Builder rejected an entry because the spec asked to write outside the
 * workspace/user-home root. Phase 9's `WorkspaceRootEscape` is a different
 * (Layer-level) error; this one is purely a fixture sanity check so tests
 * cannot accidentally clobber files outside the intended tree.
 */
export class PathEscapeError extends Data.TaggedError("PathEscapeError")<{
  readonly path: string;
  readonly reason: string;
}> {}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;

const stringifyJson = (value: object | string): string =>
  typeof value === "string" ? value : JSON.stringify(value);

const stringifyYaml = (value: object | string): string =>
  typeof value === "string" ? value : YAML.stringify(value);

const validateRelativePath = (
  relative: string,
  owner: string,
): Effect.Effect<void, PathEscapeError> =>
  Effect.suspend(() => {
    if (relative.length === 0) {
      return Effect.fail(
        new PathEscapeError({
          path: relative,
          reason: `${owner} entry path is empty`,
        }),
      );
    }
    if (relative.startsWith("/")) {
      return Effect.fail(
        new PathEscapeError({
          path: relative,
          reason: `${owner} entry must be a workspace-relative path; absolute paths are rejected`,
        }),
      );
    }
    const segments = relative.split("/");
    for (const segment of segments) {
      if (segment === "..") {
        return Effect.fail(
          new PathEscapeError({
            path: relative,
            reason: `${owner} entry contains a ".." segment, which would escape the synthesized root`,
          }),
        );
      }
    }
    return Effect.void;
  });

/**
 * Resolve an agent's content root directory (e.g., `.claude` for `claude-code`).
 *
 * The agent registry exposes per-subject directories like `.claude/skills`;
 * the builder writes the entire `agentDirs[agentId]` tree under the agent's
 * root, which is the first segment of any of those paths. If the agent is
 * not registered, the builder falls back to `.<agentId>` so callers can
 * still synthesize directories for hypothetical agents.
 */
const resolveAgentContentRoot = (agentId: string): string => {
  const isKnown = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);
  if (!isKnown(agentId)) return `.${agentId}`;
  const descriptor = AGENTS[agentId];
  const skillsDir = descriptor.skills?.dir;
  if (skillsDir === undefined) return descriptor.rootDir ?? `.${agentId}`;
  const firstSegment = skillsDir.split("/")[0];
  return firstSegment !== undefined && firstSegment.length > 0 ? firstSegment : `.${agentId}`;
};

const resolveAgentSettingsRoot = (agentId: string): string => {
  const isKnown = (id: string): id is AgentId => Object.hasOwn(AGENTS, id);
  if (!isKnown(agentId)) return `.${agentId}`;
  const descriptor = AGENTS[agentId];
  if (typeof descriptor.rootDir === "string") return descriptor.rootDir;
  return resolveAgentContentRoot(agentId);
};

const join = (...parts: ReadonlyArray<string>): string => {
  const normalized: Array<string> = [];
  for (const p of parts) {
    if (p.length === 0) continue;
    if (p === "/") {
      normalized.push("");
      continue;
    }
    normalized.push(p.endsWith("/") ? p.slice(0, -1) : p);
  }
  return normalized.join("/");
};

// ---------------------------------------------------------------------------
// In-memory FileSystem
// ---------------------------------------------------------------------------

const notFound = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: "NotFound",
    module: "FileSystem",
    method,
    description: "No such file or directory",
    pathOrDescriptor: path,
  });

const makeInMemoryFs = (files: ReadonlyMap<string, string>): FileSystem.FileSystem => {
  const directorySet = new Set<string>();
  const encoder = new TextEncoder();
  for (const filePath of files.keys()) {
    const segments = filePath.split("/");
    for (let i = 1; i < segments.length; i += 1) {
      const dir = segments.slice(0, i).join("/");
      if (dir.length > 0) directorySet.add(dir);
    }
  }
  return FileSystem.makeNoop({
    exists: (path) =>
      Effect.sync(() => {
        if (files.has(path)) return true;
        if (directorySet.has(path)) return true;
        return false;
      }),
    readFileString: (path) => {
      const value = files.get(path);
      if (value === undefined) {
        return Effect.fail(notFound("readFileString", path));
      }
      return Effect.succeed(value);
    },
    readFile: (path) => {
      const value = files.get(path);
      if (value === undefined) {
        return Effect.fail(notFound("readFile", path));
      }
      return Effect.succeed(encoder.encode(value));
    },
    readDirectory: (path) => {
      if (!directorySet.has(path)) {
        return Effect.fail(notFound("readDirectory", path));
      }
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const entries = new Set<string>();
      for (const filePath of files.keys()) {
        if (!filePath.startsWith(prefix)) continue;
        const remainder = filePath.slice(prefix.length);
        const head = remainder.split("/")[0];
        if (head !== undefined && head.length > 0) entries.add(head);
      }
      for (const dir of directorySet) {
        if (!dir.startsWith(prefix)) continue;
        const remainder = dir.slice(prefix.length);
        const head = remainder.split("/")[0];
        if (head !== undefined && head.length > 0) entries.add(head);
      }
      return Effect.succeed(Array.from(entries).sort());
    },
    // Minimal `stat` for callers that probe entry kind. Returns `File` for a
    // path tracked in the files map, `Directory` for a synthesized directory,
    // and fails with NotFound otherwise. Only `type` is meaningful — the
    // remaining fields keep the `FileSystem.File.Info` shape happy.
    stat: (path) => {
      if (files.has(path)) {
        return Effect.succeed({
          type: "File",
          mtime: Option.none(),
          atime: Option.none(),
          birthtime: Option.none(),
          dev: 0,
          ino: Option.none(),
          mode: 0,
          nlink: Option.none(),
          uid: Option.none(),
          gid: Option.none(),
          rdev: Option.none(),
          size: FileSystem.Size(0),
          blksize: Option.none(),
          blocks: Option.none(),
        } satisfies FileSystem.File.Info);
      }
      if (directorySet.has(path)) {
        return Effect.succeed({
          type: "Directory",
          mtime: Option.none(),
          atime: Option.none(),
          birthtime: Option.none(),
          dev: 0,
          ino: Option.none(),
          mode: 0,
          nlink: Option.none(),
          uid: Option.none(),
          gid: Option.none(),
          rdev: Option.none(),
          size: FileSystem.Size(0),
          blksize: Option.none(),
          blocks: Option.none(),
        } satisfies FileSystem.File.Info);
      }
      return Effect.fail(notFound("stat", path));
    },
  });
};

// ---------------------------------------------------------------------------
// Spec → file map
// ---------------------------------------------------------------------------

const writeFileSpec = (
  files: Map<string, string>,
  absolutePath: string,
  spec: FileSpec,
  format: "json" | "yaml",
): void => {
  switch (spec._tag) {
    case "absent": {
      // No-op: the file is intentionally absent.
      return;
    }
    case "valid": {
      const serialized =
        format === "json" ? stringifyJson(spec.contents) : stringifyYaml(spec.contents);
      files.set(absolutePath, serialized);
      return;
    }
    case "byteCorrupt": {
      files.set(absolutePath, spec.bytes);
      return;
    }
    case "schemaInvalid": {
      // Use the format's serializer so the parser succeeds but the decoder
      // rejects.
      const serialized =
        format === "json" ? stringifyJson(spec.contents) : stringifyYaml(spec.contents);
      files.set(absolutePath, serialized);
      return;
    }
  }
};

const writeTree = (
  files: Map<string, string>,
  baseAbsolute: string,
  tree: TreeFiles,
  ownerLabel: string,
): Effect.Effect<void, PathEscapeError> =>
  Effect.gen(function* () {
    for (const [relative, value] of Object.entries(tree)) {
      yield* validateRelativePath(relative, ownerLabel);
      const absolute = join(baseAbsolute, relative);
      if (typeof value === "string") {
        files.set(absolute, value);
        continue;
      }
      // Determine format heuristically from the file extension; default to
      // JSON because tree files we've seen so far are markdown / JSON / plain
      // text.
      const lower = relative.toLowerCase();
      const format: "json" | "yaml" =
        lower.endsWith(".yaml") || lower.endsWith(".yml") ? "yaml" : "json";
      // For tree-level FileSpecs, "valid" with a string maps to literal
      // bytes; with an object we fall back to JSON serialization.
      writeFileSpec(files, absolute, value, format);
    }
  });

const writeScope = (
  files: Map<string, string>,
  scope: ScopeFiles | undefined,
  scopeRoot: string,
  options: { readonly scope: "project" | "user"; readonly includeLockfile: boolean },
): Effect.Effect<void, PathEscapeError> =>
  Effect.gen(function* () {
    if (scope === undefined) return;

    const stateRoot =
      options.scope === "project" ? scopeRoot : join(scopeRoot, ".axm", "workspace");
    const settingsPath =
      options.scope === "project" ? join(scopeRoot, "axm.json") : join(stateRoot, "axm.json");
    const lockfilePath = options.includeLockfile
      ? options.scope === "project"
        ? join(scopeRoot, "axm-lock.yaml")
        : join(stateRoot, "axm-lock.yaml")
      : null;
    const mcpJsonPath = join(scopeRoot, ".mcp.json");

    if (scope.settings !== undefined) {
      writeFileSpec(files, settingsPath, scope.settings, "json");
    }
    if (scope.lockfile !== undefined && lockfilePath !== null) {
      writeFileSpec(files, lockfilePath, scope.lockfile, "yaml");
    }
    if (scope.axmExtensions !== undefined) {
      yield* writeTree(
        files,
        options.scope === "project"
          ? join(scopeRoot, "agent_extensions")
          : join(scopeRoot, ".axm", "workspace", "agent_extensions"),
        scope.axmExtensions,
        "axmExtensions",
      );
    }
    if (scope.agentDirs !== undefined) {
      for (const [agentId, tree] of Object.entries(scope.agentDirs)) {
        const agentRoot = resolveAgentContentRoot(agentId);
        yield* writeTree(files, join(scopeRoot, agentRoot), tree, `agentDirs[${agentId}]`);
      }
    }
    if (scope.mcpJson !== undefined) {
      writeFileSpec(files, mcpJsonPath, scope.mcpJson, "json");
    }
    if (scope.agentSettings !== undefined) {
      for (const [agentId, fileSpec] of Object.entries(scope.agentSettings)) {
        const agentRoot = resolveAgentSettingsRoot(agentId);
        const agentSettingsPath = join(scopeRoot, agentRoot, "settings.json");
        writeFileSpec(files, agentSettingsPath, fileSpec, "json");
      }
    }
  });

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

/**
 * Build a fixture against an in-memory FileSystem.
 *
 * The returned `FixtureTestDeps` value is a stable, dependency-closed value:
 * it carries the synthesized `FileSystem`, a `Path.Path` value, and the
 * raw file map. Downstream test layers compose these with the real Live
 * implementations.
 *
 * Failures: the builder fails with `PathEscapeError` when any tree entry
 * contains a `..` segment or an absolute path. Phase 9's
 * `WorkspaceRootEscape` is a different (Layer-construction) failure.
 */
export const buildFixture = (spec: FixtureSpec): Effect.Effect<FixtureTestDeps, PathEscapeError> =>
  Effect.gen(function* () {
    const files = new Map<string, string>();

    yield* writeScope(files, spec.project, spec.workspaceRoot, {
      scope: "project",
      includeLockfile: true,
    });
    yield* writeScope(files, spec.user, join(spec.userHome), {
      scope: "user",
      includeLockfile: true,
    });

    const fs = makeInMemoryFs(files);
    const path = yield* Path.Path;

    return {
      fs,
      path,
      files,
      workspaceRoot: spec.workspaceRoot,
      userHome: spec.userHome,
    } satisfies FixtureTestDeps;
  }).pipe(Effect.provide(Path.layer));

// ---------------------------------------------------------------------------
// Named scenario constructors
// ---------------------------------------------------------------------------

const validSettingsContents = {
  owner: "@team",
  agents: ["claude-code"],
  skills: { "managed-tool": { source: "github:owner/repo", enabled: true } },
};

const validLockfileContents = {
  lockfileVersion: 7,
  skills: {
    "managed-tool": {
      type: "github",
      sourceType: "github",
      sourceName: "github",
      endpoint: "https://github.com",
      extensionType: "skill",
      workspaceName: "managed-tool",
      packageFormat: "agentxm",
      packageOwner: "@owner",
      packageName: "managed-tool",
      owner: "owner",
      repo: "repo",
      ref: "main",
      resolvedCommit: "commit-1",
      resolvedTree: "tree-1",
      contentIdentity: "content-1",
      treeIntegrity: `sha256-tree-v1:${"0".repeat(64)}`,
    },
  },
};

/**
 * No source files materialize. Both scopes return absent for every cell.
 */
export const absentAll = (workspaceRoot: string, userHome: string): FixtureSpec => ({
  workspaceRoot,
  userHome,
  project: { settings: { _tag: "absent" }, lockfile: { _tag: "absent" } },
  user: { settings: { _tag: "absent" } },
});

/**
 * Both project sources present and decodable; user scope settings present.
 */
export const validAll = (workspaceRoot: string, userHome: string): FixtureSpec => ({
  workspaceRoot,
  userHome,
  project: {
    settings: { _tag: "valid", contents: validSettingsContents },
    lockfile: { _tag: "valid", contents: validLockfileContents },
  },
  user: {
    settings: { _tag: "valid", contents: { owner: "@user" } },
  },
});

/**
 * Settings is valid; the lockfile is byte-corrupt.
 */
export const lockfileInvalidOnly = (workspaceRoot: string, userHome: string): FixtureSpec => ({
  workspaceRoot,
  userHome,
  project: {
    settings: { _tag: "valid", contents: validSettingsContents },
    lockfile: {
      _tag: "byteCorrupt",
      bytes: "skills:\n  - bad\n - mismatched: indent\n   bad: !!!@@@",
    },
  },
});

/**
 * Lockfile is valid; settings is byte-corrupt.
 */
export const settingsInvalidOnly = (workspaceRoot: string, userHome: string): FixtureSpec => ({
  workspaceRoot,
  userHome,
  project: {
    settings: { _tag: "byteCorrupt", bytes: "{ this is not json" },
    lockfile: { _tag: "valid", contents: validLockfileContents },
  },
});

/**
 * Both project sources are byte-corrupt.
 */
export const bothInvalid = (workspaceRoot: string, userHome: string): FixtureSpec => ({
  workspaceRoot,
  userHome,
  project: {
    settings: { _tag: "byteCorrupt", bytes: "{ this is not json" },
    lockfile: { _tag: "byteCorrupt", bytes: "lockfile: [bogus" },
  },
});

/**
 * Project state present; user scope absent.
 */
export const projectOnly = (workspaceRoot: string, userHome: string): FixtureSpec => ({
  workspaceRoot,
  userHome,
  project: {
    settings: { _tag: "valid", contents: validSettingsContents },
    lockfile: { _tag: "valid", contents: validLockfileContents },
  },
  user: { settings: { _tag: "absent" } },
});

/**
 * User scope settings present; project state absent.
 */
export const userOnly = (workspaceRoot: string, userHome: string): FixtureSpec => ({
  workspaceRoot,
  userHome,
  project: { settings: { _tag: "absent" }, lockfile: { _tag: "absent" } },
  user: { settings: { _tag: "valid", contents: { owner: "@user" } } },
});

/**
 * Both scopes declare a source-host with the same name. Phase 9 verifies that
 * the WorkspaceReadModel exposes both scope reads independently and does not
 * implicitly merge them.
 */
export const projectUserShadowing = (workspaceRoot: string, userHome: string): FixtureSpec => ({
  workspaceRoot,
  userHome,
  project: {
    settings: {
      _tag: "valid",
      contents: {
        owner: "@team",
        sources: [{ name: "shared", type: "github", url: "https://github.com/team" }],
      },
    },
  },
  user: {
    settings: {
      _tag: "valid",
      contents: {
        owner: "@user",
        sources: [{ name: "shared", type: "github", url: "https://github.com/user" }],
      },
    },
  },
});

/**
 * Agent dir exists on disk but settings does not declare the agent. Phase 9
 * verifies the `agents.detected` projection surfaces a mismatch.
 */
export const agentPresentNoDeclaration = (
  workspaceRoot: string,
  userHome: string,
): FixtureSpec => ({
  workspaceRoot,
  userHome,
  project: {
    settings: { _tag: "valid", contents: { owner: "@team" } },
    agentDirs: {
      "claude-code": {
        "skills/some-skill/SKILL.md": "# some-skill\n",
      },
    },
  },
});

/**
 * Settings declares an agent whose directory does not exist.
 */
export const agentDeclaredNotInstalled = (
  workspaceRoot: string,
  userHome: string,
): FixtureSpec => ({
  workspaceRoot,
  userHome,
  project: {
    settings: {
      _tag: "valid",
      contents: { owner: "@team", agents: ["claude-code"] },
    },
  },
});

/**
 * Settings disagrees with `.mcp.json`: the keys differ between the two
 * surfaces. Phase 9 verifies the MCP-server projection exposes both views
 * without silently reconciling them.
 */
export const mcpConfigDrift = (workspaceRoot: string, userHome: string): FixtureSpec => ({
  workspaceRoot,
  userHome,
  project: {
    settings: {
      _tag: "valid",
      contents: {
        owner: "@team",
        mcpServers: { declared: { source: "github:owner/repo" } },
      },
    },
    mcpJson: {
      _tag: "valid",
      contents: { mcpServers: { drifted: { command: "echo" } } },
    },
  },
});

/**
 * Same skill name across agent skill dirs (`.claude/skills/`, `.agents/skills/`)
 * and canonical AXM storage.
 */
export const sameNameAcrossOrigins = (workspaceRoot: string, userHome: string): FixtureSpec => ({
  workspaceRoot,
  userHome,
  project: {
    agentDirs: {
      "claude-code": {
        "skills/some-skill/SKILL.md": "# claude-code\n",
      },
      codex: {
        "skills/some-skill/SKILL.md": "# codex\n",
      },
    },
    axmExtensions: {
      "agentxm/@owner/skills/some-skill/skill.json": JSON.stringify({
        owner: "@owner",
        type: "skill",
        name: "some-skill",
        version: "1.0.0",
      }),
      "agentxm/@owner/skills/some-skill/src/SKILL.md":
        "---\nname: some-skill\ndescription: Canonical\n---\n# canonical\n",
    },
  },
});

/**
 * Spec containing a `..` segment so callers can verify the builder rejects it.
 * The fixture intentionally returns an unbuildable spec; consumers invoke
 * `buildFixture` to assert the rejection path.
 */
export const pathEscapeAttempt = (workspaceRoot: string, userHome: string): FixtureSpec => ({
  workspaceRoot,
  userHome,
  project: {
    axmExtensions: {
      "../../etc/passwd": "evil\n",
    },
  },
});

// Keep `isObject` available for downstream phases that need the same guard.
void isObject;
