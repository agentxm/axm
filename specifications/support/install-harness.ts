/**
 * In-memory workspace harness for CLI specifications.
 *
 * Composes the production workspace program layers over a real temporary
 * project directory with controlled ports: captured rendering, canned
 * interaction, test credentials, and no live network. Specifications drive
 * the real command handlers in-process and assert product-observable
 * postconditions — settings, lockfile, canonical content, agent projections,
 * and rendered results.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as ConfigProvider from "effect/ConfigProvider";
import * as Layer from "effect/Layer";
import type * as FileSystem from "effect/FileSystem";

import * as Effect from "effect/Effect";

import {
  humanScreenLayer,
  machineScreenLayer,
  makeRecordingStreams,
  type RecordingStreams,
} from "./screen-harness.js";

import {
  KnowledgeIndexLive,
  makeWorkspaceHandlerTestContext,
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
} from "axm.sh/specification-harness";

export interface SpecWorkspaceOptions {
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

export const makeSpecWorkspace = (options: SpecWorkspaceOptions = {}) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-spec-")));
  writeWorkspaceFiles(root, options.settings ?? {});

  // A hermetic user home, so user-scope settings are this workspace's and the
  // machine's real home is never read or written.
  const userHome =
    options.userSettings === undefined
      ? undefined
      : fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "axm-spec-home-")));
  if (userHome !== undefined) {
    writeWorkspaceFiles(path.join(userHome, ".axm"), { ...options.userSettings, scope: "user" });
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
  const context = makeWorkspaceHandlerTestContext({
    ...(options.machine !== undefined ? { machine: options.machine } : {}),
    ...(screenLayer === undefined ? {} : { screenLayer }),
    ...(options.prompt !== undefined ? { prompt: options.prompt } : {}),
    ...(options.fileSystemLayer === undefined ? {} : { fileSystemLayer: options.fileSystemLayer }),
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
    layer,
    provide: Effect.provide(layer),
    rendererState: context.rendererState,
    /** Every mutating file-system call recorded when `recordWrites` was requested. */
    writes,
    promptState: context.promptState,
    resolvePlanState: context.resolvePlanState,
    /** The recording output streams when `screen` was requested. */
    streams,
    logs: context.logs,
    readSettings: (): unknown => JSON.parse(fs.readFileSync(path.join(root, "axm.json"), "utf8")),
    writeSettings: (settings: unknown): void => {
      fs.writeFileSync(path.join(root, "axm.json"), `${JSON.stringify(settings, null, 2)}\n`);
    },
    readLockfileText: (): string => {
      const lockPath = path.join(root, "axm-lock.yaml");
      return fs.existsSync(lockPath) ? fs.readFileSync(lockPath, "utf8") : "";
    },
    exists: (relativePath: string): boolean => fs.existsSync(path.join(root, relativePath)),
    readFile: (relativePath: string): string =>
      fs.readFileSync(path.join(root, relativePath), "utf8"),
    listDirectory: (relativePath: string): readonly string[] =>
      fs.existsSync(path.join(root, relativePath))
        ? fs.readdirSync(path.join(root, relativePath)).sort()
        : [],
    snapshotTree: (relativePath: string): readonly string[] => {
      const start = path.join(root, relativePath);
      if (!fs.existsSync(start)) {
        return [];
      }
      const entries: string[] = [];
      const walk = (directory: string): void => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort()) {
          const entryPath = path.join(directory, entry.name);
          entries.push(path.relative(root, entryPath));
          if (entry.isDirectory()) {
            walk(entryPath);
          }
        }
      };
      walk(start);
      return entries.sort();
    },
    cleanup: (): void => {
      fs.rmSync(root, { recursive: true, force: true });
      if (userHome !== undefined) fs.rmSync(userHome, { recursive: true, force: true });
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
  workspaceRoot: string,
  fixture: LocalSkillFixture,
): string => {
  const packageRoot = path.join(workspaceRoot, "vendor", fixture.name);
  fs.mkdirSync(packageRoot, { recursive: true });
  const description = fixture.description ?? `The ${fixture.name} skill.`;
  fs.writeFileSync(
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
  fs.mkdirSync(path.join(packageRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "src", "SKILL.md"),
    `---\nname: "${fixture.name}"\ndescription: "${description}"\n---\n\n# ${fixture.name}\n\n${fixture.body ?? description}\n`,
  );
  return packageRoot;
};
