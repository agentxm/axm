/**
 * Inline MCP adoption policy: discover import sources from configured agents'
 * native MCP configs, rewrite adopted entries with AXM management metadata,
 * remove entries converted into managed packages, and apply an inline import
 * as one validated workspace transaction. Prompting, planning, and rendering
 * stay with the application.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  CONFIGURABLE_AGENTS_BY_ID,
  type NativeConfigReadLocation,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  AXM_MCP_METADATA_KEY,
  buildAxmMcpMetadataFromSettingsSource,
  isConfigurableAgentId,
  isAxmManagedMcpEntry,
  readNativeMcpConfig,
  readNativeMcpEntry,
  readNativeMcpServers,
  resolveAgentMcpConfigTargetPath,
  writeAgentMcpConfig,
  validateInlineMcpServerTargets,
  syncInlineMcpServerToAgents,
  NativeWriteAuthority,
  type CodingAgentFailure,
} from "@agentxm/workspace-kernel/agent-adapters";
import {
  combineNativeLocationOutcomes,
  resolveNativeReadLocation,
  type NativeLocationOutcome,
} from "@agentxm/workspace-kernel/locations";
import {
  SettingsReader,
  SettingsWriter,
  WorkspaceLocation,
  type SettingsReaderService,
  type WorkspaceLocationService,
  type McpServerEntry,
} from "@agentxm/workspace-kernel/workspace-state";
import { kernelFailureToStepFailure } from "@agentxm/workspace-kernel/reconciliation";
import { runWorkspaceTransaction } from "@agentxm/workspace-kernel/settlement";
import { WorkspaceConfigurationFailed } from "../errors.js";
import type { McpImportAdoption, McpImportCandidate, McpImportSource } from "./preflight.js";

const nativeFailureToConfigurationFailed = (
  failure: CodingAgentFailure,
): WorkspaceConfigurationFailed => {
  const rendered = kernelFailureToStepFailure(failure);
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
      serversPath: McpImportSource["serversPath"],
      target: McpImportSource["target"],
      envExpansion: McpImportSource["envExpansion"],
    ) => {
      const sourceKey = JSON.stringify([filePath, serversPath]);
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
          serversPath,
        }).pipe(Effect.mapError(readFailureToConfigurationFailed));
        sources.push({
          filePath,
          serversPath,
          target,
          servers,
          ...(envExpansion === undefined ? {} : { envExpansion }),
        });
      });
    };

    const agentIds = [...(yield* settings.configuredAgents)].sort((left, right) =>
      left.localeCompare(right),
    );
    for (const agentId of agentIds) {
      if (!isConfigurableAgentId(agentId)) continue;
      const native = CONFIGURABLE_AGENTS_BY_ID[agentId].capabilities["mcp-server"].native;
      if (!("locations" in native)) continue;
      const declarations: ReadonlyArray<NativeConfigReadLocation> = native.locations;
      for (const declaration of [...declarations].sort((left, right) =>
        left.path.localeCompare(right.path),
      )) {
        const resolved = resolveNativeReadLocation(
          path,
          agentId,
          declaration,
          { workspaceRoot: location.baseDir, scope: location.scope },
          location.nativeDirectoryInputs,
        );
        if (resolved === undefined) continue;
        const serversPath = declaration.keyPath;
        if (serversPath === undefined) {
          const finding = {
            name: resolved.path,
            reason: "This native MCP servers-container path is not supported for import",
          };
          skipped.set(`${finding.name}\0${finding.reason}`, finding);
          continue;
        }
        const target = {
          scope: declaration.scope,
          nativeRoot: resolved.nativeRoot,
          path: resolved.path,
          format: declaration.format,
          attribution: declaration.attribution ?? ("agent" as const),
        };
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
        yield* addSource(
          configPath,
          serversPath,
          target,
          "mcpEnvExpansion" in native ? native.mcpEnvExpansion : undefined,
        );
      }
    }
    return { sources, skipped: Array.from(skipped.values()) };
  });

const adoptNativeMcpEntry = (
  location: WorkspaceLocationService,
  adoption: McpImportAdoption,
): Effect.Effect<
  ReadonlyArray<NativeLocationOutcome>,
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
          serversPath: adoption.serversPath,
          serverName: adoption.name,
        }).pipe(Effect.mapError(readFailureToConfigurationFailed));
    if (Option.isNone(entry) || !Equal.equals(entry.value, adoption.expectedEntry)) {
      return yield* new WorkspaceConfigurationFailed({
        category: "conflict",
        detail: `MCP server ${adoption.name} changed before import`,
      });
    }
    const result = yield* writeAgentMcpConfig({
      workspaceRoot: location.baseDir,
      serverName: adoption.name,
      serversPath: adoption.serversPath,
      target: adoption.target,
      nativeInsertionEligible: false,
      adoption: { filePath: adoption.filePath, expectedEntry: adoption.expectedEntry },
      entry: {
        ...entry.value,
        [AXM_MCP_METADATA_KEY]: buildAxmMcpMetadataFromSettingsSource("inline", adoption.name),
      },
    }).pipe(Effect.mapError(nativeFailureToConfigurationFailed));
    return result.targets.flatMap((target) =>
      target.nativeLocation === undefined ? [] : [target.nativeLocation],
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
          serversPath: adoption.serversPath,
          serverName: adoption.name,
        }).pipe(Effect.mapError(readFailureToConfigurationFailed));
    if (Option.isNone(entry) || !isAxmManagedMcpEntry(entry.value)) {
      return yield* new WorkspaceConfigurationFailed({
        category: "validation",
        detail: `Failed to validate adopted MCP server ${adoption.name}`,
      });
    }
  });

const settingsEntry = (candidate: McpImportCandidate): McpServerEntry => ({
  kind: "inline",
  ...(candidate.definition.type === "stdio"
    ? { command: candidate.definition.command, args: candidate.definition.args }
    : { url: candidate.definition.url, headers: candidate.definition.headers }),
  env: candidate.env,
  enabled: true,
});

/** Every configured reader is checked before adoption publishes any desired state. */
export const prepareMcpImportTargets = (candidates: ReadonlyArray<McpImportCandidate>) =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const path = yield* Path.Path;
    const agentIds = yield* (yield* SettingsReader).configuredAgents;
    const locations: Array<NativeLocationOutcome> = [];
    for (const candidate of candidates) {
      const plan = yield* validateInlineMcpServerTargets(agentIds, {
        nativeDirectoryInputs: location.nativeDirectoryInputs,
        workspaceRoot: location.baseDir,
        scope: location.scope,
        serverName: candidate.name,
        nativeInsertionEligible: false,
        entry: settingsEntry(candidate),
        adoptions: candidate.adoptions,
      }).pipe(Effect.mapError(nativeFailureToConfigurationFailed));
      for (const write of plan.writes)
        locations.push({
          scope: location.scope,
          address: {
            kind: "key-path",
            path: write.path,
            keys: [...write.config.serversPath, candidate.name],
          },
          aliases: [
            ...new Set(
              write.declaredTargets.map((target) =>
                path.resolve(
                  location.baseDir,
                  target.scope === "user" && target.path.startsWith("~/")
                    ? target.path.slice(2)
                    : target.path,
                ),
              ),
            ),
          ].sort(),
          configuredConsumers: write.agentIds,
          potentialReaders: [],
          policyReasons: [],
          ownership: "owned",
          proof: candidate.adoptions.some((adoption) => adoption.filePath === write.path)
            ? "explicit-adoption"
            : "proven-absence-or-managed-entry",
          state: "updated",
          mechanism: "structured-entry",
          availability: write.agentIds.map((agentId) => ({
            agentId,
            state: "unverified",
            reason:
              "Native representation validated; agent configuration selection is not observable",
          })),
        });
    }
    return combineNativeLocationOutcomes(locations);
  });

/**
 * Adopt the losslessly importable candidates as inline settings entries and
 * mark their native entries as AXM-managed, in one validated workspace
 * transaction.
 */
export const applyMcpImport = (candidates: ReadonlyArray<McpImportCandidate>) => {
  const adoptions = candidates.flatMap((candidate) => candidate.adoptions);
  return Effect.gen(function* () {
    const settings = yield* SettingsReader;
    const settingsWriter = yield* SettingsWriter;
    const location = yield* WorkspaceLocation;
    const planned = yield* prepareMcpImportTargets(candidates);
    const agentIds = yield* settings.configuredAgents;
    return yield* runWorkspaceTransaction({
      targets: Array.from(new Set(planned.map((target) => target.address.path))).sort(),
      transition: Effect.gen(function* () {
        const locations: Array<NativeLocationOutcome> = [];
        for (const candidate of candidates) {
          yield* settingsWriter.setEntry("mcp-server", candidate.name, settingsEntry(candidate), {
            roundTrip: false,
          });
        }
        for (const adoption of adoptions) {
          locations.push(...(yield* adoptNativeMcpEntry(location, adoption)));
        }
        for (const candidate of candidates) {
          const outcomes = yield* syncInlineMcpServerToAgents(agentIds, {
            nativeDirectoryInputs: location.nativeDirectoryInputs,
            workspaceRoot: location.baseDir,
            scope: location.scope,
            serverName: candidate.name,
            nativeInsertionEligible: false,
            entry: settingsEntry(candidate),
          }).pipe(Effect.mapError(nativeFailureToConfigurationFailed));
          for (const outcome of outcomes) {
            if (outcome.targets !== undefined) {
              locations.push(
                ...(outcome.targets ?? []).flatMap((target) =>
                  target.nativeLocation === undefined ? [] : [target.nativeLocation],
                ),
              );
            }
          }
        }
        return combineNativeLocationOutcomes([...planned, ...locations]);
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
