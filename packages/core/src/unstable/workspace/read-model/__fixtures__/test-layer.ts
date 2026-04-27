/**
 * `WorkspaceReadModelTest` test layer.
 *
 * Provides the real `WorkspaceReadModelLive` against fixture-built deps:
 *
 * - Builds the in-memory `FileSystem` and `Path` from the `FixtureSpec`.
 * - Provides `FileSystem`, `Path`, and `WorkspaceReadModelConfig` to
 *   `WorkspaceReadModelLive`.
 * - Surfaces `WorkspaceRootEscape` and the fixture builder's
 *   `PathEscapeError` in the Layer's error channel so tests can assert
 *   either failure mode.
 *
 * The layer accepts an optional `options.allowedRoot`; when omitted, the
 * filesystem root (`/`) is used so any `workspaceRoot`/`userHome` from the
 * spec is allowed. Tests that want to verify root-escape failure pass an
 * `allowedRoot` outside the spec's `workspaceRoot`.
 *
 * Tests that need to inject filesystem-level faults (e.g. simulate read
 * failures) provide `options.wrapFileSystem` to wrap the fixture's
 * `FileSystem` before it is composed into `WorkspaceReadModelLive`.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import {
  WorkspaceReadModel,
  WorkspaceReadModelConfig,
  WorkspaceReadModelLive,
} from "../service.js";
import { type WorkspaceRootEscape } from "../errors.js";
import { buildFixture, type FixtureSpec, type PathEscapeError } from "./builder.js";

/**
 * Optional layer-construction options for `WorkspaceReadModelTest`.
 *
 * - `allowedRoot` — workspace-root containment boundary used by the Live
 *   layer to validate `projectRoot` and `userHome`. Defaults to the
 *   filesystem root so tests opt into root-escape behaviour explicitly.
 * - `wrapFileSystem` — optional adapter applied to the fixture's
 *   `FileSystem` before it is provided to `WorkspaceReadModelLive`. Tests
 *   that simulate IO faults (e.g. read failures on specific paths) wrap
 *   the underlying filesystem here without forking the test layer.
 */
export interface WorkspaceReadModelTestOptions {
  readonly allowedRoot?: string;
  readonly wrapFileSystem?: (fs: FileSystem.FileSystem) => FileSystem.FileSystem;
}

/**
 * Test layer for `WorkspaceReadModel`. Composes the fixture-built
 * `FileSystem` / `Path` with the real `WorkspaceReadModelLive` provider.
 *
 * The error channel covers:
 *
 *   - `WorkspaceRootEscape` — Layer-construction failure when
 *     `projectRoot` or `userHome` escapes `allowedRoot`.
 *   - `PathEscapeError` — fixture builder rejection (escapes the
 *     synthesized tree). Tests that need to assert this branch pass a
 *     spec with a `..`-laden tree entry.
 */
export const WorkspaceReadModelTest = (
  spec: FixtureSpec,
  options: WorkspaceReadModelTestOptions = {},
): Layer.Layer<WorkspaceReadModel, WorkspaceRootEscape | PathEscapeError> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const deps = yield* buildFixture(spec);
      const fs = options.wrapFileSystem === undefined ? deps.fs : options.wrapFileSystem(deps.fs);
      const fsLayer = Layer.succeed(FileSystem.FileSystem, fs);
      const pathLayer = Layer.succeed(Path.Path, deps.path);
      const allowedRoot = options.allowedRoot ?? "/";
      const configLayer = Layer.succeed(WorkspaceReadModelConfig, {
        projectRoot: deps.workspaceRoot,
        userHome: deps.userHome,
        allowedRoot,
      });
      return WorkspaceReadModelLive.pipe(
        Layer.provide(fsLayer),
        Layer.provide(pathLayer),
        Layer.provide(configLayer),
      );
    }),
  );
