import { createHash } from "node:crypto";
import { inspectDesiredMcpServer } from "@agentxm/workspace-kernel/projection";
/**
 * Inline MCP adoption policy: discover import sources from configured agents'
 * native MCP configs, preserve imported native meaning without ownership stamps,
 * remove entries converted into managed packages, and apply an inline import
 * as one validated workspace transaction. Prompting, planning, and rendering
 * stay with the application.
 *
 * @experimental This API is unstable and may change without notice.
 */

import {
  CONFIGURABLE_AGENTS_BY_ID,
  McpServersPathSchema,
  type NativeConfigReadLocation,
  type McpEntryDialect,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import {
  isConfigurableAgentId,
  readNativeMcpConfig,
  readNativeMcpEntry,
  readNativeMcpValues,
  decodeJsonMcpConfig,
  resolveAgentMcpConfigTargetPath,
  writeAgentMcpConfig,
  validateAgentMcpConfigWrite,
  preflightNativeConfigReaders,
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
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const exists = (file: string) =>
      fs.exists(file).pipe(
        Effect.mapError(
          () =>
            new WorkspaceConfigurationFailed({
              category: "validation",
              detail: "Cannot inspect native MCP discovery boundary",
            }),
        ),
      );
    const sources: Array<McpImportSource> = [];
    const skipped = new Map<string, { readonly name: string; readonly reason: string }>();
    const sourceKeys = new Set<string>();
    const addSource = (
      filePath: string,
      serversPath: McpImportSource["serversPath"],
      target: McpImportSource["target"],
      envExpansion: McpImportSource["envExpansion"],
      agentId: string,
      dialect: McpEntryDialect,
    ) => {
      const sourceKey = JSON.stringify([filePath, serversPath, agentId]);
      if (sourceKeys.has(sourceKey)) return Effect.void;
      sourceKeys.add(sourceKey);
      return Effect.gen(function* () {
        const raw = yield* readNativeMcpConfig(filePath).pipe(
          Effect.mapError(readFailureToConfigurationFailed),
        );
        if (Option.isNone(raw)) return;
        if (agentId === "github-copilot-cli" && location.scope === "project") {
          const decoded = yield* decodeJsonMcpConfig(
            filePath,
            raw.value,
            serversPath,
            target.format,
          ).pipe(Effect.mapError(readFailureToConfigurationFailed));
          if (decoded.servers === undefined && Object.keys(decoded.root).length > 0) {
            for (const name of Object.keys(decoded.root))
              skipped.set(`${filePath}:${name}`, {
                name,
                reason:
                  "Copilot bare-root MCP entry requires an explicit mcpServers container before portable adoption",
              });
            return;
          }
        }
        const servers = yield* readNativeMcpValues({
          format: target.format,
          configPath: filePath,
          raw: raw.value,
          serversPath,
        }).pipe(Effect.mapError(readFailureToConfigurationFailed));
        sources.push({
          agentId,
          dialect,
          workspaceRoot: location.baseDir,
          fingerprint: createHash("sha256").update(raw.value).digest("hex"),
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
      if (!("locations" in native) || native.entryDialect === null) continue;
      const declarations: ReadonlyArray<NativeConfigReadLocation> = native.locations;
      for (const declaration of [...declarations].sort((left, right) =>
        left.path.localeCompare(right.path),
      )) {
        if (declaration.applicability.kind !== "always") continue;
        const resolved = resolveNativeReadLocation(
          path,
          agentId,
          declaration,
          { workspaceRoot: location.baseDir, scope: location.scope },
          location.nativeDirectoryInputs,
        );
        if (resolved === undefined) {
          if (declaration.scope === location.scope && declaration.selectedFile !== undefined)
            skipped.set(`${agentId}:${declaration.id}`, {
              name: agentId,
              reason:
                "Select an absolute native user MCP configuration file before importing this agent",
            });
          continue;
        }
        const serversPath = declaration.keyPath;
        if (!Schema.is(McpServersPathSchema)(serversPath)) {
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
        yield* addSource(
          configPath,
          serversPath,
          target,
          "mcpEnvExpansion" in native ? native.mcpEnvExpansion : undefined,
          agentId,
          native.entryDialect,
        );
      }
    }
    if (location.scope === "project" && agentIds.includes("github-copilot-cli")) {
      let directory = location.baseDir;
      const ancestors: Array<string> = [];
      while (!(yield* exists(path.join(directory, ".git")))) {
        const parent = path.dirname(directory);
        if (parent === directory) {
          ancestors.length = 0;
          break;
        }
        directory = parent;
        ancestors.push(directory);
      }
      for (const ancestorDirectory of ancestors) {
        for (const relative of [".mcp.json", ".github/mcp.json"]) {
          const file = path.join(ancestorDirectory, relative);
          const raw = yield* readNativeMcpConfig(file).pipe(
            Effect.mapError(readFailureToConfigurationFailed),
          );
          if (Option.isNone(raw)) continue;
          const decoded = yield* decodeJsonMcpConfig(file, raw.value, ["mcpServers"], "json").pipe(
            Effect.mapError(readFailureToConfigurationFailed),
          );
          for (const name of Object.keys(decoded.servers ?? decoded.root))
            skipped.set(`${file}:${name}`, {
              name,
              reason: `Copilot reads an ancestor declaration at ${file}; select its owning workspace to manage it and resolve precedence before importing`,
            });
        }
      }
    }
    return { sources, skipped: Array.from(skipped.values()) };
  });

const adoptNativeMcpEntry = (
  location: WorkspaceLocationService,
  adoption: McpImportAdoption,
  configuredAgentIds: ReadonlyArray<string>,
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
    const write = {
      workspaceRoot: location.baseDir,
      serverName: adoption.name,
      serversPath: adoption.serversPath,
      target: adoption.target,

      adoption: { filePath: adoption.filePath, expectedEntry: adoption.expectedEntry },
      entry: entry.value,
    };
    const proposedRaw = yield* validateAgentMcpConfigWrite(write).pipe(
      Effect.mapError(nativeFailureToConfigurationFailed),
    );
    yield* preflightNativeConfigReaders({
      workspaceRoot: location.baseDir,
      nativeDirectoryInputs: location.nativeDirectoryInputs,
      scope: location.scope,
      physicalPath: adoption.filePath,
      configuredAgentIds,
      writerFormat: adoption.target.format,
      raw: Option.getOrElse(raw, () => ""),
      proposedRaw,
      preserveMcpSemantics: true,
    }).pipe(Effect.mapError(nativeFailureToConfigurationFailed));
    const result = yield* writeAgentMcpConfig(write).pipe(
      Effect.mapError(nativeFailureToConfigurationFailed),
    );
    return result.targets.flatMap((target) =>
      target.nativeLocation === undefined ? [] : [target.nativeLocation],
    );
  });

const candidateMatchesSettings = (
  candidate: McpImportCandidate,
  entry: McpServerEntry | undefined,
): boolean =>
  entry?.kind === "inline" &&
  entry.enabled === candidate.enabled &&
  Equal.equals(entry.connection, candidate.definition) &&
  Equal.equals(entry.auth, candidate.auth);

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
    if (Option.isNone(entry)) {
      return yield* new WorkspaceConfigurationFailed({
        category: "validation",
        detail: `Failed to validate adopted MCP server ${adoption.name}`,
      });
    }
  });

const settingsEntry = (candidate: McpImportCandidate): McpServerEntry => ({
  kind: "inline",
  connection: candidate.definition,
  enabled: candidate.enabled,
  ...(candidate.auth === undefined ? {} : { auth: candidate.auth }),
});

/** Every configured reader is checked before adoption publishes any desired state. */
export const prepareMcpImportTargets = (candidates: ReadonlyArray<McpImportCandidate>) =>
  Effect.gen(function* () {
    const location = yield* WorkspaceLocation;
    const path = yield* Path.Path;
    const agentIds = yield* (yield* SettingsReader).configuredAgents;
    const locations: Array<NativeLocationOutcome> = [];
    for (const candidate of candidates) {
      for (const adoption of candidate.adoptions) {
        const raw = yield* readNativeMcpConfig(adoption.filePath).pipe(
          Effect.mapError(readFailureToConfigurationFailed),
        );
        if (
          Option.isNone(raw) ||
          createHash("sha256").update(raw.value).digest("hex") !== adoption.fingerprint
        )
          return yield* new WorkspaceConfigurationFailed({
            category: "conflict",
            detail: "Native MCP source document changed after discovery; discover the batch again",
          });
      }
      const plan = yield* validateInlineMcpServerTargets(agentIds, {
        nativeDirectoryInputs: location.nativeDirectoryInputs,
        workspaceRoot: location.baseDir,
        scope: location.scope,
        serverName: candidate.name,

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
          ownership: "declared",
          proof: "effective-native-declaration",
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
 * project their declared native values, in one validated workspace
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
    const originals = yield* Effect.forEach(
      Array.from(new Map(adoptions.map((adoption) => [adoption.filePath, adoption])).values()),
      (adoption) =>
        readNativeMcpConfig(adoption.filePath).pipe(
          Effect.mapError(readFailureToConfigurationFailed),
          Effect.map((raw) => ({ adoption, raw })),
        ),
    );
    return yield* runWorkspaceTransaction({
      targets: Array.from(
        new Set([
          ...planned.map((target) => target.address.path),
          ...adoptions.map((adoption) => adoption.filePath),
        ]),
      ).sort(),
      transition: Effect.gen(function* () {
        const locations: Array<NativeLocationOutcome> = [];
        for (const candidate of candidates) {
          yield* settingsWriter.setEntry("mcp-server", candidate.name, settingsEntry(candidate), {
            roundTrip: false,
          });
        }
        for (const adoption of adoptions) {
          locations.push(...(yield* adoptNativeMcpEntry(location, adoption, agentIds)));
        }
        for (const candidate of candidates) {
          const outcomes = yield* syncInlineMcpServerToAgents(agentIds, {
            nativeDirectoryInputs: location.nativeDirectoryInputs,
            workspaceRoot: location.baseDir,
            scope: location.scope,
            serverName: candidate.name,

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
            const inspection = yield* inspectDesiredMcpServer({
              workspaceRoot: location.baseDir,
              nativeDirectoryInputs: location.nativeDirectoryInputs,
              scope: location.scope,
              agentIds,
              node: { name: candidate.name, authority: "inline", enabled: candidate.enabled },
              entry: settingsEntry(candidate),
              canonicalPaths: [],
            }).pipe(Effect.mapError(nativeFailureToConfigurationFailed));
            if (!inspection.current)
              return yield* new WorkspaceConfigurationFailed({
                category: "validation",
                detail: `Imported MCP server ${candidate.name} failed native value readback`,
              });
          }
          yield* Effect.forEach(adoptions, validateAdoption, {
            concurrency: 1,
          });
          for (const { adoption, raw } of originals) {
            const after = yield* readNativeMcpConfig(adoption.filePath).pipe(
              Effect.mapError(readFailureToConfigurationFailed),
            );
            yield* preflightNativeConfigReaders({
              workspaceRoot: location.baseDir,
              nativeDirectoryInputs: location.nativeDirectoryInputs,
              scope: location.scope,
              physicalPath: adoption.filePath,
              configuredAgentIds: agentIds,
              writerFormat: adoption.target.format,
              raw: Option.getOrElse(raw, () => ""),
              proposedRaw: Option.getOrElse(after, () => ""),
              preserveMcpSemantics: true,
            }).pipe(Effect.mapError(nativeFailureToConfigurationFailed));
          }
        }),
    });
  });
};
