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
  buildAxmMcpMetadataFromSettingsSource,
  configuredMcpCapability,
} from "../../projection/agent-adapters/index.js";
import type {
  SettingsReaderService,
  SettingsWriterService,
  WorkspaceLocationService,
} from "../../desired-state/index.js";
import {
  AXM_MCP_METADATA_KEY,
  isAxmManagedMcpEntry,
} from "../../projection/agent-adapters/index.js";
import type { McpServerEntry } from "../../desired-state/index.js";
import { runWorkspaceTransaction } from "../../transitions/settlement/index.js";
import { WorkspaceConfigurationFailed } from "../errors.js";
import type { McpImportAdoption, McpImportCandidate, McpImportSource } from "./preflight.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
  location: WorkspaceLocationService,
  settings: SettingsReaderService,
  fs: FileSystem.FileSystem,
  path: Path.Path,
) =>
  Effect.gen(function* () {
    const sources: Array<McpImportSource> = [];
    const skipped = new Map<string, { readonly name: string; readonly reason: string }>();
    const sourceKeys = new Set<string>();
    const addSource = (filePath: string, serversKey: string, agentId: string) => {
      const sourceKey = `${agentId}\0${filePath}\0${serversKey}`;
      if (sourceKeys.has(sourceKey)) return Effect.void;
      sourceKeys.add(sourceKey);
      return readJsonObject(fs, filePath).pipe(
        Effect.map(
          Option.match({
            onNone: () => undefined,
            onSome: (config) => sources.push({ filePath, serversKey, config }),
          }),
        ),
      );
    };

    const agentIds = [...(yield* settings.configuredAgents)].sort((left, right) =>
      left.localeCompare(right),
    );
    for (const agentId of agentIds) {
      const mcpConfig = configuredMcpCapability(agentId)?.axm.writer.config;
      if (mcpConfig === undefined) continue;
      const targets = mcpConfig.targets
        .filter((target) => target.scope === location.scope)
        .sort((left, right) => left.path.localeCompare(right.path));
      for (const target of targets) {
        const relativeTarget = target.path.startsWith("~/") ? target.path.slice(2) : target.path;
        const configPath = path.resolve(location.baseDir, relativeTarget);
        if (target.format !== "json") {
          const exists = yield* fs
            .exists(configPath)
            .pipe(Effect.catch(() => Effect.succeed(false)));
          if (exists) {
            const finding = {
              name: path.relative(location.baseDir, configPath),
              reason: `Unsupported MCP config format: ${target.format}`,
            };
            skipped.set(`${finding.name}\0${finding.reason}`, finding);
          }
          continue;
        }
        yield* addSource(configPath, mcpConfig.serversKey, agentId);
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
  recordsEqual(entry.env, candidate.env);

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
export const applyMcpImport = (
  candidates: ReadonlyArray<McpImportCandidate>,
  settings: SettingsReaderService,
  settingsWriter: SettingsWriterService,
  fs: FileSystem.FileSystem,
) => {
  const adoptions = candidates.flatMap((candidate) => candidate.adoptions);
  const settingsEntry = (candidate: McpImportCandidate): McpServerEntry => ({
    kind: "inline",
    ...(candidate.definition.type === "stdio"
      ? { command: candidate.definition.command, args: candidate.definition.args }
      : { url: candidate.definition.url, headers: candidate.definition.headers }),
    env: candidate.env,
    enabled: true,
  });
  return runWorkspaceTransaction({
    targets: Array.from(new Set(adoptions.map((adoption) => adoption.filePath))).sort(),
    transition: Effect.gen(function* () {
      for (const candidate of candidates) {
        yield* settingsWriter.setEntry("mcp-server", candidate.name, settingsEntry(candidate));
      }
      for (const adoption of adoptions) {
        yield* writeAdoptedMcpConfig(fs, adoption);
      }
    }),
    validate: () =>
      Effect.gen(function* () {
        const configured = yield* settings.entries("mcp-server");
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
