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

import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as ByteSize from "effect/ByteSize";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";

import { SETTINGS_FILENAME } from "@agentxm/extension-model/unstable/workspace-files";
import {
  WorkspaceTransactionScope,
  type WorkspaceTransitionLock,
} from "../transitions/settlement/index.js";
import { WorkspaceTransactionScopeTest } from "../transitions/settlement/testing.js";
import { ConfiguredAgentOutcomesProvider } from "./workspace/configured-agent-outcomes-provider.js";
import { LOCK_FILENAME } from "./workspace/constants.js";
import { WorkspaceLocation } from "./workspace/location.js";
import {
  computeMaterializedTreeIntegrity,
  type MaterializedTreeInvalid,
  type TreeIntegrity,
} from "./workspace/materialized-tree.js";

export * from "./workspace/test-stubs.js";

/** Give fixture-owned Registry sources an explicit default without changing production policy. */
export const withTestRegistryDefault = <Settings extends Readonly<object>>(
  settings: Settings,
): Settings | (Settings & { readonly defaultRegistry: "test" }) => {
  const sources = "sources" in settings ? settings.sources : undefined;
  const hasTestRegistry =
    Array.isArray(sources) &&
    sources.some(
      (source) =>
        typeof source === "object" && source !== null && "name" in source && source.name === "test",
    );
  const defaultRegistry = "defaultRegistry" in settings ? settings.defaultRegistry : undefined;
  return hasTestRegistry && defaultRegistry === undefined
    ? { defaultRegistry: "test", ...settings }
    : settings;
};

/** A byte-preserving snapshot of a fixture tree, including empty directories and links. */
export const snapshotTree = (root: string): Readonly<Record<string, string>> => {
  if (!fs.existsSync(root)) return {};
  const entries: Array<readonly [string, string]> = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = nodePath.join(directory, entry.name);
      const relative = nodePath.relative(root, absolute);
      if (entry.isSymbolicLink()) {
        entries.push([relative, `symlink:${fs.readlinkSync(absolute)}`]);
      } else if (entry.isDirectory()) {
        entries.push([relative, "directory"]);
        walk(absolute);
      } else {
        entries.push([relative, `file:${fs.readFileSync(absolute).toString("base64")}`]);
      }
    }
  };
  walk(root);
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right, "en")));
};

/** The same encoding for one fixture path; an absent path has no snapshot. */
export const snapshotPath = (absolute: string): Readonly<Record<string, string>> => {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(absolute);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
  if (stat.isSymbolicLink()) return { ".": `symlink:${fs.readlinkSync(absolute)}` };
  if (stat.isDirectory()) return snapshotTree(absolute);
  return { ".": `file:${fs.readFileSync(absolute).toString("base64")}` };
};

const fileErrorTag = (cause: unknown): PlatformError.SystemErrorTag => {
  const code =
    typeof cause === "object" && cause !== null && "code" in cause ? cause.code : undefined;
  if (code === "ENOENT") return "NotFound";
  if (code === "EEXIST") return "AlreadyExists";
  if (code === "EACCES" || code === "EPERM") return "PermissionDenied";
  return "Unknown";
};

const syncFileCall = <A>(method: string, target: string, run: () => A) =>
  Effect.try({
    try: run,
    catch: (cause) =>
      PlatformError.systemError({
        _tag: fileErrorTag(cause),
        module: "FileSystem",
        method,
        pathOrDescriptor: target,
        cause,
      }),
  });

const fileInfo = (target: string): FileSystem.File.Info => {
  const stat = fs.statSync(target);
  const type: FileSystem.File.Type = stat.isDirectory()
    ? "Directory"
    : stat.isFile()
      ? "File"
      : stat.isBlockDevice()
        ? "BlockDevice"
        : stat.isCharacterDevice()
          ? "CharacterDevice"
          : stat.isFIFO()
            ? "FIFO"
            : stat.isSocket()
              ? "Socket"
              : "Unknown";
  return {
    type,
    mtime: Option.some(stat.mtime),
    atime: Option.some(stat.atime),
    birthtime: Option.some(stat.birthtime),
    dev: Number(stat.dev),
    ino: Option.some(Number(stat.ino)),
    mode: Number(stat.mode),
    nlink: Option.some(Number(stat.nlink)),
    uid: Option.some(Number(stat.uid)),
    gid: Option.some(Number(stat.gid)),
    rdev: Option.some(Number(stat.rdev)),
    size: ByteSize.bytes(stat.size),
    blksize: Option.some(ByteSize.bytes(stat.blksize)),
    blocks: Option.some(Number(stat.blocks)),
  };
};

/** Synchronous native reads for production integrity checks in fixture setup. */
export const SyncNodeFileSystem: Layer.Layer<FileSystem.FileSystem> = Layer.succeed(
  FileSystem.FileSystem,
  FileSystem.make({
    ...FileSystem.makeNoop({}),
    readDirectory: (target) => syncFileCall("readDirectory", target, () => fs.readdirSync(target)),
    stat: (target) => syncFileCall("stat", target, () => fileInfo(target)),
    readLink: (target) => syncFileCall("readLink", target, () => fs.readlinkSync(target)),
    readFile: (target) => syncFileCall("readFile", target, () => fs.readFileSync(target)),
  }),
);

/** Hash a fixture package with the production materialized-tree contract. */
export const treeIntegrityOf = (
  root: string,
): Effect.Effect<TreeIntegrity, MaterializedTreeInvalid> =>
  computeMaterializedTreeIntegrity(root).pipe(
    Effect.provide(Layer.merge(SyncNodeFileSystem, Path.layer)),
  );

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
