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
  AXM_MCP_METADATA_KEY,
  buildAxmMcpMetadataFromSettingsSource,
  configuredMcpCapability,
  isAxmManagedMcpEntry,
  readNativeMcpConfig,
  readNativeMcpEntry,
  readNativeMcpServers,
  resolveAgentMcpConfigTargetPath,
  writeAgentMcpConfig,
  NativeWriteAuthority,
} from "../../projection/agent-adapters/index.js";
import { SettingsReader, SettingsWriter, WorkspaceLocation } from "../../desired-state/index.js";
import type { SettingsReaderService, WorkspaceLocationService } from "../../desired-state/index.js";
import type { McpServerEntry } from "../../desired-state/index.js";
import type { NativeFormatFailure } from "../../projection/agent-adapters/index.js";
import { workspaceFailureToStepFailure } from "../../reconciliation/failure-rendering.js";
import { runWorkspaceTransaction } from "../../transitions/settlement/index.js";
import { WorkspaceConfigurationFailed } from "../errors.js";
import type { McpImportAdoption, McpImportCandidate, McpImportSource } from "./preflight.js";

const nativeFailureToConfigurationFailed = (
  failure: NativeFormatFailure,
): WorkspaceConfigurationFailed => {
  const rendered = workspaceFailureToStepFailure(failure);
  return new WorkspaceConfigurationFailed({
    category:
      rendered.category === "validation" ||
      rendered.category === "conflict" ||
      rendered.category === "usage"
        ? rendered.category
        : "internal",
    detail: rendered.detail,
    cause: failure,
  });
};

const readFailureToConfigurationFailed = (failure: {
  readonly _tag: "McpConfigInvalid" | "McpConfigIoFailed";
  readonly detail: string;
}): WorkspaceConfigurationFailed =>
  new WorkspaceConfigurationFailed({
    category: failure._tag === "McpConfigInvalid" ? "validation" : "internal",
    detail: failure.detail,
    cause: failure,
  });

/**
 * Discover the native MCP config sources the configured agents contribute for
 * this workspace scope, with unsupported-format findings.
 */
export const collectMcpImportSources = (
  location: WorkspaceLocationService,
  settings: SettingsReaderService,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const sources: Array<McpImportSource> = [];
    const skipped = new Map<string, { readonly name: string; readonly reason: string }>();
    const sourceKeys = new Set<string>();
    const addSource = (
      filePath: string,
      serversKey: McpImportSource["serversKey"],
      target: McpImportSource["target"],
      agentId: string,
    ) => {
      const sourceKey = `${agentId}\0${filePath}\0${serversKey}`;
      if (sourceKeys.has(sourceKey)) return Effect.void;
      sourceKeys.add(sourceKey);
      return Effect.gen(function* () {
        const raw = yield* readNativeMcpConfig(filePath).pipe(
          Effect.mapError(readFailureToConfigurationFailed),
        );
        if (Option.isNone(raw)) return;
        const servers = yield* readNativeMcpServers({
          format: target.format,
          configPath: filePath,
          raw: raw.value,
          serversKey,
        }).pipe(Effect.mapError(readFailureToConfigurationFailed));
        sources.push({ filePath, serversKey, target, servers });
      });
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
        const configPath = yield* resolveAgentMcpConfigTargetPath(location.baseDir, target).pipe(
          Effect.mapError(readFailureToConfigurationFailed),
        );
        if (target.format === "toml") {
          const exists = yield* fs.exists(configPath).pipe(
            Effect.mapError(
              (cause) =>
                new WorkspaceConfigurationFailed({
                  category: "internal",
                  detail: `Failed to inspect MCP config: ${configPath}`,
                  cause,
                }),
            ),
          );
          if (exists) {
            const finding = {
              name: path.relative(location.baseDir, configPath),
              reason: "TOML MCP entries are fenced regions and cannot be adopted in place",
            };
            skipped.set(`${finding.name}\0${finding.reason}`, finding);
          }
          continue;
        }
        yield* addSource(configPath, mcpConfig.serversKey, target, agentId);
      }
    }
    return { sources, skipped: Array.from(skipped.values()) };
  });

const adoptNativeMcpEntry = (
  location: WorkspaceLocationService,
  adoption: McpImportAdoption,
): Effect.Effect<
  void,
  WorkspaceConfigurationFailed,
  FileSystem.FileSystem | Path.Path | NativeWriteAuthority
> =>
  Effect.gen(function* () {
    const raw = yield* readNativeMcpConfig(adoption.filePath).pipe(
      Effect.mapError(readFailureToConfigurationFailed),
    );
    const entry = Option.isNone(raw)
      ? Option.none()
      : yield* readNativeMcpEntry({
          format: adoption.target.format,
          configPath: adoption.filePath,
          raw: raw.value,
          serversKey: adoption.serversKey,
          serverName: adoption.name,
        }).pipe(Effect.mapError(readFailureToConfigurationFailed));
    if (Option.isNone(entry)) {
      return yield* new WorkspaceConfigurationFailed({
        category: "conflict",
        detail: `MCP server ${adoption.name} changed before import`,
      });
    }
    yield* writeAgentMcpConfig({
      workspaceRoot: location.baseDir,
      serverName: adoption.name,
      serversKey: adoption.serversKey,
      target: adoption.target,
      entry: {
        ...entry.value,
        [AXM_MCP_METADATA_KEY]: buildAxmMcpMetadataFromSettingsSource("inline", adoption.name),
      },
    }).pipe(Effect.mapError(nativeFailureToConfigurationFailed));
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
  adoption: McpImportAdoption,
): Effect.Effect<void, WorkspaceConfigurationFailed, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const raw = yield* readNativeMcpConfig(adoption.filePath).pipe(
      Effect.mapError(readFailureToConfigurationFailed),
    );
    const entry = Option.isNone(raw)
      ? Option.none()
      : yield* readNativeMcpEntry({
          format: adoption.target.format,
          configPath: adoption.filePath,
          raw: raw.value,
          serversKey: adoption.serversKey,
          serverName: adoption.name,
        }).pipe(Effect.mapError(readFailureToConfigurationFailed));
    if (Option.isNone(entry) || !isAxmManagedMcpEntry(entry.value)) {
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
export const applyMcpImport = (candidates: ReadonlyArray<McpImportCandidate>) => {
  const adoptions = candidates.flatMap((candidate) => candidate.adoptions);
  const settingsEntry = (candidate: McpImportCandidate): McpServerEntry => ({
    kind: "inline",
    ...(candidate.definition.type === "stdio"
      ? { command: candidate.definition.command, args: candidate.definition.args }
      : { url: candidate.definition.url, headers: candidate.definition.headers }),
    env: candidate.env,
    enabled: true,
  });
  return Effect.gen(function* () {
    const settings = yield* SettingsReader;
    const settingsWriter = yield* SettingsWriter;
    const location = yield* WorkspaceLocation;
    return yield* runWorkspaceTransaction({
      targets: Array.from(new Set(adoptions.map((adoption) => adoption.filePath))).sort(),
      transition: Effect.gen(function* () {
        for (const candidate of candidates) {
          yield* settingsWriter.setEntry("mcp-server", candidate.name, settingsEntry(candidate));
        }
        for (const adoption of adoptions) {
          yield* adoptNativeMcpEntry(location, adoption);
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
          yield* Effect.forEach(adoptions, validateAdoption, {
            concurrency: 1,
          });
        }),
    });
  });
};
