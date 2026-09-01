import { Command, Flag } from "effect/unstable/cli";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as HttpClient from "effect/unstable/http/HttpClient";
import {
  CONFIGURABLE_AGENTS_BY_ID,
  type ConfigurableAgentId,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { CodingAgentRepository } from "@agentxm/extension-management/unstable/extension-workspace";
import { makeAppError, type AppError } from "@agentxm/extension-management/unstable/app-error";
import { previewFlag, yesFlag } from "@agentxm/extension-management/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/extension-management/unstable/cli-runtime";
import { CliRenderer, count } from "@agentxm/extension-management/unstable/cli-renderer";
import {
  McpServerManager,
  installMcpServer,
  buildAxmMcpMetadataFromSettingsSource,
} from "@agentxm/extension-management/unstable/mcps";
import {
  AXM_MCP_METADATA_KEY,
  isAxmManagedMcpEntry,
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "@agentxm/extension-management/unstable/workspace";
import {
  MCP_SERVER_MANIFEST_FILENAME,
  MCP_SERVER_MANIFEST_SCHEMA_URL,
  MCP_SERVER_REGISTRY_SERVER_SCHEMA_URL,
  type McpServerManifest,
} from "@agentxm/extension-model/unstable/mcps/manifest-schema";
import {
  buildAuthoredExtensionStep,
  createCanonicalDirectory,
  preflightCreateOnly,
  recoverCanonicalDirectory,
} from "@agentxm/extension-management/unstable/extensions";
import { formatFqn, parseFqn } from "@agentxm/extension-model/unstable/extensions";
import {
  fqnInvalidErrorToAppError,
  toAppError,
  failureToStepFailure,
} from "@agentxm/extension-management/unstable/app-error/conversions";
import type { McpServerEntry } from "@agentxm/extension-management/unstable/settings";
import type {
  JobStepArtifact,
  JobStepResult,
  Plan,
  PlannedJobStep,
} from "@agentxm/extension-management/unstable/plan";
import {
  operationPresentation,
  type OperationResolution,
} from "@agentxm/extension-management/unstable/plan";
import { emitOperationResolution } from "../../operation-output.js";
import { scopeFlag } from "../../cli-flags.js";
import { requireAuthoredOwner } from "../shared/authored-owner.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import { makeConfirmationRecovery } from "../shared/confirmation-recovery.js";
import { withOperationLifecycle } from "../shared/operation-lifecycle.js";
import { workspaceAuthoredRoot, workspaceSettingsPath } from "../shared/workspace-display-paths.js";
import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import { isNonInteractiveOptional } from "@agentxm/extension-management/unstable/cli-flags";
import {
  type McpImportAdoption,
  type McpImportCandidate,
  type McpImportPreflight,
  type McpImportSource,
  preflightMcpImports,
} from "./import-preflight.js";
import {} from "@agentxm/extension-management/unstable/app-error/conversions";

export interface McpsImportArgs {
  readonly yes: boolean;
  readonly preview: boolean;
  readonly as?: Option.Option<string>;
  readonly enable?: boolean;
}

export interface McpsImportTestHooks {
  readonly beforeAdoptionWrite?: (adoption: McpImportAdoption) => Effect.Effect<void, AppError>;
}

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

const collectImportSources = (
  ws: WorkspaceMutationsService,
  fs: FileSystem.FileSystem,
  path: Path.Path,
): Effect.Effect<
  {
    readonly sources: ReadonlyArray<McpImportSource>;
    readonly skipped: ReadonlyArray<{ readonly name: string; readonly reason: string }>;
  },
  AppError
> =>
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

    const agentIds = [...(yield* ws.getConfiguredAgents().pipe(Effect.mapError(toAppError)))].sort(
      (left, right) => left.localeCompare(right),
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
): Effect.Effect<void, AppError> =>
  Effect.gen(function* () {
    const config = yield* readJsonObject(fs, adoption.filePath);
    if (Option.isNone(config)) {
      return yield* makeAppError({
        code: "conflict",
        detail: `MCP config disappeared before import: ${adoption.filePath}`,
      });
    }
    const servers = config.value[adoption.serversKey];
    const entry = isRecord(servers) ? servers[adoption.name] : undefined;
    if (!isRecord(servers) || !isRecord(entry)) {
      return yield* makeAppError({
        code: "conflict",
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
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
            detail: `Failed to write MCP config: ${adoption.filePath}`,
            cause: error,
          }),
        ),
      );
  });

const removeConvertedMcpConfig = (
  fs: FileSystem.FileSystem,
  adoption: McpImportAdoption,
): Effect.Effect<void, AppError> =>
  Effect.gen(function* () {
    const config = yield* readJsonObject(fs, adoption.filePath);
    if (Option.isNone(config)) {
      return yield* makeAppError({
        code: "conflict",
        detail: `MCP config disappeared before package conversion: ${adoption.filePath}`,
      });
    }
    const servers = config.value[adoption.serversKey];
    if (!isRecord(servers)) {
      return yield* makeAppError({
        code: "conflict",
        detail: `MCP server collection changed before package conversion: ${adoption.filePath}`,
      });
    }
    const entry = servers[adoption.name];
    if (entry === undefined) return;
    if (!isRecord(entry)) {
      return yield* makeAppError({
        code: "conflict",
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
        Effect.mapError((error) =>
          makeAppError({
            code: "internal",
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
): Effect.Effect<void, AppError> =>
  Effect.gen(function* () {
    const config = yield* readJsonObject(fs, adoption.filePath);
    const servers = Option.isSome(config) ? config.value[adoption.serversKey] : undefined;
    const entry = isRecord(servers) ? servers[adoption.name] : undefined;
    if (!isRecord(entry) || !isAxmManagedMcpEntry(entry)) {
      return yield* makeAppError({
        code: "validation",
        detail: `Failed to validate adopted MCP server ${adoption.name}`,
      });
    }
  });

const applyImport = (
  candidates: ReadonlyArray<McpImportCandidate>,
  ws: WorkspaceMutationsService,
  fs: FileSystem.FileSystem,
  hooks: McpsImportTestHooks,
): Effect.Effect<void, AppError> => {
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
  return ws
    .runTransaction({
      targets: Array.from(new Set(adoptions.map((adoption) => adoption.filePath))).sort(),
      transition: Effect.gen(function* () {
        for (const candidate of candidates) {
          yield* ws
            .setMcpServerEntry(candidate.name, settingsEntry(candidate))
            .pipe(Effect.mapError(toAppError));
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
          const configured = yield* ws
            .getConfiguredMcpServerEntries()
            .pipe(Effect.mapError(toAppError));
          for (const candidate of candidates) {
            if (!candidateMatchesSettings(candidate, configured[candidate.name])) {
              return yield* makeAppError({
                code: "validation",
                detail: `Failed to validate imported MCP server ${candidate.name}`,
              });
            }
          }
          yield* Effect.forEach(adoptions, (adoption) => validateAdoption(fs, adoption), {
            concurrency: 1,
          });
        }),
    })
    .pipe(Effect.mapError(toAppError));
};

const importArtifact = (
  preflight: McpImportPreflight,
  ws: WorkspaceMutationsService,
  path: Path.Path,
): JobStepArtifact => {
  const adoptions = preflight.candidates.flatMap((candidate) => candidate.adoptions);
  return {
    path: workspaceSettingsPath(ws.scope),
    scope: ws.scope,
    change: "updated",
    fileCount: 1 + new Set(adoptions.map((adoption) => adoption.filePath)).size,
    targets: [
      { path: workspaceSettingsPath(ws.scope), change: "updated" },
      ...Array.from(new Set(adoptions.map((adoption) => adoption.filePath)))
        .sort()
        .map((filePath) => ({
          path: path.relative(ws.baseDir, filePath),
          change: "updated" as const,
        })),
    ],
  };
};

const makePlan = (
  preflight: McpImportPreflight,
  ws: WorkspaceMutationsService,
  fs: FileSystem.FileSystem,
  path: Path.Path,
  hooks: McpsImportTestHooks,
): Plan => {
  const conflictSteps = preflight.conflicts.map<PlannedJobStep>((conflict) => ({
    label: conflict.name,
    readiness: "error",
    errorMessage: conflict.reason,
  }));
  const importSteps =
    preflight.candidates.length === 0
      ? []
      : [
          {
            label: `Import ${count(preflight.candidates.length, "MCP server")}`,
            readiness: "ready" as const,
            message: `Candidates: ${preflight.candidates.map((candidate) => candidate.name).join(", ")}`,
            artifact: importArtifact(preflight, ws, path),
            run: applyImport(preflight.candidates, ws, fs, hooks).pipe(
              Effect.mapError(failureToStepFailure),
              Effect.as({
                result: "success",
                message: `Imported ${count(preflight.candidates.length, "MCP server")}`,
                artifact: importArtifact(preflight, ws, path),
              } satisfies JobStepResult),
            ),
          },
        ];
  return {
    _tag: "Plan",
    name: "Import MCP servers",
    description: Option.some(`Adopt ${count(preflight.candidates.length, "unmanaged MCP server")}`),
    presentation: operationPresentation(
      { imperative: "import", past: "Imported", gerund: "Importing" },
      "mcp-server",
    ),
    jobs: [{ concurrency: 1, steps: [...conflictSteps, ...importSteps] }],
  };
};

const importedCount = (
  resolution: OperationResolution<unknown>,
  candidateCount: number,
): number => {
  const importUnit = resolution.units.find((unit) => unit.label.startsWith("Import "));
  return importUnit?.state === "committed" ? candidateCount : 0;
};

const makePackageImportPlan = Effect.fn("Mcps.importPackagePlan")(function* (args: {
  readonly targetInput: string;
  readonly enable: boolean;
  readonly preflight: McpImportPreflight;
  readonly ws: WorkspaceMutationsService;
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
}) {
  const httpClient = yield* HttpClient.HttpClient;
  const nonInteractive = yield* isNonInteractiveOptional;
  if (args.ws.scope !== "project") {
    return yield* makeAppError({
      code: "usage",
      detail: "MCP package import is project-workspace only; omit --scope user",
    });
  }
  const target = yield* Effect.fromResult(
    Result.mapError(parseFqn(args.targetInput), fqnInvalidErrorToAppError),
  );
  if (target.type !== "mcp-server") {
    return yield* makeAppError({
      code: "validation",
      detail: `MCP package import target must use the mcps type: ${args.targetInput}`,
    });
  }
  yield* requireAuthoredOwner(target.owner);
  if (args.preflight.conflicts.length > 0) {
    return yield* makeAppError({
      code: "conflict",
      detail: `MCP package import has ${args.preflight.conflicts.length} conflicted native candidate(s)`,
    });
  }
  const candidate = args.preflight.candidates[0];
  if (candidate === undefined || args.preflight.candidates.length !== 1) {
    return yield* makeAppError({
      code: "validation",
      detail:
        args.preflight.candidates.length === 0
          ? "No losslessly importable unmanaged MCP server was found"
          : "MCP package import requires exactly one unmanaged server candidate",
    });
  }
  if (candidate.definition.type !== "http") {
    return yield* makeAppError({
      code: "usage",
      detail:
        "This MCP command cannot be represented losslessly as a managed package; import it inline without --as",
    });
  }
  const fqn = formatFqn(target);
  const version = decodeVersionSync("0.1.0");
  const targetDir = args.path.join(
    workspaceAuthoredRoot(args.path, args.ws, "mcp-server", target.owner),
    target.name,
  );
  yield* preflightCreateOnly({
    subject: "MCP package",
    name: target.name,
    configured: false,
    destinations: [],
  }).pipe(Effect.provideService(FileSystem.FileSystem, args.fs));
  const manifest: McpServerManifest = {
    $schema: MCP_SERVER_MANIFEST_SCHEMA_URL,
    owner: target.owner,
    type: "mcp-server",
    name: target.name,
    version,
    description: `Imported MCP server ${candidate.name}`,
    server: {
      $schema: MCP_SERVER_REGISTRY_SERVER_SCHEMA_URL,
      name: `local.axm/${target.name}`,
      description: `Imported MCP server ${candidate.name}`,
      version,
      remotes: [
        {
          type: "streamable-http",
          url: candidate.definition.url,
          ...(Object.keys(candidate.definition.headers).length === 0
            ? {}
            : {
                headers: Object.entries(candidate.definition.headers).map(([name, value]) => ({
                  name,
                  value,
                })),
              }),
        },
      ],
    },
  };
  const manager = yield* McpServerManager;
  const renderer = yield* CliRenderer;
  const agentRepo = yield* CodingAgentRepository;
  const source = "workspace";
  const adoptionPaths = Array.from(
    new Set(candidate.adoptions.map((adoption) => adoption.filePath)),
  ).sort();
  const artifact: JobStepArtifact = {
    path: args.path.relative(args.ws.baseDir, targetDir),
    scope: args.ws.scope,
    version,
    change: "created",
    targets: [
      { path: args.path.relative(args.ws.baseDir, targetDir), change: "created" },
      { path: workspaceSettingsPath(args.ws.scope), change: "created" },
      ...adoptionPaths.map((filePath) => ({
        path: args.path.relative(args.ws.baseDir, filePath),
        change: "updated" as const,
      })),
    ],
  };
  const step = buildAuthoredExtensionStep(manager, {
    target: { type: "mcp-server", name: target.name },
    location: targetDir,
    transactionTargets: adoptionPaths,
    versionRange: Option.none(),
    enabled: args.enable,
    materializeWhenDisabled: true,
    allowConfiguredSourceTransition: true,
    label: `Import ${candidate.name} -> ${fqn}`,
    message: `Imported ${fqn}`,
    plannedArtifact: artifact,
    buildArtifact: () => Effect.succeed(artifact),
    preflight: Effect.gen(function* () {
      yield* recoverCanonicalDirectory({
        baseDir: args.ws.baseDir,
        canonicalPath: targetDir,
      });
      yield* preflightCreateOnly({
        subject: "MCP package",
        name: target.name,
        configured: false,
        destinations: [targetDir],
      });
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, args.fs),
      Effect.provideService(Path.Path, args.path),
    ),
    scaffold: createCanonicalDirectory({
      baseDir: args.ws.baseDir,
      canonicalPath: targetDir,
      subject: "MCP package",
      requiredFiles: [MCP_SERVER_MANIFEST_FILENAME],
      populate: (stagingPath) =>
        args.fs
          .writeFileString(
            args.path.join(stagingPath, MCP_SERVER_MANIFEST_FILENAME),
            `${JSON.stringify(manifest, null, 2)}\n`,
          )
          .pipe(
            Effect.mapError((cause) =>
              makeAppError({
                code: "internal",
                detail: "MCP package manifest could not be staged",
                cause,
              }),
            ),
          ),
    }).pipe(
      Effect.asVoid,
      Effect.provideService(FileSystem.FileSystem, args.fs),
      Effect.provideService(Path.Path, args.path),
    ),
    markAuthored: args.ws
      .setMcpServerEntry(target.name, {
        source,
        enabled: true,
        env: candidate.env,
        ...(candidate.agents === undefined ? {} : { agents: candidate.agents }),
      })
      .pipe(Effect.mapError(toAppError)),
    finalizeAuthored: args.ws
      .setMcpServerEntry(target.name, {
        source,
        enabled: args.enable,
        env: candidate.env,
        ...(candidate.agents === undefined ? {} : { agents: candidate.agents }),
      })
      .pipe(Effect.mapError(toAppError))
      .pipe(
        Effect.andThen(
          Effect.forEach(candidate.adoptions, (adoption) =>
            removeConvertedMcpConfig(args.fs, adoption),
          ),
        ),
        Effect.asVoid,
      ),
    materializeInstall: (ref) =>
      installMcpServer({
        name: "install-mcp-server",
        args: {
          ref,
          nonInteractive,
          force: false,
          allowWorkspaceSourceTransition: true,
          versionRange: Option.none(),
          skipSettings: Option.none(),
          skipStateWrites: true,
          env: Option.none(),
        },
      }).pipe(
        Effect.asVoid,
        Effect.mapError(toAppError),
        Effect.provideService(FileSystem.FileSystem, args.fs),
        Effect.provideService(Path.Path, args.path),
        Effect.provideService(WorkspaceMutations, args.ws),
        Effect.provideService(CliRenderer, renderer),
        Effect.provideService(CodingAgentRepository, agentRepo),
        Effect.provideService(HttpClient.HttpClient, httpClient),
      ),
  });
  return {
    _tag: "Plan",
    name: "Import MCP server package",
    description: Option.some(
      `Losslessly convert ${candidate.name} into ${fqn}; native MCP config is replaced only after managed validation`,
    ),
    presentation: operationPresentation(
      { imperative: "import", past: "Imported", gerund: "Importing" },
      "mcp-server",
    ),
    jobs: [{ concurrency: 1, steps: [step] }],
  } satisfies Plan;
});

export const handleMcpsImport = (args: McpsImportArgs, hooks: McpsImportTestHooks = {}) =>
  withOperationLifecycle(
    {
      command: "mcps.import",
      mode: args.preview ? "preview" : "apply",
      planName: "Import MCP servers",
    },
    handleMcpsImportBody(args, hooks),
  );

const handleMcpsImportBody = Effect.fn("Mcps.import")(function* (
  args: McpsImportArgs,
  hooks: McpsImportTestHooks = {},
) {
  const packageTarget = args.as ?? Option.none<string>();
  const enablePackage = args.enable ?? false;
  if (enablePackage && Option.isNone(packageTarget)) {
    return yield* makeAppError({
      code: "usage",
      detail: "--enable requires --as <extension>",
    });
  }
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const now = yield* DateTime.now;
  const configured = yield* ws.getConfiguredMcpServerEntries().pipe(Effect.mapError(toAppError));
  const discovery = yield* collectImportSources(ws, fs, path);
  const normalized = preflightMcpImports({
    configuredNames: new Set(Object.keys(configured)),
    now,
    sources: discovery.sources,
  });
  const preflight = {
    ...normalized,
    skipped: [...normalized.skipped, ...discovery.skipped].sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.reason.localeCompare(right.reason),
    ),
  } satisfies McpImportPreflight;
  if (Option.isSome(packageTarget)) {
    const packagePlan = yield* makePackageImportPlan({
      targetInput: packageTarget.value,
      enable: enablePackage,
      preflight,
      ws,
      fs,
      path,
    });
    const packageResolution = yield* previewOrApplyLocalPlan(packagePlan, {
      preview: args.preview,
      yes: args.yes,
      recovery: makeConfirmationRecovery(["mcps", "import"], []),
    });
    yield* emitOperationResolution("mcps.import", packageResolution);
    return;
  }
  const plan = makePlan(preflight, ws, fs, path, hooks);
  const resolution = yield* previewOrApplyLocalPlan(plan, {
    preview: args.preview,
    yes: args.yes,
    recovery: makeConfirmationRecovery(["mcps", "import"], []),
  });
  const appliedCount = importedCount(resolution, preflight.candidates.length);
  const suggestions = [
    { description: "Inspect MCP servers", cmd: "axm mcps list" },
    ...(appliedCount === 1
      ? [{ description: "Undo", cmd: `axm mcps uninstall ${preflight.candidates[0]?.name ?? ""}` }]
      : []),
  ];
  yield* emitOperationResolution("mcps.import", resolution, {
    suggestions,
    ...(preflight.candidates.length === 0 && preflight.conflicts.length === 0
      ? { message: "No unmanaged MCP servers imported." }
      : {}),
    imports: {
      imported: appliedCount,
      skipped: preflight.skipped.length,
      conflicting: preflight.conflicts.length,
    },
  });
});

const importConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Import to project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Apply without confirmation")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without applying")),
  as: Flag.string("as").pipe(
    Flag.withDescription("Create one managed MCP package at the target FQN"),
    Flag.optional,
  ),
  enable: Flag.boolean("enable").pipe(
    Flag.withDescription("Enable a package created with --as"),
    Flag.withDefault(false),
  ),
} as const;

export const importCommand = Command.make(
  "import",
  importConfig,
  ({ scope, yes, preview, as, enable }) =>
    handleMcpsImport({ yes, preview, as, enable }).pipe(
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
    {
      command: "axm mcps import --as @me/mcps/context",
      description: "Convert one losslessly representable native server into an authored package",
    },
  ]),
);
