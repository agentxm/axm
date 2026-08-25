/**
 * Canonical-extensions scanner: covers canonical AXM
 * (`.axm/extensions/<owner>/<type-plural>/<name>/src/`) and external AXM
 * (`.axm/extensions/<source>/<source-full-name>/`) materializations across
 * all extension types.
 *
 * Each occurrence carries the scanner-tier origin (`canonical-axm` |
 * `external-axm`) plus the extension type discriminator. Phase 7's per-subject
 * modules map these into subject-specific origin unions.
 */

import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import {
  EXTENSION_TYPE_TABLE,
  extensionTypes,
  toExtensionTypePlural,
} from "../../../extensions/common.js";
import { MANIFEST_FILENAME_BY_TYPE } from "../../../publish/manifest-policy.js";
import {
  buildFixture,
  resolveFixtureProjectLayout,
  resolveFixtureUserLayout,
  type FixtureSpec,
} from "../__fixtures__/builder.js";
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
    const layout = yield* resolveFixtureProjectLayout(deps);
    const occurrences = yield* makeCanonicalExtensionsScanner({
      fs: deps.fs,
      path: deps.path,
      workspaceRoot: spec.workspaceRoot,
      layout,
      diagnostics: diag,
    });
    return { occurrences, warnings: yield* Ref.get(ref) };
  });

const sortByContent = (
  occurrences: ReadonlyArray<CanonicalExtensionOccurrence>,
): ReadonlyArray<CanonicalExtensionOccurrence> =>
  [...occurrences].sort((a, b) => a.contentLocation.localeCompare(b.contentLocation));

layer(Path.layer, { excludeTestServices: true })("canonical-extensions scanner", (it) => {
  it.effect("emits no occurrences when .axm/extensions is absent", () =>
    Effect.gen(function* () {
      const { occurrences, warnings } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {},
      });
      expect(occurrences).toEqual([]);
      expect(warnings).toEqual([]);
    }),
  );

  it.effect("emits native occurrences beneath a source-qualified Registry root", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          axmExtensions: {
            "agentxm/@owner/skills/some-skill/skill.json": JSON.stringify({
              owner: "@owner",
              type: "skill",
              name: "some-skill",
              version: "1.0.0",
            }),
            "agentxm/@owner/skills/some-skill/src/SKILL.md": "# canonical\n",
            "agentxm/@owner/hooks/some-hook/hook.json": JSON.stringify({
              owner: "@owner",
              type: "hook",
              name: "some-hook",
              version: "1.0.0",
            }),
            "agentxm/@owner/hooks/some-hook/src/hook.sh": "#!/bin/sh\n",
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
        type: "hook",
        origin: "canonical-axm",
        name: "some-hook",
        owner: "@owner",
        contentLocation: "/ws/agent_extensions/agentxm/@owner/hooks/some-hook/src",
      });
      expect(sorted[1]).toMatchObject({
        _tag: "canonical-extension",
        scope: "project",
        type: "skill",
        origin: "canonical-axm",
        name: "some-skill",
        owner: "@owner",
        contentLocation: "/ws/agent_extensions/agentxm/@owner/skills/some-skill/src",
      });
    }),
  );

  it.effect("emits MCP package roots that do not use a src directory", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          axmExtensions: {
            "agentxm/@owner/mcps/tools/mcp.json": JSON.stringify({
              owner: "@owner",
              type: "mcp-server",
              name: "tools",
              version: "1.0.0",
            }),
          },
        },
      });

      expect(occurrences).toHaveLength(1);
      expect(occurrences[0]).toMatchObject({
        type: "mcp-server",
        name: "tools",
        contentLocation: "/ws/agent_extensions/agentxm/@owner/mcps/tools",
      });
    }),
  );

  it.effect("emits a portable skill without fabricating native package identity", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          axmExtensions: {
            "github/acme/toolkit/.agents/skills/external-skill/SKILL.md":
              "---\nname: external-skill\ndescription: External\n---\n# external\n",
          },
        },
      });
      const sorted = sortByContent(occurrences);
      expect(sorted).toHaveLength(1);
      expect(sorted[0]).toMatchObject({
        origin: "external-axm",
        type: "skill",
        name: "external-skill",
        owner: null,
      });
    }),
  );

  it.effect("emits canonical and external occurrences for the same name as distinct entries", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          axmExtensions: {
            "agentxm/@owner/skills/some-skill/skill.json": JSON.stringify({
              owner: "@owner",
              type: "skill",
              name: "some-skill",
              version: "1.0.0",
            }),
            "agentxm/@owner/skills/some-skill/src/SKILL.md": "# canonical\n",
            "github/acme/toolkit/.agents/skills/some-skill/SKILL.md":
              "---\nname: some-skill\ndescription: External\n---\n# external\n",
          },
        },
      });
      const sorted = sortByContent(occurrences);
      expect(sorted).toHaveLength(2);
      expect(sorted.map((o) => o.origin).sort()).toEqual(["canonical-axm", "external-axm"]);
      // Distinct contentLocations → distinct entries.
      expect(new Set(sorted.map((o) => o.contentLocation)).size).toBe(2);
    }),
  );

  it.effect("ignores non-extension type segments under canonical owners", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          axmExtensions: {
            "agentxm/@owner/skills/some-skill/skill.json": JSON.stringify({
              owner: "@owner",
              type: "skill",
              name: "some-skill",
              version: "1.0.0",
            }),
            "agentxm/@owner/skills/some-skill/src/SKILL.md": "# ok\n",
            // "stuff" is not a local extension type directory; the scanner should skip it.
            "@owner/stuff/src/junk/file.txt": "junk",
          },
        },
      });
      expect(occurrences).toHaveLength(1);
      expect(occurrences[0]?.type).toBe("skill");
    }),
  );

  it.effect("covers every extension type under one owner", () =>
    Effect.gen(function* () {
      // Container types hold their members directly; every other type nests its
      // content under `src/`. Both the set of types and that distinction come
      // from the catalog, so a new type joins this case without an edit here.
      const project: FixtureSpec["project"] = {
        axmExtensions: Object.fromEntries(
          extensionTypes.flatMap((type) => {
            const root = `agentxm/@owner/${toExtensionTypePlural(type)}/sample`;
            const manifest = [
              `${root}/${MANIFEST_FILENAME_BY_TYPE[type]}`,
              JSON.stringify({ owner: "@owner", type, name: "sample", version: "1.0.0" }),
            ] as const;
            return EXTENSION_TYPE_TABLE[type].placement === "container"
              ? [manifest]
              : [manifest, [`${root}/src/marker`, "ok\n"] as const];
          }),
        ),
      };
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project,
      });
      expect(occurrences).toHaveLength(extensionTypes.length);
      const observedTypes = new Set(occurrences.map((o) => o.type));
      expect(observedTypes.size).toBe(extensionTypes.length);
    }),
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
          axmExtensions: {
            "agentxm/@x/skills/y/skill.json": JSON.stringify({
              owner: "@x",
              type: "skill",
              name: "y",
              version: "1.0.0",
            }),
            "agentxm/@x/skills/y/src/SKILL.md": "ok\n",
          },
        },
      });
      const layout = yield* resolveFixtureProjectLayout(deps);
      // Build the scanner effect with deps, then run it WITHOUT providing fs/path layers.
      // The scanner effect must succeed because it captured deps.fs/deps.path.
      const occurrences = yield* makeCanonicalExtensionsScanner({
        fs: deps.fs,
        path,
        workspaceRoot: WORKSPACE_ROOT,
        layout,
        diagnostics: diag,
      });
      expect(occurrences).toHaveLength(1);
    }),
  );

  it.effect("scope is stamped onto every occurrence", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const deps = yield* buildFixture({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        user: {
          axmExtensions: {
            "agentxm/@owner/skills/sample/skill.json": JSON.stringify({
              owner: "@owner",
              type: "skill",
              name: "sample",
              version: "1.0.0",
            }),
            "agentxm/@owner/skills/sample/src/SKILL.md": "ok\n",
          },
        },
      });
      const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
      const layout = yield* resolveFixtureUserLayout(deps);
      const occurrences = yield* makeCanonicalExtensionsScanner({
        fs: deps.fs,
        path,
        workspaceRoot: deps.userHome,
        layout,
        diagnostics: makeDiagnostics(ref),
      });
      // The workspace layout is the scope authority for every occurrence.
      expect(occurrences).toHaveLength(1);
      expect(occurrences.every((o) => o.scope === "user")).toBe(true);
    }),
  );
});

// Reference imports the linter would otherwise flag as unused.
void provideDeps;
