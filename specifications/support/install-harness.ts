/**
 * In-memory workspace harness for CLI specifications.
 *
 * Composes the production workspace program layers over an isolated memory or
 * disk world with controlled ports: captured rendering, canned interaction,
 * test credentials, and no live network. Specifications drive the real command
 * handlers in-process and assert product-observable postconditions — settings,
 * lockfile, canonical content, agent projections, and rendered results.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { makeMemoryFileSystem, type MemoryFileStore, withoutNativeIo } from "@agentxm/test-support";

import {
  humanScreenLayer,
  machineScreenLayer,
  makeRecordingStreams,
  type RecordingStreams,
} from "./screen-harness.js";

import {
  KnowledgeIndexLive,
  makeWorkspaceHandlerTestContext,
  makeWorkspaceFileContents,
  writeWorkspaceFiles,
  type FileSystemWriteEvent,
  type TestPromptConfig,
  CodingAgentRepositoryLive,
  makeAxmSkillCompatibilityPolicyLayer,
  SourceHostProvidersLive,
  workspaceInvariantFactsLive,
  HookManagerLive,
  InspectionFailureAdapterLive,
  KnowledgeManagerLive,
  LifecycleFailureAdapterLive,
  McpServerManagerLive,
  PackManagerLive,
  RuleManagerLive,
  SkillManagerLive,
  SubagentManagerLive,
  ReleaseAgePosture,
  type ReleaseAgePostureValue,
  makeMemoryTransitionLockWorld,
  MemoryWorkspaceTransactionScope,
  WorkspaceStateLive,
} from "axm.sh/specification-harness";

export interface SpecWorkspaceOptions {
  /** Persistent-state implementation. Memory worlds never touch the host filesystem. */
  readonly storage?: "disk" | "memory";
  /** Workspace scope composed for command handlers. Defaults to project. */
  readonly scope?: "project" | "user";
  /** Render through the machine (JSON) renderer instead of the human one. */
  readonly machine?: boolean;
  /**
   * Render through the real `Screen` of the named mode over recording output
   * streams, so a specification can observe the bytes each stream receives.
   * The terminal facts default to two non-terminal streams at 80 columns.
   */
  readonly screen?: {
    readonly kind: "machine" | "human";
    readonly stdoutIsTTY?: boolean;
    readonly stderrIsTTY?: boolean;
    readonly columns?: number;
  };
  readonly prompt?: TestPromptConfig;
  readonly flags?: {
    readonly verbose?: boolean;
    readonly quiet?: boolean;
    readonly nonInteractive?: boolean;
    readonly json?: boolean;
  };
  /**
   * Record every mutating file-system call the application makes, so a
   * specification can show that an assessment attempted no write beneath its
   * protected state. The recorded events are returned as `writes`.
   */
  readonly recordWrites?: boolean;
  /** Override selected real filesystem operations before workspace service construction. */
  readonly fileSystemLayer?: Layer.Layer<FileSystem.FileSystem, never, FileSystem.FileSystem>;
  /** Initial `axm.json` content beyond the defaults. */
  readonly settings?: Parameters<typeof writeWorkspaceFiles>[1];
  /**
   * The minimum-release-age posture the command boundary discharges. Defaults
   * to `"enforce"`, which is what every command without the one-shot override
   * provides.
   */
  readonly releaseAgePosture?: ReleaseAgePostureValue;
  /**
   * User-scope `axm.json` content, written to a hermetic user home for the
   * lifetime of this workspace. Present only when a specification needs to
   * observe how project scope and user scope combine.
   */
  readonly userSettings?: Parameters<typeof writeWorkspaceFiles>[1];
}

export type SpecFileStore = MemoryFileStore;

export interface SpecWorkspaceStorage {
  readonly root: string;
  readonly files: SpecFileStore;
}

export type SpecWorkspaceInput = string | SpecWorkspaceStorage;

const makeNativeFileStore = (): SpecFileStore => ({
  exists: fs.existsSync,
  makeDirectory: (target) => void fs.mkdirSync(target, { recursive: true }),
  makeTempDirectory: (prefix) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix))),
  readDirectory: (target) =>
    fs.readdirSync(target, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      type: entry.isSymbolicLink() ? "symlink" : entry.isDirectory() ? "directory" : "file",
    })),
  readFile: (target) => new Uint8Array(fs.readFileSync(target)),
  readFileString: (target) => fs.readFileSync(target, "utf8"),
  readLink: fs.readlinkSync,
  realPath: fs.realpathSync,
  remove: (target) => void fs.rmSync(target, { recursive: true, force: true }),
  type: (target) => {
    try {
      const entry = fs.lstatSync(target);
      if (entry.isSymbolicLink()) return "symlink";
      return entry.isDirectory() ? "directory" : "file";
    } catch {
      return undefined;
    }
  },
  writeFile: fs.writeFileSync,
});

export const resolveSpecWorkspaceStorage = (workspace: SpecWorkspaceInput): SpecWorkspaceStorage =>
  typeof workspace === "string" ? { root: workspace, files: makeNativeFileStore() } : workspace;

const initializeWorkspace = (
  files: SpecFileStore,
  runtimeDir: string,
  options: Parameters<typeof writeWorkspaceFiles>[1],
): void => {
  const scope = options?.scope ?? "project";
  const projectRoot = path.basename(runtimeDir) === ".axm" ? path.dirname(runtimeDir) : runtimeDir;
  const workspaceRoot = scope === "user" ? path.join(runtimeDir, "workspace") : projectRoot;
  const contents = makeWorkspaceFileContents(options);
  files.makeDirectory(path.join(workspaceRoot, ".axm"));
  files.writeFile(path.join(workspaceRoot, "axm.json"), contents.settings);
  files.writeFile(path.join(workspaceRoot, "axm-lock.yaml"), contents.lockfile);
};

export const makeSpecWorkspace = (options: SpecWorkspaceOptions = {}) => {
  const storage = options.storage ?? "disk";
  const memory = storage === "memory" ? makeMemoryFileSystem() : undefined;
  const files = memory?.files ?? makeNativeFileStore();
  const root = files.makeTempDirectory("axm-spec-");
  initializeWorkspace(files, root, options.settings ?? {});

  // A hermetic user home, so user-scope settings are this workspace's and the
  // machine's real home is never read or written.
  const userHome =
    options.userSettings === undefined && storage === "disk"
      ? undefined
      : files.makeTempDirectory("axm-spec-home-");
  if (userHome !== undefined && options.userSettings !== undefined) {
    initializeWorkspace(files, path.join(userHome, ".axm"), {
      ...options.userSettings,
      scope: "user",
    });
  }

  const streams: RecordingStreams | undefined =
    options.screen === undefined
      ? undefined
      : makeRecordingStreams({
          ...(options.screen.stdoutIsTTY === undefined
            ? {}
            : { stdoutIsTTY: options.screen.stdoutIsTTY }),
          ...(options.screen.stderrIsTTY === undefined
            ? {}
            : { stderrIsTTY: options.screen.stderrIsTTY }),
          ...(options.screen.columns === undefined ? {} : { columns: options.screen.columns }),
        });
  const screenLayer =
    streams === undefined || options.screen === undefined
      ? undefined
      : options.screen.kind === "machine"
        ? machineScreenLayer(streams, { quiet: options.flags?.quiet === true })
        : humanScreenLayer(streams);

  const writes: Array<FileSystemWriteEvent> = [];
  const transitionWorld = storage === "memory" ? makeMemoryTransitionLockWorld() : undefined;
  const fileSystemLayer =
    memory === undefined
      ? options.fileSystemLayer
      : Layer.succeed(FileSystem.FileSystem, memory.fileSystem);
  // A memory world admits transitions without a lock file: the state
  // services compose beside a memory transaction scope instead of the
  // production one.
  const workspaceLayer =
    transitionWorld === undefined
      ? undefined
      : Layer.provideMerge(
          MemoryWorkspaceTransactionScope(transitionWorld.invocation()),
          WorkspaceStateLive({
            projectRoot: decodeAbsolutePathSync(root),
            scope: options.scope ?? "project",
          }),
        );
  const context = makeWorkspaceHandlerTestContext({
    ...(options.machine !== undefined ? { machine: options.machine } : {}),
    ...(screenLayer === undefined ? {} : { screenLayer }),
    ...(options.prompt !== undefined ? { prompt: options.prompt } : {}),
    ...(fileSystemLayer === undefined ? {} : { fileSystemLayer }),
    ...(workspaceLayer === undefined ? {} : { workspaceLayer }),
    ...(options.recordWrites === true
      ? { onFileSystemWrite: (event: FileSystemWriteEvent) => void writes.push(event) }
      : {}),
    flags: { nonInteractive: true, ...options.flags },
    wsOptions: { projectRoot: root, scope: options.scope ?? "project" },
  });

  const workspaceServiceLayer = Layer.provideMerge(
    Layer.mergeAll(
      SourceHostProvidersLive,
      CodingAgentRepositoryLive,
      InspectionFailureAdapterLive,
      LifecycleFailureAdapterLive,
      makeAxmSkillCompatibilityPolicyLayer("0.0.0-spec"),
    ),
    context.fullLayer,
  );
  const coreExtensions = Layer.mergeAll(
    RuleManagerLive,
    HookManagerLive,
    McpServerManagerLive,
    SkillManagerLive,
    SubagentManagerLive,
    KnowledgeManagerLive,
    KnowledgeIndexLive,
  );
  const extensionsLayer = Layer.provideMerge(PackManagerLive, coreExtensions);
  const fullLayer = Layer.provideMerge(extensionsLayer, workspaceServiceLayer);
  const invariantFactsLayer = Layer.provide(workspaceInvariantFactsLive, fullLayer);
  const composed = Layer.mergeAll(
    fullLayer,
    invariantFactsLayer,
    Layer.succeed(ReleaseAgePosture, options.releaseAgePosture ?? "enforce"),
  );
  // The user home is read through configuration, whose provider snapshots the
  // environment; relocating it therefore means supplying the provider, not
  // mutating `process.env` after the fact.
  const layer =
    userHome === undefined
      ? composed
      : Layer.provide(
          composed,
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: Object.fromEntries([
                ...Object.entries(process.env).flatMap(([key, value]) =>
                  value === undefined ? [] : [[key, value] as const],
                ),
                ["AXM_USER_HOME", userHome] as const,
              ]),
            }),
          ),
        );

  return {
    /** Absolute project root of the temporary workspace. */
    root,
    files,
    layer,
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => {
      const provided = effect.pipe(Effect.provide(layer));
      return storage === "memory" ? withoutNativeIo(provided) : provided;
    },
    rendererState: context.rendererState,
    /** Every mutating file-system call recorded when `recordWrites` was requested. */
    writes,
    promptState: context.promptState,
    resolvePlanState: context.resolvePlanState,
    /** The recording output streams when `screen` was requested. */
    streams,
    logs: context.logs,
    readSettings: (): unknown => JSON.parse(files.readFileString(path.join(root, "axm.json"))),
    readSettingsRecord: (): Readonly<Record<string, unknown>> => {
      const parsed: unknown = JSON.parse(files.readFileString(path.join(root, "axm.json")));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Expected axm.json to contain an object");
      }
      return Object.fromEntries(Object.entries(parsed));
    },
    writeSettings: (settings: unknown): void => {
      files.writeFile(path.join(root, "axm.json"), `${JSON.stringify(settings, null, 2)}\n`);
    },
    readLockfileText: (): string => {
      const lockPath = path.join(root, "axm-lock.yaml");
      return files.exists(lockPath) ? files.readFileString(lockPath) : "";
    },
    exists: (relativePath: string): boolean => files.exists(path.join(root, relativePath)),
    readFile: (relativePath: string): string => files.readFileString(path.join(root, relativePath)),
    listDirectory: (relativePath: string): readonly string[] =>
      files.exists(path.join(root, relativePath))
        ? files
            .readDirectory(path.join(root, relativePath))
            .map((entry) => entry.name)
            .sort()
        : [],
    snapshotTree: (relativePath: string): readonly string[] => {
      const start = path.join(root, relativePath);
      if (!files.exists(start)) {
        return [];
      }
      const entries: string[] = [];
      const walk = (directory: string): void => {
        for (const entry of [...files.readDirectory(directory)].sort((left, right) =>
          left.name.localeCompare(right.name, "en"),
        )) {
          const entryPath = path.join(directory, entry.name);
          entries.push(path.relative(root, entryPath));
          if (entry.type === "directory") {
            walk(entryPath);
          }
        }
      };
      walk(start);
      return entries.sort();
    },
    snapshotContent: (relativePath: string): Readonly<Record<string, string>> => {
      const start = path.join(root, relativePath);
      if (!files.exists(start)) return {};
      const entries: Array<readonly [string, string]> = [];
      const walk = (directory: string, relativeDirectory: string): void => {
        for (const entry of [...files.readDirectory(directory)].sort((left, right) =>
          left.name.localeCompare(right.name, "en"),
        )) {
          const relative =
            relativeDirectory.length === 0 ? entry.name : `${relativeDirectory}/${entry.name}`;
          const target = path.join(directory, entry.name);
          if (entry.type === "directory") {
            entries.push([relative, "directory"]);
            walk(target, relative);
          } else if (entry.type === "symlink") {
            entries.push([relative, `symlink:${files.readLink(target)}`]);
          } else {
            entries.push([
              relative,
              `file:${Buffer.from(files.readFile(target)).toString("base64")}`,
            ]);
          }
        }
      };
      walk(start, "");
      return Object.fromEntries(entries);
    },
    transitionCounts: transitionWorld?.counts,
    cleanup: (): void => {
      files.remove(root);
      if (userHome !== undefined) files.remove(userHome);
    },
  };
};

export interface LocalSkillFixture {
  readonly name: string;
  readonly description?: string;
  readonly version?: string;
  readonly owner?: string;
  readonly body?: string;
}

/**
 * Writes a local skill package (manifest plus `src/SKILL.md`) under
 * `<workspaceRoot>/vendor/<name>` and returns its absolute path for use as an
 * install source.
 */
export const writeLocalSkillPackage = (
  workspace: SpecWorkspaceInput,
  fixture: LocalSkillFixture,
): string => {
  const { root: workspaceRoot, files } = resolveSpecWorkspaceStorage(workspace);
  const packageRoot = path.join(workspaceRoot, "vendor", fixture.name);
  files.makeDirectory(packageRoot);
  const description = fixture.description ?? `The ${fixture.name} skill.`;
  files.writeFile(
    path.join(packageRoot, "skill.json"),
    `${JSON.stringify(
      {
        $schema: "https://axm.sh/schemas/skill.schema.json",
        owner: fixture.owner ?? "@acme",
        type: "skill",
        name: fixture.name,
        version: fixture.version ?? "1.0.0",
        description,
      },
      null,
      2,
    )}\n`,
  );
  files.makeDirectory(path.join(packageRoot, "src"));
  files.writeFile(
    path.join(packageRoot, "src", "SKILL.md"),
    `---\nname: "${fixture.name}"\ndescription: "${description}"\n---\n\n# ${fixture.name}\n\n${fixture.body ?? description}\n`,
  );
  return packageRoot;
};
