/**
 * @agentxm/workspace/desired-state deterministic test layers and fixtures.
 *
 * In-memory and fixture-backed implementations of this package's own
 * services for tests and executable specifications. Production source never
 * imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";

import { SETTINGS_FILENAME } from "@agentxm/extension-model/unstable/workspace-files";
import {
  WorkspaceTransactionScope,
  type WorkspaceTransitionLock,
} from "../transitions/settlement/index.js";
import { WorkspaceTransactionScopeTest } from "../transitions/settlement/testing.js";
import { ConfiguredAgentOutcomesProvider } from "./workspace/configured-agent-outcomes-provider.js";
import { LOCK_FILENAME } from "./workspace/constants.js";
import { WorkspaceLocation } from "./workspace/location.js";

export * from "./workspace/test-stubs.js";

/**
 * A transaction scope over the located workspace with the given admission —
 * one invocation of a memory transition-lock world from
 * `@agentxm/workspace/transitions/settlement/testing`, so no lock file is created and
 * waits use Effect time. Compose beside `WorkspaceStateLive` from `./live`
 * in place of the production scope.
 */
export const MemoryWorkspaceTransactionScope = (
  lock: WorkspaceTransitionLock,
): Layer.Layer<
  WorkspaceTransactionScope,
  never,
  WorkspaceLocation | FileSystem.FileSystem | Path.Path
> =>
  Layer.unwrap(
    Effect.map(WorkspaceLocation, (location) =>
      WorkspaceTransactionScopeTest(
        {
          workspaceDir: location.runtimeDir,
          settingsPath: location.settingsPath,
          lockPath: location.lockPath,
        },
        { lock },
      ),
    ),
  );

/**
 * A transaction scope over an explicit workspace runtime directory. It places
 * the two authoritative files where the project layout places them and takes
 * its admission from an in-memory transition-lock world, so a test that runs
 * a workspace transaction creates no lock file and waits on Effect time.
 */
export const MockWorkspaceTransactionScope = (
  axmDir = "/tmp/axm",
  options?: { readonly lock?: WorkspaceTransitionLock },
): Layer.Layer<WorkspaceTransactionScope, never, FileSystem.FileSystem | Path.Path> =>
  WorkspaceTransactionScopeTest(
    {
      workspaceDir: axmDir,
      settingsPath: nodePath.join(axmDir, SETTINGS_FILENAME),
      lockPath: nodePath.join(axmDir, LOCK_FILENAME),
    },
    options,
  );

/** A provider with no per-type refinement: every outcome stays generic. */
export const ConfiguredAgentOutcomesProviderTest: Layer.Layer<ConfiguredAgentOutcomesProvider> =
  Layer.succeed(ConfiguredAgentOutcomesProvider, { byExtensionType: {} });
export {
  WorkspaceReadModelTest,
  type WorkspaceReadModelTestOptions,
} from "./workspace/read-model/__fixtures__/test-layer.js";
export * from "./workspace/read-model/__fixtures__/builder.js";
export * from "./workspace/read-model/__fixtures__/decoders.js";
export * from "./workspace/read-model/__fixtures__/occurrences.js";
export * from "./workspace/read-model/__fixtures__/scenario-harness.js";
