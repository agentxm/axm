import { Command, Flag } from "effect/unstable/cli";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { AGENTS_BY_ID, type AgentId } from "@agentxm/client-core/unstable/agent-capabilities";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import {
  forceFlag,
  previewFlag,
  Verbosity,
  yesFlag,
} from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { CliRenderer, count } from "@agentxm/client-core/unstable/cli-renderer";
import {
  AXM_MCP_METADATA_KEY,
  buildAxmMcpMetadataFromSettingsSource,
  isAxmManagedMcpEntry,
} from "@agentxm/client-core/unstable/mcps";
import type { McpServerLockEntry } from "@agentxm/client-core/unstable/lockfile";
import {
  type CompletedJobStep,
  type ExecutedPlan,
  type JobStepArtifact,
  type JobStepResult,
  type Plan,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import {
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "@agentxm/client-core/unstable/workspace";
import { emitPlanResolutionResult } from "../../json-output.js";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { emitNoOpOutcome } from "../shared/no-op-output.js";

export interface McpsImportArgs {
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}

interface ImportedMcpServer {
  readonly name: string;
  readonly lockEntry: McpServerLockEntry;
  readonly env: Readonly<Record<string, string>>;
  readonly adoptions: ReadonlyArray<ImportedMcpServerAdoption>;
}

interface ImportedMcpServerAdoption {
  readonly filePath: string;
  readonly serversKey: string;
  readonly name: string;
}

interface AgentMcpConfig {
  readonly serversKey: string;
  readonly targets: ReadonlyArray<AgentMcpConfigTarget>;
}

interface AgentMcpConfigTarget {
  readonly scope: string;
  readonly path: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringArray = (value: unknown): ReadonlyArray<string> =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const stringRecord = (value: unknown): Readonly<Record<string, string>> => {
  if (!isRecord(value)) return {};
  const record: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") record[key] = item;
  }
  return record;
};

const isCapabilityAgentId = (id: string): id is AgentId => Object.hasOwn(AGENTS_BY_ID, id);

const readAgentMcpConfig = (agent: unknown): Option.Option<AgentMcpConfig> => {
  if (!isRecord(agent)) return Option.none();
  const mcp = agent["mcp"];
  if (!isRecord(mcp)) return Option.none();
  const config = mcp["config"];
  if (!isRecord(config)) return Option.none();
  const serversKey = config["serversKey"];
  const targets = config["targets"];
  if (typeof serversKey !== "string" || !Array.isArray(targets)) return Option.none();
  const parsedTargets: Array<AgentMcpConfigTarget> = [];
  for (const target of targets) {
    if (!isRecord(target)) continue;
    const scope = target["scope"];
    const targetPath = target["path"];
    if (typeof scope === "string" && typeof targetPath === "string") {
      parsedTargets.push({ scope, path: targetPath });
    }
  }
  return Option.some({ serversKey, targets: parsedTargets });
};

const readJsonObject = (
  fs: FileSystem.FileSystem,
  filePath: string,
): Effect.Effect<Option.Option<Readonly<Record<string, unknown>>>, AppError> =>
  Effect.gen(function* () {
    const exists = yield* fs.exists(filePath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return Option.none();
    const raw = yield* fs.readFileString(filePath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "internal",
          detail: `Failed to read MCP config: ${filePath}`,
          cause: error,
        }),
      ),
    );
    const parsed = yield* Effect.try({
      try: (): unknown => JSON.parse(raw),
      catch: (cause) =>
        makeAppError({
          code: "validation",
          detail: `Invalid JSON in MCP config: ${filePath}`,
          cause,
        }),
    });
    return isRecord(parsed) ? Option.some(parsed) : Option.none();
  });

const envRefsFromRecord = (
  env: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> =>
  Object.fromEntries(Object.keys(env).map((name) => [name, `\${${name}}`]));

const normalizeStdio = (
  name: string,
  config: Readonly<Record<string, unknown>>,
  adoption: ImportedMcpServerAdoption,
  now: DateTime.Utc,
): Option.Option<ImportedMcpServer> => {
  const commandValue = config["command"];
  const env = envRefsFromRecord(stringRecord(config["env"] ?? config["environment"]));
  if (typeof commandValue === "string") {
    return Option.some({
      name,
      lockEntry: {
        type: "inline",
        command: commandValue,
        args: stringArray(config["args"]),
        installedAt: now,
        updatedAt: now,
      } satisfies McpServerLockEntry,
      env,
      adoptions: [adoption],
    });
  }
  const command = stringArray(commandValue);
  if (command.length === 0) return Option.none();
  const executable = command[0];
  if (executable === undefined) return Option.none();
  return Option.some({
    name,
    lockEntry: {
      type: "inline",
      command: executable,
      args: command.slice(1),
      installedAt: now,
      updatedAt: now,
    } satisfies McpServerLockEntry,
    env,
    adoptions: [adoption],
  });
};

const normalizeRemote = (
  name: string,
  config: Readonly<Record<string, unknown>>,
  adoption: ImportedMcpServerAdoption,
  now: DateTime.Utc,
): Option.Option<ImportedMcpServer> => {
  const url = config["url"];
  if (typeof url !== "string") return Option.none();
  return Option.some({
    name,
    lockEntry: {
      type: "inline",
      url,
      headers: stringRecord(config["headers"] ?? config["http_headers"]),
      installedAt: now,
      updatedAt: now,
    } satisfies McpServerLockEntry,
    env: {},
    adoptions: [adoption],
  });
};

const normalizeServer = (
  name: string,
  config: Readonly<Record<string, unknown>>,
  adoption: ImportedMcpServerAdoption,
  now: DateTime.Utc,
): Option.Option<ImportedMcpServer> => {
  if (isAxmManagedMcpEntry(config)) return Option.none();
  const remote = normalizeRemote(name, config, adoption, now);
  if (Option.isSome(remote)) return remote;
  return normalizeStdio(name, config, adoption, now);
};

const collectFromConfig = (
  config: Readonly<Record<string, unknown>>,
  serversKey: string,
  filePath: string,
  now: DateTime.Utc,
): ReadonlyArray<ImportedMcpServer> => {
  const servers = config[serversKey];
  if (!isRecord(servers)) return [];
  return Object.entries(servers)
    .map(([name, value]) =>
      isRecord(value)
        ? normalizeServer(name, value, { filePath, serversKey, name }, now)
        : Option.none(),
    )
    .filter(Option.isSome)
    .map((entry) => entry.value);
};

const writeAdoptedMcpConfig = (
  fs: FileSystem.FileSystem,
  adoption: ImportedMcpServerAdoption,
): Effect.Effect<void, AppError> =>
  Effect.gen(function* () {
    const config = yield* readJsonObject(fs, adoption.filePath);
    if (Option.isNone(config)) return;
    const servers = config.value[adoption.serversKey];
    if (!isRecord(servers)) return;
    const entry = servers[adoption.name];
    if (!isRecord(entry) || isAxmManagedMcpEntry(entry)) return;
    const updatedConfig = {
      ...config.value,
      [adoption.serversKey]: {
        ...servers,
        [adoption.name]: {
          ...entry,
          [AXM_MCP_METADATA_KEY]: buildAxmMcpMetadataFromSettingsSource("inline"),
        },
      },
    };
    yield* fs
      .writeFileString(adoption.filePath, `${JSON.stringify(updatedConfig, null, 2)}\n`)
      .pipe(
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
            detail: `Failed to write MCP config: ${adoption.filePath}`,
            cause: error,
          }),
        ),
      );
  });

const adoptImportedMcpServerConfigs = (
  fs: FileSystem.FileSystem,
  server: ImportedMcpServer,
): Effect.Effect<void, AppError> =>
  Effect.forEach(server.adoptions, (adoption) => writeAdoptedMcpConfig(fs, adoption), {
    concurrency: "unbounded",
  }).pipe(Effect.asVoid);

const collectImportableServers = (
  ws: WorkspaceMutationsService,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<ReadonlyArray<ImportedMcpServer>, AppError> =>
  Effect.gen(function* () {
    const now = yield* DateTime.now;
    const configured = yield* ws.getConfiguredMcpServerEntries();
    const configuredNames = new Set(Object.keys(configured));
    const imports: Array<ImportedMcpServer> = [];
    const addNew = (servers: ReadonlyArray<ImportedMcpServer>) => {
      for (const server of servers) {
        if (configuredNames.has(server.name)) continue;
        const existingIndex = imports.findIndex((item) => item.name === server.name);
        const existing = imports[existingIndex];
        if (existing === undefined) {
          imports.push(server);
        } else {
          imports[existingIndex] = {
            ...existing,
            adoptions: [...existing.adoptions, ...server.adoptions],
          };
        }
      }
    };

    const workspaceConfigPath = path.join(ws.baseDir, ".mcp.json");
    const workspaceConfig = yield* readJsonObject(fs, workspaceConfigPath);
    if (Option.isSome(workspaceConfig))
      addNew(collectFromConfig(workspaceConfig.value, "mcpServers", workspaceConfigPath, now));

    const agentIds = yield* ws.getConfiguredAgents();
    for (const agentId of agentIds) {
      if (!isCapabilityAgentId(agentId)) continue;
      const agent = AGENTS_BY_ID[agentId];
      const mcpConfig = readAgentMcpConfig(agent);
      if (Option.isNone(mcpConfig)) continue;
      const targets = mcpConfig.value.targets.filter((target) => target.scope === ws.scope);
      for (const target of targets) {
        const configPath = path.resolve(ws.baseDir, target.path);
        const config = yield* readJsonObject(fs, configPath);
        if (Option.isSome(config))
          addNew(collectFromConfig(config.value, mcpConfig.value.serversKey, configPath, now));
      }
    }
    return imports;
  });

const makePlan = (
  servers: ReadonlyArray<ImportedMcpServer>,
  ws: WorkspaceMutationsService,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Plan => ({
  _tag: "Plan",
  name: "Import MCP servers",
  description: Option.some(`Adopt ${count(servers.length, "unmanaged MCP server")}`),
  jobs: [
    {
      concurrency: 1,
      steps: servers.map<PlannedJobStep>((server) => ({
        label: server.name,
        readiness: "ready",
        run: ws
          .setMcpServer({
            name: server.name,
            lockEntry: server.lockEntry,
            versionRange: Option.none(),
            env: server.env,
            enabled: true,
          })
          .pipe(
            Effect.flatMap(() => adoptImportedMcpServerConfigs(fs, server)),
            Effect.as({
              result: "success",
              message: `Imported ${server.name}`,
              artifact: importArtifact(ws.scope, server, ws.baseDir, path),
            } satisfies JobStepResult),
          ),
      })),
    },
  ],
});

const importArtifact = (
  scope: "project" | "user",
  server: ImportedMcpServer,
  baseDir: string,
  path: Path.Path,
): JobStepArtifact => ({
  path: `.axm/settings.json:mcpServers.${server.name}`,
  scope,
  change: "created",
  fileCount: 2 + server.adoptions.length,
  targets: [
    { path: ".axm (config/lockfile)", change: "updated" },
    ...server.adoptions.map((adoption) => ({
      path: path.relative(baseDir, adoption.filePath),
      change: "updated" as const,
    })),
  ],
});

const formatArtifactTargets = (artifact: JobStepArtifact): string => {
  if (artifact.targets === undefined || artifact.targets.length === 0) {
    return artifact.path;
  }
  return artifact.targets.map((target) => `${target.path} (${target.change})`).join(", ");
};

const formatCompletedArtifactStep = (step: CompletedJobStep): string | undefined => {
  if (step.result.result !== "success" || step.result.artifact === undefined) return undefined;
  const artifact = step.result.artifact;
  const details = [
    artifact.change,
    artifact.fileCount === undefined ? undefined : count(artifact.fileCount, "file"),
    formatArtifactTargets(artifact),
  ].filter((part): part is string => part !== undefined && part.length > 0);
  return `${step.label}   ${details.join("   ")}`;
};

const summarizeExecutedArtifacts = (plan: ExecutedPlan): string | undefined => {
  const rows = plan.jobs
    .flatMap((job) => job.steps)
    .flatMap((step) => {
      const summary = formatCompletedArtifactStep(step);
      return summary === undefined ? [] : [summary];
    });
  return rows.length === 0 ? undefined : rows.join("\n");
};

export const handleMcpsImport = Effect.fn("Mcps.import")(function* (args: McpsImportArgs) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const servers = yield* collectImportableServers(ws, fs, path);

  if (servers.length === 0) {
    yield* emitNoOpOutcome("mcps.import", {
      planName: "Import MCP servers",
      message: "No unmanaged MCP servers imported.",
      withoutSuggestions: true,
    });
    return;
  }

  const plan = makePlan(servers, ws, fs, path);
  const resolution = yield* previewOrApplyLocalPlan(plan, {
    preview: args.preview,
    displayApplied: false,
  });
  const summary =
    resolution._tag === "ExecutedPlan" ? summarizeExecutedArtifacts(resolution) : undefined;
  const suggestions = [
    { description: "Inspect MCP servers", cmd: "axm mcps list" },
    ...(servers.length === 1
      ? [{ description: "Undo", cmd: `axm mcps uninstall ${servers[0]?.name ?? ""}` }]
      : []),
  ];
  const resultOptions = summary === undefined ? { suggestions } : { summary, suggestions };
  const emitted = yield* emitPlanResolutionResult(
    "mcps.import",
    resolution,
    resolution._tag === "ExecutedPlan" ? resultOptions : undefined,
  );

  if (resolution._tag === "ExecutedPlan") {
    const renderer = yield* CliRenderer;
    const verbosity = yield* Verbosity;
    const successOptions =
      summary === undefined
        ? { suggestions, withoutSuggestions: emitted }
        : { summary, suggestions, withoutSuggestions: emitted };
    yield* renderer.success(
      `Imported ${count(servers.length, "MCP server")}`,
      verbosity.level === "quiet" ? undefined : successOptions,
    );
  }
});

const importConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Import to project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Apply without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Apply even if the plan has unresolved warnings")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without applying")),
} as const;

export const importCommand = Command.make(
  "import",
  importConfig,
  ({ scope, yes, force, preview }) =>
    handleMcpsImport({ yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("mcps import"),
    ),
).pipe(
  withArgvTracking(importConfig),
  Command.withDescription("Import unmanaged MCP servers as inline settings entries"),
  Command.withExamples([
    {
      command: "axm mcps import",
      description: "Adopt unmanaged MCP servers from workspace and configured agent MCP configs",
    },
    {
      command: "axm mcps import --preview",
      description: "Preview unmanaged MCP server adoption",
    },
  ]),
);
