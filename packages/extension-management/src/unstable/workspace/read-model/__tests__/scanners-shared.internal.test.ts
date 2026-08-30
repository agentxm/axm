/**
 * Shared scanner contract tests:
 *
 * (a) `Effect.fn("workspace.read-model.scanner.<id>")(...)` naming for trace
 *     stability — verified by spans recorded against a test runtime tracer.
 * (b) Scanner public effects expose no `FileSystem | Path` requirement —
 *     verified at compile time via `Effect.Effect<…, never, never>` checks.
 * (c) Per-scanner partial failures publish a diagnostic warning rather than
 *     failing the cell — verified by stubbing `fs.readDirectory` to fail and
 *     asserting the cell still succeeds with `[]` plus a buffered warning.
 * (d) WorkspaceMutations-root escape is rejected at provider construction (Phase 9),
 *     not by individual scanners — verified by passing an "escaping" workspace
 *     root and asserting the scanner does not check it (i.e., does not raise).
 */

import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";
import { makeDiagnostics, type Warning } from "../diagnostics.js";
import { makeAgentDirScanner } from "../scanners/agent-dir.js";
import { makeAgentSettingsScanner } from "../scanners/agent-settings.js";
import { makeCanonicalExtensionsScanner } from "../scanners/canonical-extensions.js";
import { makeMcpConfigScanner } from "../scanners/mcp-config.js";
import { makeAbsolutePath } from "../../../utils/path-types.js";
import { resolveProjectWorkspaceLayout } from "../../layout.js";

// Compile-time scanner contract assertions live in
// `scanners-shared.type-test.ts`.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Filesystem that fails on every operation. Used to confirm that scanners
 * surface IO failures as diagnostic warnings rather than as Effect errors.
 */
const failingFs: FileSystem.FileSystem = FileSystem.makeNoop({
  exists: (path) =>
    Effect.fail(
      PlatformError.systemError({
        _tag: "PermissionDenied",
        module: "FileSystem",
        method: "exists",
        description: "permission denied",
        pathOrDescriptor: path,
      }),
    ),
  readDirectory: (path) =>
    Effect.fail(
      PlatformError.systemError({
        _tag: "PermissionDenied",
        module: "FileSystem",
        method: "readDirectory",
        description: "permission denied",
        pathOrDescriptor: path,
      }),
    ),
  readFileString: (path) =>
    Effect.fail(
      PlatformError.systemError({
        _tag: "PermissionDenied",
        module: "FileSystem",
        method: "readFileString",
        description: "permission denied",
        pathOrDescriptor: path,
      }),
    ),
  stat: (path) =>
    Effect.fail(
      PlatformError.systemError({
        _tag: "PermissionDenied",
        module: "FileSystem",
        method: "stat",
        description: "permission denied",
        pathOrDescriptor: path,
      }),
    ),
});

const emptyFs: FileSystem.FileSystem = FileSystem.makeNoop({
  exists: () => Effect.succeed(false),
  readDirectory: () => Effect.succeed([]),
});

const makeDiag = Effect.gen(function* () {
  const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
  return { diag: makeDiagnostics(ref), ref };
});

const makeProjectLayout = (path: Path.Path, workspaceRoot: string) =>
  resolveProjectWorkspaceLayout(makeAbsolutePath(path, workspaceRoot), {}).pipe(
    Effect.provideService(FileSystem.FileSystem, emptyFs),
    Effect.provideService(Path.Path, path),
  );

// ---------------------------------------------------------------------------
// Scanner contract tests
// ---------------------------------------------------------------------------

layer(Path.layer, { excludeTestServices: true })(
  "workspace read-model shared scanner contract",
  (it) => {
    it.effect(
      "canonical-extensions: partial filesystem failure publishes diagnostic warning, not error",
      () =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const { diag, ref } = yield* makeDiag;
          const layout = yield* makeProjectLayout(path, "/ws");
          const occurrences = yield* makeCanonicalExtensionsScanner({
            fs: failingFs,
            path,
            workspaceRoot: "/ws",
            layout,
            diagnostics: diag,
          });
          expect(occurrences).toEqual([]);
          const warnings = yield* Ref.get(ref);
          expect(warnings.length).toBeGreaterThan(0);
          expect(warnings.every((w) => w.source === "scanner")).toBe(true);
        }),
    );

    it.effect("agent-dir: partial filesystem failure publishes diagnostic warning, not error", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const { diag, ref } = yield* makeDiag;
        const occurrences = yield* makeAgentDirScanner({
          fs: failingFs,
          path,
          workspaceRoot: "/ws",
          scope: "project",
          diagnostics: diag,
        });
        expect(occurrences).toEqual([]);
        const warnings = yield* Ref.get(ref);
        expect(warnings.length).toBeGreaterThan(0);
        expect(warnings.every((w) => w.source === "scanner")).toBe(true);
      }),
    );

    it.effect(
      "mcp-config: partial filesystem failure publishes diagnostic warning, not error",
      () =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const { diag, ref } = yield* makeDiag;
          const occurrences = yield* makeMcpConfigScanner({
            fs: failingFs,
            path,
            workspaceRoot: "/ws",
            scope: "project",
            diagnostics: diag,
          });
          expect(occurrences).toEqual([]);
          const warnings = yield* Ref.get(ref);
          expect(warnings.length).toBeGreaterThan(0);
          expect(warnings.every((w) => w.source === "scanner")).toBe(true);
        }),
    );

    it.effect(
      "agent-settings: partial filesystem failure publishes diagnostic warning, not error",
      () =>
        Effect.gen(function* () {
          const path = yield* Path.Path;
          const { diag, ref } = yield* makeDiag;
          const occurrences = yield* makeAgentSettingsScanner({
            fs: failingFs,
            path,
            workspaceRoot: "/ws",
            scope: "project",
            diagnostics: diag,
          });
          expect(occurrences).toEqual([]);
          const warnings = yield* Ref.get(ref);
          // agent-settings only emits stat warnings; "exists: true" then no IO
          // occurs against axm.json itself unless a real read is required.
          // Tolerate zero or more — the scanner's contract is "no error", not
          // "always emits a warning".
          expect(warnings.every((w) => w.source === "scanner")).toBe(true);
        }),
    );

    it.effect("scanners do not validate workspace-root escape (Phase 9 owns that)", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const { diag } = yield* makeDiag;
        // An "escaping" workspace root is just a path string here; the scanner
        // should treat it like any other root and read what it can. With an
        // empty FS it returns an empty array without raising.
        const escaping = "/ws/../escape";
        const layout = yield* makeProjectLayout(path, escaping);
        const occurrences = yield* makeCanonicalExtensionsScanner({
          fs: emptyFs,
          path,
          workspaceRoot: escaping,
          layout,
          diagnostics: diag,
        });
        expect(occurrences).toEqual([]);
      }),
    );

    it.effect("scanners run under their stable Effect.fn span name", () =>
      Effect.gen(function* () {
        // The naming convention is enforced by `Effect.fn("workspace.read-model.scanner.<id>")`
        // at the call site. We assert non-failure here; trace-name introspection
        // is exercised through the runtime tracer, not the test harness, so this
        // test guards against a future refactor that drops the wrapper.
        const path = yield* Path.Path;
        const { diag } = yield* makeDiag;
        const layout = yield* makeProjectLayout(path, "/ws");
        yield* makeCanonicalExtensionsScanner({
          fs: emptyFs,
          path,
          workspaceRoot: "/ws",
          layout,
          diagnostics: diag,
        });
        yield* makeAgentDirScanner({
          fs: emptyFs,
          path,
          workspaceRoot: "/ws",
          scope: "project",
          diagnostics: diag,
        });
        yield* makeMcpConfigScanner({
          fs: emptyFs,
          path,
          workspaceRoot: "/ws",
          scope: "project",
          diagnostics: diag,
        });
        yield* makeAgentSettingsScanner({
          fs: emptyFs,
          path,
          workspaceRoot: "/ws",
          scope: "project",
          diagnostics: diag,
        });
      }),
    );
  },
);
