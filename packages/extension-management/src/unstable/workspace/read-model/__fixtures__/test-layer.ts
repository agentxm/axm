/**
 * Workspace read-model test layer.
 *
 * Provides {@link WorkspaceReadModelConfig}, {@link AgentRootResolver},
 * `FileSystem`, and `Path` against fixture-built deps. Test bodies call
 * {@link makeWorkspaceReadModel} directly to obtain a per-scope read model.
 *
 * The layer accepts an optional `options.allowedRoot`; when omitted, the
 * filesystem root (`/`) is used so any `workspaceRoot` / `userHome` from the
 * spec is allowed. Tests that want to verify root-escape failure pass an
 * `allowedRoot` outside the spec's `workspaceRoot`.
 *
 * Tests that need to inject filesystem-level faults (e.g. simulate read
 * failures) provide `options.wrapFileSystem` to wrap the fixture's
 * `FileSystem` before it is composed into the layer.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { makeAbsolutePath } from "../../../utils/path-types.js";
import { AgentRootResolver, AgentRootResolverLive } from "../agent-root-resolver.js";
import { WorkspaceReadModelConfig } from "../service.js";
import { buildFixture, type FixtureSpec, type PathEscapeError } from "./builder.js";

/**
 * Optional layer-construction options for {@link WorkspaceReadModelTest}.
 *
 * - `allowedRoot` — workspace-root containment boundary used by
 *   {@link makeWorkspaceReadModel} to validate `projectRoot` and `userHome`.
 *   Defaults to the filesystem root so tests opt into root-escape behaviour
 *   explicitly.
 * - `wrapFileSystem` — optional adapter applied to the fixture's
 *   `FileSystem` before it is provided. Tests that simulate IO faults (e.g.
 *   read failures on specific paths) wrap the underlying filesystem here
 *   without forking the test layer.
 */
export interface WorkspaceReadModelTestOptions {
  readonly allowedRoot?: string;
  readonly wrapFileSystem?: (fs: FileSystem.FileSystem) => FileSystem.FileSystem;
}

/**
 * Test layer for the workspace read model. Composes the fixture-built
 * `FileSystem` / `Path` with {@link WorkspaceReadModelConfig} and
 * {@link AgentRootResolver}, the dependencies callers need to invoke
 * {@link makeWorkspaceReadModel}.
 *
 * The error channel covers:
 *
 *   - `PathEscapeError` — fixture builder rejection (escapes the
 *     synthesized tree). Tests that need to assert this branch pass a
 *     spec with a `..`-laden tree entry.
 *
 * Workspace-root escape (`WorkspaceRootEscape`) surfaces from
 * {@link makeWorkspaceReadModel} itself, not the layer.
 */
export const WorkspaceReadModelTest = (
  spec: FixtureSpec,
  options: WorkspaceReadModelTestOptions = {},
): Layer.Layer<
  FileSystem.FileSystem | Path.Path | WorkspaceReadModelConfig | AgentRootResolver,
  PathEscapeError
> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const deps = yield* buildFixture(spec);
      const fs = options.wrapFileSystem === undefined ? deps.fs : options.wrapFileSystem(deps.fs);
      const fsLayer = Layer.succeed(FileSystem.FileSystem, fs);
      const pathLayer = Layer.succeed(Path.Path, deps.path);
      const allowedRoot = options.allowedRoot ?? "/";
      const configLayer = Layer.succeed(WorkspaceReadModelConfig, {
        projectRoot: makeAbsolutePath(deps.path, deps.workspaceRoot),
        userHome: makeAbsolutePath(deps.path, deps.userHome),
        allowedRoot: makeAbsolutePath(deps.path, allowedRoot),
      });
      return Layer.mergeAll(
        fsLayer,
        pathLayer,
        configLayer,
        AgentRootResolverLive.pipe(Layer.provide(pathLayer)),
      );
    }),
  );
