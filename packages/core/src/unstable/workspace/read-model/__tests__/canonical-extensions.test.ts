/**
 * Canonical-extensions scanner: covers canonical AXM
 * (`.axm/extensions/<owner>/<type-plural>/src/<name>/`) and external AXM
 * (`.axm/extensions/external/<type-plural>/<name>/`) materializations across
 * all extension types.
 *
 * Each occurrence carries the scanner-tier origin (`canonical-axm` |
 * `external-axm`) plus the extension type discriminator. Phase 7's per-subject
 * modules map these into subject-specific origin unions.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { buildFixture, type FixtureSpec } from "../__fixtures__/builder.js";
import { makeDiagnostics, type Warning } from "../diagnostics.js";
import { makeCanonicalExtensionsScanner } from "../scanners/canonical-extensions.js";
import type { CanonicalExtensionOccurrence } from "../scanners/types.js";

const WORKSPACE_ROOT = "/ws";
const USER_HOME = "/home/user";

const provideDeps = (deps: { fs: FileSystem.FileSystem; path: Path.Path }) =>
  Layer.merge(Layer.succeed(FileSystem.FileSystem)(deps.fs), Layer.succeed(Path.Path)(deps.path));

const runScanner = (spec: FixtureSpec) =>
  Effect.gen(function* () {
    const deps = yield* buildFixture(spec);
    const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
    const diag = makeDiagnostics(ref);
    const occurrences = yield* makeCanonicalExtensionsScanner({
      fs: deps.fs,
      path: deps.path,
      workspaceRoot: spec.workspaceRoot,
      scope: "project",
      diagnostics: diag,
    });
    return { occurrences, warnings: yield* Ref.get(ref) };
  });

const sortByContent = (
  occurrences: ReadonlyArray<CanonicalExtensionOccurrence>,
): ReadonlyArray<CanonicalExtensionOccurrence> =>
  [...occurrences].sort((a, b) => a.contentLocation.localeCompare(b.contentLocation));

describe("canonical-extensions scanner", () => {
  it.effect("emits no occurrences when .axm/extensions is absent", () =>
    Effect.gen(function* () {
      const { occurrences, warnings } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {},
      });
      expect(occurrences).toEqual([]);
      expect(warnings).toEqual([]);
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("emits one canonical-axm occurrence per <owner>/<type>/src/<name>", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          axmExtensions: {
            "@owner/skills/src/some-skill/SKILL.md": "# canonical\n",
            "@owner/commands/src/some-command/some-command.md": "# command\n",
          },
        },
      });
      const sorted = sortByContent(occurrences);
      expect(sorted).toHaveLength(2);
      // Use `toMatchObject` so the new structural fields (`pathSegments`,
      // `subjectFile`, `subjectFileExists`) do not have to be re-stated here;
      // the scanner-occurrence-identity tests cover those fields.
      expect(sorted[0]).toMatchObject({
        _tag: "canonical-extension",
        scope: "project",
        type: "command",
        origin: "canonical-axm",
        name: "some-command",
        owner: "@owner",
        contentLocation: "/ws/.axm/extensions/@owner/commands/src/some-command",
      });
      expect(sorted[1]).toMatchObject({
        _tag: "canonical-extension",
        scope: "project",
        type: "skill",
        origin: "canonical-axm",
        name: "some-skill",
        owner: "@owner",
        contentLocation: "/ws/.axm/extensions/@owner/skills/src/some-skill",
      });
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("emits one external-axm occurrence per external/<type>/<name>", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          axmExtensions: {
            "external/skills/external-skill/SKILL.md": "# external\n",
            "external/mcp-servers/external-mcp/server.json": "{}",
          },
        },
      });
      const sorted = sortByContent(occurrences);
      expect(sorted).toHaveLength(2);
      expect(sorted.map((o) => o.origin)).toEqual(["external-axm", "external-axm"]);
      expect(sorted.map((o) => ({ type: o.type, name: o.name, owner: o.owner }))).toEqual([
        { type: "mcp-server", name: "external-mcp", owner: null },
        { type: "skill", name: "external-skill", owner: null },
      ]);
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("emits canonical and external occurrences for the same name as distinct entries", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          axmExtensions: {
            "@owner/skills/src/some-skill/SKILL.md": "# canonical\n",
            "external/skills/some-skill/SKILL.md": "# external\n",
          },
        },
      });
      const sorted = sortByContent(occurrences);
      expect(sorted).toHaveLength(2);
      expect(sorted.map((o) => o.origin).sort()).toEqual(["canonical-axm", "external-axm"]);
      // Distinct contentLocations → distinct entries.
      expect(new Set(sorted.map((o) => o.contentLocation)).size).toBe(2);
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("ignores non-extension type segments under canonical owners", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          axmExtensions: {
            "@owner/skills/src/some-skill/SKILL.md": "# ok\n",
            // "stuff" is not a local extension type directory; the scanner should skip it.
            "@owner/stuff/src/junk/file.txt": "junk",
          },
        },
      });
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0]?.type).toBe("skill");
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("covers all seven extension types under one owner", () =>
    Effect.gen(function* () {
      const types = [
        "skills",
        "commands",
        "mcp-servers",
        "subagents",
        "context",
        "rules",
        "packs",
      ] as const;
      const project: FixtureSpec["project"] = {
        axmExtensions: Object.fromEntries(
          types.map((t) => [`@owner/${t}/src/sample/marker`, "ok\n"]),
        ),
      };
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project,
      });
      expect(occurrences).toHaveLength(7);
      const observedTypes = new Set(occurrences.map((o) => o.type));
      expect(observedTypes.size).toBe(7);
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("does not leak FileSystem | Path requirement to callers", () =>
    Effect.gen(function* () {
      // Type-level: makeCanonicalExtensionsScanner returns Effect<…, never, never>.
      // We exercise this at runtime by providing only `fs` and `path` via
      // the deps record — no Effect.provide of FileSystem or Path on the
      // scanner effect itself.
      const path = yield* Path.Path;
      const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
      const diag = makeDiagnostics(ref);
      // Use a synthesized in-memory FS provided through deps, NOT via Layer.
      const deps = yield* buildFixture({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          axmExtensions: { "@x/skills/src/y/SKILL.md": "ok\n" },
        },
      });
      // Build the scanner effect with deps, then run it WITHOUT providing fs/path layers.
      // The scanner effect must succeed because it captured deps.fs/deps.path.
      const occurrences = yield* makeCanonicalExtensionsScanner({
        fs: deps.fs,
        path,
        workspaceRoot: WORKSPACE_ROOT,
        scope: "project",
        diagnostics: diag,
      });
      expect(occurrences).toHaveLength(1);
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("scope is stamped onto every occurrence", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const deps = yield* buildFixture({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          axmExtensions: { "@owner/skills/src/sample/SKILL.md": "ok\n" },
        },
      });
      const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
      const occurrences = yield* makeCanonicalExtensionsScanner({
        fs: deps.fs,
        path,
        workspaceRoot: WORKSPACE_ROOT,
        scope: "user",
        diagnostics: makeDiagnostics(ref),
      });
      // Even though the file is at project, the scanner stamps whatever scope
      // its deps record specifies. Phase 9 picks the right scope per call.
      expect(occurrences.every((o) => o.scope === "user")).toBe(true);
    }).pipe(Effect.provide(Path.layer)),
  );
});

// Reference imports the linter would otherwise flag as unused.
void provideDeps;
