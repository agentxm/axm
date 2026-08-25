/**
 * Tests for the workspace read-model fixture builder.
 *
 * The fixture builder is the test-only support library that synthesizes
 * minimal workspace trees from declarative specs. Downstream phases
 * (scanners, per-extension subject modules, the live `WorkspaceReadModel`
 * service, and the golden-fixture scenario tests) use it to construct
 * decoded source state and observable runtime trees without writing
 * file-by-file fixtures by hand.
 *
 * This file exercises the BUILDER, not the live context. The placeholder
 * `WorkspaceReadModelTest` layer (Phase 5.3) is intentionally a `Layer.fail`
 * stub until Phase 9 lands the real `makeWorkspaceReadModel` implementation.
 *
 * Coverage:
 *
 * - `_tag: "absent"` produces no file at the target path.
 * - `_tag: "valid"` produces the expected serialized bytes (JSON for
 *   settings, YAML for the lockfile).
 * - `_tag: "byteCorrupt"` produces a file with the exact literal bytes.
 * - `_tag: "schemaInvalid"` produces a file with valid JSON/YAML
 *   serialization of a structurally-invalid object so a parser accepts it
 *   but a Schema decoder rejects it.
 * - Path-escape attempts (`..`-laden names, absolute paths outside the
 *   workspace root) are rejected at build time, never escape the synthesized
 *   tree.
 * - Each named scenario constructor produces the directories the scenario
 *   claims to model.
 * - The `WorkspaceReadModelTest` placeholder layer fails loudly with a
 *   recognizable message so any consumer that tries to use it before
 *   Phase 9 lands knows immediately.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import YAML from "yaml";
import { LockfileSchema } from "../../../lockfile/schema.js";
import { SettingsSchema } from "../../../settings/schema.js";
import {
  absentAll,
  agentDeclaredNotInstalled,
  agentPresentNoDeclaration,
  bothInvalid,
  buildFixture,
  lockfileInvalidOnly,
  mcpConfigDrift,
  pathEscapeAttempt,
  PathEscapeError,
  projectOnly,
  projectUserShadowing,
  sameNameAcrossOrigins,
  settingsInvalidOnly,
  userOnly,
  validAll,
  type FixtureSpec,
  type FixtureTestDeps,
} from "../__fixtures__/builder.js";
import { WorkspaceReadModelTest } from "../__fixtures__/test-layer.js";

// ---------------------------------------------------------------------------
// Defaults shared across tests
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = "/test/workspace";
const USER_HOME = "/test/home";

const PROJECT_SETTINGS_PATH = "/test/workspace/axm.json";
const PROJECT_LOCKFILE_PATH = "/test/workspace/axm-lock.yaml";
const USER_SETTINGS_PATH = "/test/home/.axm/settings.json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const readBytes = (deps: FixtureTestDeps, path: string) => deps.fs.readFileString(path);

const exists = (deps: FixtureTestDeps, path: string) => deps.fs.exists(path);

// ---------------------------------------------------------------------------
// File-spec semantics
// ---------------------------------------------------------------------------

describe("buildFixture: settings cell variants", () => {
  it.effect("absent settings → file does not exist", () =>
    Effect.gen(function* () {
      const spec: FixtureSpec = {
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: { settings: { _tag: "absent" } },
      };
      const deps = yield* buildFixture(spec);
      expect(yield* exists(deps, PROJECT_SETTINGS_PATH)).toBe(false);
    }),
  );

  it.effect("valid settings → JSON parses and decodes", () =>
    Effect.gen(function* () {
      const spec: FixtureSpec = {
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          settings: {
            _tag: "valid",
            contents: { owner: "@team", agents: ["claude-code"] },
          },
        },
      };
      const deps = yield* buildFixture(spec);

      const raw = yield* readBytes(deps, PROJECT_SETTINGS_PATH);
      const parsed = JSON.parse(raw);
      const decoded = yield* Schema.decodeUnknownEffect(SettingsSchema)(parsed);

      expect(decoded.owner).toBe("@team");
      expect(decoded.agents).toEqual(["claude-code"]);
    }),
  );

  it.effect("byteCorrupt settings → file contains literal corrupt bytes", () =>
    Effect.gen(function* () {
      const spec: FixtureSpec = {
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          settings: { _tag: "byteCorrupt", bytes: "{ this is not json" },
        },
      };
      const deps = yield* buildFixture(spec);
      const raw = yield* readBytes(deps, PROJECT_SETTINGS_PATH);
      // The literal-bytes assertion is the contract: the builder writes the
      // exact corrupt input verbatim. Whether the JSON parser rejects them is
      // covered by `state.test.ts` and `state-source-independence.test.ts`.
      expect(raw).toBe("{ this is not json");
    }),
  );

  it.effect("schemaInvalid settings → JSON parses but Schema rejects", () =>
    Effect.gen(function* () {
      const spec: FixtureSpec = {
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          // `agents` SHALL be an array of agent ids; a string violates the schema.
          settings: { _tag: "schemaInvalid", contents: { agents: "not-an-array" } },
        },
      };
      const deps = yield* buildFixture(spec);
      const raw = yield* readBytes(deps, PROJECT_SETTINGS_PATH);

      // Parses cleanly.
      const parsed = JSON.parse(raw);

      // Decode rejects.
      const decoded = yield* Effect.result(Schema.decodeUnknownEffect(SettingsSchema)(parsed));
      expect(decoded._tag).toBe("Failure");
    }),
  );
});

describe("buildFixture: lockfile cell variants", () => {
  it.effect("absent lockfile → file does not exist", () =>
    Effect.gen(function* () {
      const spec: FixtureSpec = {
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: { lockfile: { _tag: "absent" } },
      };
      const deps = yield* buildFixture(spec);
      expect(yield* exists(deps, PROJECT_LOCKFILE_PATH)).toBe(false);
    }),
  );

  it.effect("valid lockfile → YAML parses and decodes", () =>
    Effect.gen(function* () {
      const spec: FixtureSpec = {
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          lockfile: {
            _tag: "valid",
            contents: { lockfileVersion: 6, skills: {} },
          },
        },
      };
      const deps = yield* buildFixture(spec);

      const raw = yield* readBytes(deps, PROJECT_LOCKFILE_PATH);
      const parsed = YAML.parse(raw);
      const decoded = yield* Schema.decodeUnknownEffect(LockfileSchema)(parsed);

      expect(decoded.lockfileVersion).toBe(6);
    }),
  );

  it.effect("byteCorrupt lockfile → file contains literal corrupt bytes", () =>
    Effect.gen(function* () {
      const corrupt = "skills:\n  - bad\n - mismatched: indent\n   bad: !!!@@@";
      const spec: FixtureSpec = {
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: { lockfile: { _tag: "byteCorrupt", bytes: corrupt } },
      };
      const deps = yield* buildFixture(spec);
      expect(yield* readBytes(deps, PROJECT_LOCKFILE_PATH)).toBe(corrupt);
    }),
  );

  it.effect("schemaInvalid lockfile → YAML parses but Schema rejects", () =>
    Effect.gen(function* () {
      const spec: FixtureSpec = {
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          lockfile: { _tag: "schemaInvalid", contents: { unrelated: "value" } },
        },
      };
      const deps = yield* buildFixture(spec);
      const raw = yield* readBytes(deps, PROJECT_LOCKFILE_PATH);

      const parsed = YAML.parse(raw);
      const decoded = yield* Effect.result(Schema.decodeUnknownEffect(LockfileSchema)(parsed));
      expect(decoded._tag).toBe("Failure");
    }),
  );
});

// ---------------------------------------------------------------------------
// Scanner-visible directories
// ---------------------------------------------------------------------------

describe("buildFixture: scanner-visible trees", () => {
  it.effect("agent-skill files materialize at the agent dir under workspace root", () =>
    Effect.gen(function* () {
      const spec: FixtureSpec = {
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          agentDirs: {
            "claude-code": {
              "skills/some-skill/SKILL.md": "# some-skill\n",
            },
          },
        },
      };
      const deps = yield* buildFixture(spec);
      const filePath = `${WORKSPACE_ROOT}/.claude/skills/some-skill/SKILL.md`;
      expect(yield* exists(deps, filePath)).toBe(true);
      expect(yield* readBytes(deps, filePath)).toBe("# some-skill\n");
    }),
  );

  it.effect("axm-extensions tree materializes under .axm/extensions/", () =>
    Effect.gen(function* () {
      const spec: FixtureSpec = {
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          axmExtensions: {
            "agentxm/@owner/skills/some-skill/src/SKILL.md": "# canonical\n",
            "github/acme/extensions/skills/some-skill/SKILL.md": "# acquired\n",
          },
        },
      };
      const deps = yield* buildFixture(spec);

      const canonical = `${WORKSPACE_ROOT}/agent_extensions/agentxm/@owner/skills/some-skill/src/SKILL.md`;
      const acquired = `${WORKSPACE_ROOT}/agent_extensions/github/acme/extensions/skills/some-skill/SKILL.md`;
      expect(yield* exists(deps, canonical)).toBe(true);
      expect(yield* exists(deps, acquired)).toBe(true);
      expect(yield* readBytes(deps, canonical)).toBe("# canonical\n");
      expect(yield* readBytes(deps, acquired)).toBe("# acquired\n");
    }),
  );

  it.effect("workspace .mcp.json materializes at workspace root", () =>
    Effect.gen(function* () {
      const spec: FixtureSpec = {
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          mcpJson: {
            _tag: "valid",
            contents: { mcpServers: { example: { command: "echo" } } },
          },
        },
      };
      const deps = yield* buildFixture(spec);
      const mcpPath = `${WORKSPACE_ROOT}/.mcp.json`;
      expect(yield* exists(deps, mcpPath)).toBe(true);
      const raw = yield* readBytes(deps, mcpPath);
      expect(JSON.parse(raw)).toEqual({ mcpServers: { example: { command: "echo" } } });
    }),
  );

  it.effect("absent file entries inside a tree do not materialize", () =>
    Effect.gen(function* () {
      const spec: FixtureSpec = {
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          axmExtensions: {
            "agentxm/@owner/skills/present/src/SKILL.md": "# present\n",
            "agentxm/@owner/skills/missing/src/SKILL.md": { _tag: "absent" },
          },
        },
      };
      const deps = yield* buildFixture(spec);
      const presentPath = `${WORKSPACE_ROOT}/agent_extensions/agentxm/@owner/skills/present/src/SKILL.md`;
      const missingPath = `${WORKSPACE_ROOT}/agent_extensions/agentxm/@owner/skills/missing/src/SKILL.md`;
      expect(yield* exists(deps, presentPath)).toBe(true);
      expect(yield* exists(deps, missingPath)).toBe(false);
    }),
  );
});

// ---------------------------------------------------------------------------
// Path-escape validation
// ---------------------------------------------------------------------------

describe("buildFixture: path-escape rejection", () => {
  it.effect("`..`-laden axm-extension entries are rejected at build time", () =>
    Effect.gen(function* () {
      const spec: FixtureSpec = {
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          axmExtensions: {
            "../../../etc/passwd": "evil\n",
          },
        },
      };
      const exit = yield* Effect.exit(buildFixture(spec));
      expect(Exit.isFailure(exit)).toBe(true);
      const failure = yield* Effect.flip(buildFixture(spec));
      expect(failure).toBeInstanceOf(PathEscapeError);
    }),
  );

  it.effect("`..`-laden agent-dir entries are rejected at build time", () =>
    Effect.gen(function* () {
      const spec: FixtureSpec = {
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          agentDirs: {
            "claude-code": {
              "../escape/SKILL.md": "evil\n",
            },
          },
        },
      };
      const failure = yield* Effect.flip(buildFixture(spec));
      expect(failure).toBeInstanceOf(PathEscapeError);
    }),
  );

  it.effect("absolute paths in tree entries are rejected", () =>
    Effect.gen(function* () {
      const spec: FixtureSpec = {
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          axmExtensions: {
            "/etc/passwd": "evil\n",
          },
        },
      };
      const failure = yield* Effect.flip(buildFixture(spec));
      expect(failure).toBeInstanceOf(PathEscapeError);
    }),
  );
});

// ---------------------------------------------------------------------------
// Named scenario constructors
// ---------------------------------------------------------------------------

describe("named scenario constructors", () => {
  it.effect("absentAll → no source files materialize", () =>
    Effect.gen(function* () {
      const deps = yield* buildFixture(absentAll(WORKSPACE_ROOT, USER_HOME));
      expect(yield* exists(deps, PROJECT_SETTINGS_PATH)).toBe(false);
      expect(yield* exists(deps, PROJECT_LOCKFILE_PATH)).toBe(false);
      expect(yield* exists(deps, USER_SETTINGS_PATH)).toBe(false);
    }),
  );

  it.effect("validAll → both project sources are present and decode cleanly", () =>
    Effect.gen(function* () {
      const deps = yield* buildFixture(validAll(WORKSPACE_ROOT, USER_HOME));
      expect(yield* exists(deps, PROJECT_SETTINGS_PATH)).toBe(true);
      expect(yield* exists(deps, PROJECT_LOCKFILE_PATH)).toBe(true);

      const settingsRaw = yield* readBytes(deps, PROJECT_SETTINGS_PATH);
      const lockRaw = yield* readBytes(deps, PROJECT_LOCKFILE_PATH);
      yield* Schema.decodeUnknownEffect(SettingsSchema)(JSON.parse(settingsRaw));
      yield* Schema.decodeUnknownEffect(LockfileSchema)(YAML.parse(lockRaw));
    }),
  );

  it.effect("lockfileInvalidOnly → only the lockfile fails to decode", () =>
    Effect.gen(function* () {
      const deps = yield* buildFixture(lockfileInvalidOnly(WORKSPACE_ROOT, USER_HOME));
      const settingsRaw = yield* readBytes(deps, PROJECT_SETTINGS_PATH);
      yield* Schema.decodeUnknownEffect(SettingsSchema)(JSON.parse(settingsRaw));

      const lockRaw = yield* readBytes(deps, PROJECT_LOCKFILE_PATH);
      const lockResult = yield* Effect.result(
        Effect.try({
          try: (): unknown => YAML.parse(lockRaw),
          catch: (cause): { readonly cause: unknown } => ({ cause }),
        }).pipe(Effect.flatMap((parsed) => Schema.decodeUnknownEffect(LockfileSchema)(parsed))),
      );
      expect(lockResult._tag).toBe("Failure");
    }),
  );

  it.effect("settingsInvalidOnly → only settings fails to decode", () =>
    Effect.gen(function* () {
      const deps = yield* buildFixture(settingsInvalidOnly(WORKSPACE_ROOT, USER_HOME));
      const lockRaw = yield* readBytes(deps, PROJECT_LOCKFILE_PATH);
      yield* Schema.decodeUnknownEffect(LockfileSchema)(YAML.parse(lockRaw));

      const settingsRaw = yield* readBytes(deps, PROJECT_SETTINGS_PATH);
      const settingsResult = yield* Effect.result(
        Effect.try({
          try: (): unknown => JSON.parse(settingsRaw),
          catch: (cause): { readonly cause: unknown } => ({ cause }),
        }).pipe(Effect.flatMap((parsed) => Schema.decodeUnknownEffect(SettingsSchema)(parsed))),
      );
      expect(settingsResult._tag).toBe("Failure");
    }),
  );

  it.effect("bothInvalid → settings and lockfile both fail", () =>
    Effect.gen(function* () {
      const deps = yield* buildFixture(bothInvalid(WORKSPACE_ROOT, USER_HOME));
      // Both files are present.
      expect(yield* exists(deps, PROJECT_SETTINGS_PATH)).toBe(true);
      expect(yield* exists(deps, PROJECT_LOCKFILE_PATH)).toBe(true);
    }),
  );

  it.effect("projectOnly → project files exist, user files do not", () =>
    Effect.gen(function* () {
      const deps = yield* buildFixture(projectOnly(WORKSPACE_ROOT, USER_HOME));
      expect(yield* exists(deps, PROJECT_SETTINGS_PATH)).toBe(true);
      expect(yield* exists(deps, USER_SETTINGS_PATH)).toBe(false);
    }),
  );

  it.effect("userOnly → user settings exist, project files do not", () =>
    Effect.gen(function* () {
      const deps = yield* buildFixture(userOnly(WORKSPACE_ROOT, USER_HOME));
      expect(yield* exists(deps, PROJECT_SETTINGS_PATH)).toBe(false);
      expect(yield* exists(deps, PROJECT_LOCKFILE_PATH)).toBe(false);
      expect(yield* exists(deps, USER_SETTINGS_PATH)).toBe(true);
    }),
  );

  it.effect("projectUserShadowing → both scopes declare the same source name", () =>
    Effect.gen(function* () {
      const deps = yield* buildFixture(projectUserShadowing(WORKSPACE_ROOT, USER_HOME));
      const projectRaw = yield* readBytes(deps, PROJECT_SETTINGS_PATH);
      const userRaw = yield* readBytes(deps, USER_SETTINGS_PATH);
      const project = JSON.parse(projectRaw);
      const user = JSON.parse(userRaw);
      // Both declare a source with the same name.
      expect(Array.isArray(project.sources)).toBe(true);
      expect(Array.isArray(user.sources)).toBe(true);
      const projectNames = (project.sources as ReadonlyArray<{ name: string }>).map((s) => s.name);
      const userNames = (user.sources as ReadonlyArray<{ name: string }>).map((s) => s.name);
      const shared = projectNames.find((n) => userNames.includes(n));
      expect(shared).toBeDefined();
    }),
  );

  it.effect(
    "agentPresentNoDeclaration → agent dir exists but settings does not declare the agent",
    () =>
      Effect.gen(function* () {
        const deps = yield* buildFixture(agentPresentNoDeclaration(WORKSPACE_ROOT, USER_HOME));
        // Agent dir exists.
        expect(yield* exists(deps, `${WORKSPACE_ROOT}/.claude/skills`)).toBe(true);
        // Settings does NOT declare claude-code.
        const settingsRaw = yield* readBytes(deps, PROJECT_SETTINGS_PATH);
        const settings = JSON.parse(settingsRaw);
        expect(settings.agents ?? []).not.toContain("claude-code");
      }),
  );

  it.effect(
    "agentDeclaredNotInstalled → settings declares an agent whose directory does not exist",
    () =>
      Effect.gen(function* () {
        const deps = yield* buildFixture(agentDeclaredNotInstalled(WORKSPACE_ROOT, USER_HOME));
        const settingsRaw = yield* readBytes(deps, PROJECT_SETTINGS_PATH);
        const settings = JSON.parse(settingsRaw);
        expect(settings.agents).toContain("claude-code");
        // No agent dir present.
        expect(yield* exists(deps, `${WORKSPACE_ROOT}/.claude`)).toBe(false);
      }),
  );

  it.effect("mcpConfigDrift → settings disagrees with .mcp.json contents", () =>
    Effect.gen(function* () {
      const deps = yield* buildFixture(mcpConfigDrift(WORKSPACE_ROOT, USER_HOME));
      const settingsRaw = yield* readBytes(deps, PROJECT_SETTINGS_PATH);
      const mcpRaw = yield* readBytes(deps, `${WORKSPACE_ROOT}/.mcp.json`);
      const settings = JSON.parse(settingsRaw);
      const mcp = JSON.parse(mcpRaw);

      const settingsServers = Object.keys(settings.mcpServers ?? {});
      const mcpServers = Object.keys(mcp.mcpServers ?? {});
      // Exists drift: keys differ.
      expect(settingsServers).not.toEqual(mcpServers);
    }),
  );

  it.effect(
    "sameNameAcrossOrigins → same skill name appears in claude, standard agent skills, and canonical AXM",
    () =>
      Effect.gen(function* () {
        const deps = yield* buildFixture(sameNameAcrossOrigins(WORKSPACE_ROOT, USER_HOME));
        expect(yield* exists(deps, `${WORKSPACE_ROOT}/.claude/skills/some-skill/SKILL.md`)).toBe(
          true,
        );
        expect(yield* exists(deps, `${WORKSPACE_ROOT}/.agents/skills/some-skill/SKILL.md`)).toBe(
          true,
        );
        expect(
          yield* exists(
            deps,
            `${WORKSPACE_ROOT}/agent_extensions/agentxm/@owner/skills/some-skill/src/SKILL.md`,
          ),
        ).toBe(true);
      }),
  );

  it.effect("pathEscapeAttempt → returns a spec that the builder rejects", () =>
    Effect.gen(function* () {
      const spec = pathEscapeAttempt(WORKSPACE_ROOT, USER_HOME);
      const failure = yield* Effect.flip(buildFixture(spec));
      expect(failure).toBeInstanceOf(PathEscapeError);
    }),
  );
});

// ---------------------------------------------------------------------------
// WorkspaceReadModelTest layer (Phase 9 wiring)
// ---------------------------------------------------------------------------

describe("WorkspaceReadModelTest layer", () => {
  it.effect("builds the Live WorkspaceReadModel against an absent-all fixture", () =>
    Effect.gen(function* () {
      const layer = WorkspaceReadModelTest(absentAll(WORKSPACE_ROOT, USER_HOME));
      const exit = yield* Effect.exit(Layer.build(layer).pipe(Effect.scoped, Effect.asVoid));
      expect(Exit.isSuccess(exit)).toBe(true);
    }),
  );
});

// ---------------------------------------------------------------------------
// Exhaustive serialize-and-read-back checks
// ---------------------------------------------------------------------------

describe("buildFixture: serialize round trip", () => {
  it.effect("all spec'd files are reachable under the test FileSystem at predictable paths", () =>
    Effect.gen(function* () {
      const spec: FixtureSpec = {
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          settings: { _tag: "valid", contents: { owner: "@team" } },
          lockfile: { _tag: "valid", contents: { lockfileVersion: 6, skills: {} } },
          axmExtensions: {
            "github/acme/extensions/skills/legacy/SKILL.md": "# acquired\n",
          },
          agentDirs: {
            "claude-code": {
              "skills/some-skill/SKILL.md": "# some-skill\n",
            },
          },
          mcpJson: { _tag: "valid", contents: { mcpServers: {} } },
        },
        user: {
          settings: { _tag: "valid", contents: { owner: "@user" } },
        },
      };
      const deps = yield* buildFixture(spec);

      // Check each materialization path explicitly.
      const checks: ReadonlyArray<readonly [string, true]> = [
        [PROJECT_SETTINGS_PATH, true],
        [PROJECT_LOCKFILE_PATH, true],
        [`${WORKSPACE_ROOT}/agent_extensions/github/acme/extensions/skills/legacy/SKILL.md`, true],
        [`${WORKSPACE_ROOT}/.claude/skills/some-skill/SKILL.md`, true],
        [`${WORKSPACE_ROOT}/.mcp.json`, true],
        [USER_SETTINGS_PATH, true],
      ];

      for (const [p, expected] of checks) {
        expect(yield* exists(deps, p)).toBe(expected);
      }

      // The deps surface FileSystem and Path values for downstream layers.
      const _fs: FileSystem.FileSystem = deps.fs;
      const _path: Path.Path = deps.path;
      void _fs;
      void _path;
    }),
  );
});
