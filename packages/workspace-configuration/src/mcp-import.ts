/**
 * Inline MCP adoption policy: discover import sources from configured agents'
 * native MCP configs, rewrite adopted entries with AXM management metadata,
 * remove entries converted into managed packages, and apply an inline import
 * as one validated workspace transaction. Prompting, planning, and rendering
 * stay with the application.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  CONFIGURABLE_AGENTS_BY_ID,
  type ConfigurableAgentId,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { buildAxmMcpMetadataFromSettingsSource } from "@agentxm/extension-workspace";
import {
  AXM_MCP_METADATA_KEY,
  isAxmManagedMcpEntry,
  type WorkspaceMutationsService,
} from "@agentxm/workspace-state";
import type { McpServerEntry } from "@agentxm/workspace-state";
import { WorkspaceConfigurationFailed } from "./errors.js";
import type {
  McpImportAdoption,
  McpImportCandidate,
  McpImportSource,
} from "./mcp-import-preflight.js";

interface AgentMcpConfig {
  readonly serversKey: string;
  readonly targets: ReadonlyArray<AgentMcpConfigTarget>;
}

interface AgentMcpConfigTarget {
  readonly scope: string;
  readonly path: string;
  readonly format: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCapabilityAgentId = (id: string): id is ConfigurableAgentId =>
  Object.hasOwn(CONFIGURABLE_AGENTS_BY_ID, id);

const readAgentMcpConfig = (agent: unknown): Option.Option<AgentMcpConfig> => {
  if (!isRecord(agent)) return Option.none();
  const capabilities = agent["capabilities"];
  if (!isRecord(capabilities)) return Option.none();
  const mcp = capabilities["mcp-server"];
  if (!isRecord(mcp)) return Option.none();
  const axm = mcp["axm"];
  if (!isRecord(axm)) return Option.none();
  const writer = axm["writer"];
  if (!isRecord(writer)) return Option.none();
  const config = writer["config"];
  if (!isRecord(config)) return Option.none();
  const serversKey = config["serversKey"];
  const targets = config["targets"];
  if (typeof serversKey !== "string" || !Array.isArray(targets)) return Option.none();
  const parsedTargets: Array<AgentMcpConfigTarget> = [];
  for (const target of targets) {
    if (!isRecord(target)) continue;
    const scope = target["scope"];
    const targetPath = target["path"];
    const format = target["format"];
    if (typeof scope === "string" && typeof targetPath === "string" && typeof format === "string") {
      parsedTargets.push({ scope, path: targetPath, format });
    }
  }
  return Option.some({ serversKey, targets: parsedTargets });
};

const readJsonObject = (
  fs: FileSystem.FileSystem,
  filePath: string,
): Effect.Effect<Option.Option<Readonly<Record<string, unknown>>>, WorkspaceConfigurationFailed> =>
  Effect.gen(function* () {
    const exists = yield* fs.exists(filePath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) return Option.none();
    const raw = yield* fs.readFileString(filePath).pipe(
      Effect.mapError(
        (error) =>
          new WorkspaceConfigurationFailed({
            category: "internal",
            detail: `Failed to read MCP config: ${filePath}`,
            cause: error,
          }),
      ),
    );
    const parsed = yield* Effect.try({
      try: (): unknown => JSON.parse(raw),
      catch: (cause) =>
        new WorkspaceConfigurationFailed({
          category: "validation",
          detail: `Invalid JSON in MCP config: ${filePath}`,
          cause,
        }),
    });
    return isRecord(parsed) ? Option.some(parsed) : Option.none();
  });

/**
 * Discover the native MCP config sources the configured agents contribute for
 * this workspace scope, with unsupported-format findings.
 */
export const collectMcpImportSources = (
  ws: WorkspaceMutationsService,
  fs: FileSystem.FileSystem,
  path: Path.Path,
) =>
  Effect.gen(function* () {
    const sources: Array<McpImportSource> = [];
    const skipped = new Map<string, { readonly name: string; readonly reason: string }>();
    const sourceKeys = new Set<string>();
    const addSource = (filePath: string, serversKey: string, agentId: ConfigurableAgentId) => {
      const sourceKey = `${agentId}\0${filePath}\0${serversKey}`;
      if (sourceKeys.has(sourceKey)) return Effect.void;
      sourceKeys.add(sourceKey);
      return readJsonObject(fs, filePath).pipe(
        Effect.map(
          Option.match({
            onNone: () => undefined,
            onSome: (config) => sources.push({ filePath, serversKey, config, agents: [agentId] }),
          }),
        ),
      );
    };

    const agentIds = [...(yield* ws.getConfiguredAgents())].sort((left, right) =>
      left.localeCompare(right),
    );
    for (const agentId of agentIds) {
      if (!isCapabilityAgentId(agentId)) continue;
      const mcpConfig = readAgentMcpConfig(CONFIGURABLE_AGENTS_BY_ID[agentId]);
      if (Option.isNone(mcpConfig)) continue;
      const targets = mcpConfig.value.targets
        .filter((target) => target.scope === ws.scope)
        .sort((left, right) => left.path.localeCompare(right.path));
      for (const target of targets) {
        const relativeTarget = target.path.startsWith("~/") ? target.path.slice(2) : target.path;
        const configPath = path.resolve(ws.baseDir, relativeTarget);
        if (target.format !== "json") {
          const exists = yield* fs
            .exists(configPath)
            .pipe(Effect.catch(() => Effect.succeed(false)));
          if (exists) {
            const finding = {
              name: path.relative(ws.baseDir, configPath),
              reason: `Unsupported MCP config format: ${target.format}`,
            };
            skipped.set(`${finding.name}\0${finding.reason}`, finding);
          }
          continue;
        }
        yield* addSource(configPath, mcpConfig.value.serversKey, agentId);
      }
    }
    return { sources, skipped: Array.from(skipped.values()) };
  });

const writeAdoptedMcpConfig = (
  fs: FileSystem.FileSystem,
  adoption: McpImportAdoption,
): Effect.Effect<void, WorkspaceConfigurationFailed> =>
  Effect.gen(function* () {
    const config = yield* readJsonObject(fs, adoption.filePath);
    if (Option.isNone(config)) {
      return yield* new WorkspaceConfigurationFailed({
        category: "conflict",
        detail: `MCP config disappeared before import: ${adoption.filePath}`,
      });
    }
    const servers = config.value[adoption.serversKey];
    const entry = isRecord(servers) ? servers[adoption.name] : undefined;
    if (!isRecord(servers) || !isRecord(entry)) {
      return yield* new WorkspaceConfigurationFailed({
        category: "conflict",
        detail: `MCP server ${adoption.name} changed before import`,
      });
    }
    const updatedConfig = {
      ...config.value,
      [adoption.serversKey]: {
        ...servers,
        [adoption.name]: {
          ...entry,
          [AXM_MCP_METADATA_KEY]: buildAxmMcpMetadataFromSettingsSource("inline", adoption.name),
        },
      },
    };
    yield* fs
      .writeFileString(adoption.filePath, `${JSON.stringify(updatedConfig, null, 2)}\n`)
      .pipe(
        Effect.mapError(
          (error) =>
            new WorkspaceConfigurationFailed({
              category: "internal",
              detail: `Failed to write MCP config: ${adoption.filePath}`,
              cause: error,
            }),
        ),
      );
  });

/**
 * Remove a native entry converted into a managed package, refusing when the
 * native config changed since the conversion was planned.
 */
export const removeConvertedMcpConfig = (
  fs: FileSystem.FileSystem,
  adoption: McpImportAdoption,
): Effect.Effect<void, WorkspaceConfigurationFailed> =>
  Effect.gen(function* () {
    const config = yield* readJsonObject(fs, adoption.filePath);
    if (Option.isNone(config)) {
      return yield* new WorkspaceConfigurationFailed({
        category: "conflict",
        detail: `MCP config disappeared before package conversion: ${adoption.filePath}`,
      });
    }
    const servers = config.value[adoption.serversKey];
    if (!isRecord(servers)) {
      return yield* new WorkspaceConfigurationFailed({
        category: "conflict",
        detail: `MCP server collection changed before package conversion: ${adoption.filePath}`,
      });
    }
    const entry = servers[adoption.name];
    if (entry === undefined) return;
    if (!isRecord(entry)) {
      return yield* new WorkspaceConfigurationFailed({
        category: "conflict",
        detail: `MCP server ${adoption.name} changed before package conversion`,
      });
    }
    const remainingServers = Object.fromEntries(
      Object.entries(servers).filter(([name]) => name !== adoption.name),
    );
    const updatedConfig = {
      ...config.value,
      [adoption.serversKey]: remainingServers,
    };
    yield* fs
      .writeFileString(adoption.filePath, `${JSON.stringify(updatedConfig, null, 2)}\n`)
      .pipe(
        Effect.mapError(
          (error) =>
            new WorkspaceConfigurationFailed({
              category: "internal",
              detail: `Failed to replace native MCP config: ${adoption.filePath}`,
              cause: error,
            }),
        ),
      );
  });

const recordsEqual = (
  left: Readonly<Record<string, string>> | undefined,
  right: Readonly<Record<string, string>> | undefined,
): boolean => {
  const leftEntries = Object.entries(left ?? {}).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  );
  const rightEntries = Object.entries(right ?? {}).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  );
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([key, value], index) => {
      const rightEntry = rightEntries[index];
      return rightEntry !== undefined && key === rightEntry[0] && value === rightEntry[1];
    })
  );
};

const arraysEqual = (
  left: ReadonlyArray<string> | undefined,
  right: ReadonlyArray<string> | undefined,
): boolean =>
  JSON.stringify([...(left ?? [])].sort((a, b) => a.localeCompare(b))) ===
  JSON.stringify([...(right ?? [])].sort((a, b) => a.localeCompare(b)));

const candidateMatchesSettings = (
  candidate: McpImportCandidate,
  entry: McpServerEntry | undefined,
): boolean =>
  entry !== undefined &&
  entry.kind === "inline" &&
  entry.enabled &&
  entry.command ===
    (candidate.definition.type === "stdio" ? candidate.definition.command : undefined) &&
  JSON.stringify(entry.args ?? []) ===
    JSON.stringify(candidate.definition.type === "stdio" ? candidate.definition.args : []) &&
  entry.url === (candidate.definition.type === "http" ? candidate.definition.url : undefined) &&
  recordsEqual(
    entry.headers,
    candidate.definition.type === "http" ? candidate.definition.headers : undefined,
  ) &&
  recordsEqual(entry.env, candidate.env) &&
  arraysEqual(entry.agents, candidate.agents);

const validateAdoption = (
  fs: FileSystem.FileSystem,
  adoption: McpImportAdoption,
): Effect.Effect<void, WorkspaceConfigurationFailed> =>
  Effect.gen(function* () {
    const config = yield* readJsonObject(fs, adoption.filePath);
    const servers = Option.isSome(config) ? config.value[adoption.serversKey] : undefined;
    const entry = isRecord(servers) ? servers[adoption.name] : undefined;
    if (!isRecord(entry) || !isAxmManagedMcpEntry(entry)) {
      return yield* new WorkspaceConfigurationFailed({
        category: "validation",
        detail: `Failed to validate adopted MCP server ${adoption.name}`,
      });
    }
  });

/**
 * Adopt the losslessly importable candidates as inline settings entries and
 * mark their native entries as AXM-managed, in one validated workspace
 * transaction.
 */
export const applyMcpImport = <HookError = never>(
  candidates: ReadonlyArray<McpImportCandidate>,
  ws: WorkspaceMutationsService,
  fs: FileSystem.FileSystem,
  hooks: {
    readonly beforeAdoptionWrite?: (adoption: McpImportAdoption) => Effect.Effect<void, HookError>;
  } = {},
) => {
  const adoptions = candidates.flatMap((candidate) => candidate.adoptions);
  const settingsEntry = (candidate: McpImportCandidate): McpServerEntry => ({
    kind: "inline",
    ...(candidate.definition.type === "stdio"
      ? { command: candidate.definition.command, args: candidate.definition.args }
      : { url: candidate.definition.url, headers: candidate.definition.headers }),
    env: candidate.env,
    enabled: true,
    ...(candidate.agents === undefined ? {} : { agents: candidate.agents }),
  });
  return ws.runTransaction({
    targets: Array.from(new Set(adoptions.map((adoption) => adoption.filePath))).sort(),
    transition: Effect.gen(function* () {
      for (const candidate of candidates) {
        yield* ws.setMcpServerEntry(candidate.name, settingsEntry(candidate));
      }
      for (const adoption of adoptions) {
        if (hooks.beforeAdoptionWrite !== undefined) {
          yield* hooks.beforeAdoptionWrite(adoption);
        }
        yield* writeAdoptedMcpConfig(fs, adoption);
      }
    }),
    validate: () =>
      Effect.gen(function* () {
        const configured = yield* ws.getConfiguredMcpServerEntries();
        for (const candidate of candidates) {
          if (!candidateMatchesSettings(candidate, configured[candidate.name])) {
            return yield* new WorkspaceConfigurationFailed({
              category: "validation",
              detail: `Failed to validate imported MCP server ${candidate.name}`,
            });
          }
        }
        yield* Effect.forEach(adoptions, (adoption) => validateAdoption(fs, adoption), {
          concurrency: 1,
        });
      }),
  });
};
