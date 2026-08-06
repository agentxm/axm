import { Command, Flag } from "effect/unstable/cli";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import {
  CONFIGURABLE_AGENTS_BY_ID,
  type ConfigurableAgentId,
} from "@agentxm/client-core/unstable/agent-capabilities";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { previewFlag, Verbosity, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { CliRenderer, count } from "@agentxm/client-core/unstable/cli-renderer";
import {
  AXM_MCP_METADATA_KEY,
  buildAxmMcpMetadataFromSettingsSource,
  isAxmManagedMcpEntry,
} from "@agentxm/client-core/unstable/mcps";
import type { McpServerEntry } from "@agentxm/client-core/unstable/settings";
import type {
  ExecutedPlan,
  JobStepArtifact,
  JobStepResult,
  Plan,
  PlanResolution,
  PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import {
  ResolvePlanInteraction,
  WorkspaceMutations,
  type WorkspaceMutationsService,
} from "@agentxm/client-core/unstable/workspace";
import { emitPlanResolutionResult } from "../../json-output.js";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { previewOrApplyLocalPlan } from "../shared/local-plan.js";
import {
  type McpImportAdoption,
  type McpImportCandidate,
  type McpImportPreflight,
  type McpImportSource,
  preflightMcpImports,
} from "./import-preflight.js";

export interface McpsImportArgs {
  readonly yes: boolean;
  readonly preview: boolean;
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
    const addSource = (filePath: string, serversKey: string) => {
      const sourceKey = `${filePath}\0${serversKey}`;
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

    yield* addSource(path.join(ws.baseDir, ".mcp.json"), "mcpServers");
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
        yield* addSource(configPath, mcpConfig.value.serversKey);
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
  entry.source === "inline" &&
  entry.enabled &&
  entry.command === candidate.lockEntry.command &&
  JSON.stringify(entry.args ?? []) === JSON.stringify(candidate.lockEntry.args ?? []) &&
  entry.url === candidate.lockEntry.url &&
  recordsEqual(entry.headers, candidate.lockEntry.headers) &&
  recordsEqual(entry.env, candidate.env);

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
  const setArgs = (candidate: McpImportCandidate) => ({
    name: candidate.name,
    lockEntry: candidate.lockEntry,
    versionRange: Option.none(),
    env: candidate.env,
    enabled: true,
  });
  return ws.runTransaction({
    targets: Array.from(new Set(adoptions.map((adoption) => adoption.filePath))).sort(),
    transition: Effect.gen(function* () {
      for (const candidate of candidates) {
        yield* ws.setMcpServer({ ...setArgs(candidate), commit: "authoritative" });
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
    receipt: () =>
      Effect.forEach(
        candidates,
        (candidate) => ws.setMcpServerLock({ ...setArgs(candidate), commit: "receipt" }),
        { concurrency: 1 },
      ).pipe(Effect.asVoid),
  });
};

const importArtifact = (
  preflight: McpImportPreflight,
  ws: WorkspaceMutationsService,
  path: Path.Path,
): JobStepArtifact => {
  const adoptions = preflight.candidates.flatMap((candidate) => candidate.adoptions);
  return {
    path: ".axm (config/lockfile)",
    scope: ws.scope,
    change: "updated",
    fileCount: 2 + new Set(adoptions.map((adoption) => adoption.filePath)).size,
    targets: [
      { path: ".axm (config/lockfile)", change: "updated" },
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
    jobs: [{ concurrency: 1, steps: [...conflictSteps, ...importSteps] }],
  };
};

const cancelPlan = (plan: Plan): PlanResolution => ({
  _tag: "CancelledPlan",
  name: plan.name,
  description: plan.description,
  jobs: plan.jobs,
});

const importedCount = (resolution: ExecutedPlan, candidateCount: number): number => {
  const importStep = resolution.jobs
    .flatMap((job) => job.steps)
    .find((step) => step.label.startsWith("Import "));
  return importStep?.result.result === "success" ? candidateCount : 0;
};

const importSummary = (
  candidates: ReadonlyArray<McpImportCandidate>,
  baseDir: string,
  path: Path.Path,
): string | undefined => {
  const rows = candidates.map((candidate) => {
    const targets = [
      ".axm (config/lockfile) (updated)",
      ...candidate.adoptions.map(
        (adoption) => `${path.relative(baseDir, adoption.filePath)} (updated)`,
      ),
    ];
    return `${candidate.name}   created   ${count(2 + candidate.adoptions.length, "file")}   ${targets.join(", ")}`;
  });
  return rows.length === 0 ? undefined : rows.join("\n");
};

export const handleMcpsImport = Effect.fn("Mcps.import")(function* (
  args: McpsImportArgs,
  hooks: McpsImportTestHooks = {},
) {
  const ws = yield* WorkspaceMutations;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const now = yield* DateTime.now;
  const configured = yield* ws.getConfiguredMcpServerEntries();
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
  const plan = makePlan(preflight, ws, fs, path, hooks);
  const confirmed =
    args.preview || args.yes || preflight.candidates.length === 0 || preflight.conflicts.length > 0
      ? true
      : yield* ResolvePlanInteraction.pipe(
          Effect.flatMap((interaction) => interaction.confirmApplyChanges()),
        );
  const resolution = confirmed
    ? yield* previewOrApplyLocalPlan(plan, {
        preview: args.preview,
        displayApplied: false,
      })
    : cancelPlan(plan);
  const appliedCount =
    resolution._tag === "ExecutedPlan" ? importedCount(resolution, preflight.candidates.length) : 0;
  const suggestions = [
    { description: "Inspect MCP servers", cmd: "axm mcps list" },
    ...(appliedCount === 1
      ? [{ description: "Undo", cmd: `axm mcps uninstall ${preflight.candidates[0]?.name ?? ""}` }]
      : []),
  ];
  const summary =
    appliedCount > 0 ? importSummary(preflight.candidates, ws.baseDir, path) : undefined;
  const emitted = yield* emitPlanResolutionResult("mcps.import", resolution, {
    suggestions,
    ...(summary === undefined ? {} : { summary }),
    ...(preflight.candidates.length === 0 && preflight.conflicts.length === 0
      ? { message: "No unmanaged MCP servers imported." }
      : {}),
    operationCounts: {
      importedCount: appliedCount,
      skippedCount: preflight.skipped.length,
      conflictingCount: preflight.conflicts.length,
    },
  });

  if (emitted) return;
  const renderer = yield* CliRenderer;
  const verbosity = yield* Verbosity;
  const countSummary = `${preflight.skipped.length} skipped, ${count(preflight.conflicts.length, "conflict")}`;
  if (resolution._tag === "CancelledPlan") {
    yield* renderer.warn(`MCP import cancelled (${countSummary})`);
    return;
  }
  if (resolution._tag !== "ExecutedPlan") return;
  const failed = resolution.jobs.some((job) =>
    job.steps.some((step) => step.result.result === "error"),
  );
  if (failed) {
    yield* renderer.error(`MCP import failed (${countSummary})`, {
      suggestions,
      withoutSuggestions: emitted,
    });
    return;
  }
  yield* renderer.success(
    appliedCount === 0
      ? `No unmanaged MCP servers imported (${countSummary}).`
      : `Imported ${count(appliedCount, "MCP server")} (${countSummary})`,
    verbosity.level === "quiet"
      ? undefined
      : { suggestions, ...(summary === undefined ? {} : { summary }) },
  );
});

const importConfig = {
  scope: scopeFlag.pipe(
    Flag.withDescription("Import to project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Apply without confirmation")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without applying")),
} as const;

export const importCommand = Command.make("import", importConfig, ({ scope, yes, preview }) =>
  handleMcpsImport({ yes, preview }).pipe(withWorkspace(scope), withRuntime("mcps import")),
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
