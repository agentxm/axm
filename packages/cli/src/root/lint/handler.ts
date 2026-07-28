/**
 * `axm lint` handler.
 *
 * Thin surface over {@link runLint}. Responsibilities:
 *
 * 1. Resolve workspace root + scope (project: cwd (or `<path>`), user:
 *    `$AXM_USER_HOME` or `$HOME`, ignoring `<path>`).
 * 2. Load `.axm/settings.json` (if present) to recover the configured
 *    `lint.rules` overrides.
 * 3. Build a `LintWorkspace` (rule context + flat projection) from the
 *    workspace read model, then assemble workspace / skill / pack rule
 *    contexts via the shared-kernel builders.
 * 4. Call {@link runLint} to evaluate, render, and (under `--fix`) apply the
 *    per-extension plan pipeline non-interactively.
 * 5. Emit human text / JSON output through the CLI renderer and translate
 *    the lint exit category into a process exit code.
 *
 * The lint runner primitives live in
 * `@agentxm/client-core/unstable/lint` so the handler stays a thin surface.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { ExitCode, makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { Verbosity } from "@agentxm/client-core/unstable/cli-flags";
import { effectCliExit, type SuggestedAction } from "@agentxm/client-core/unstable/cli-runtime";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import {
  CodingAgentRepository,
  removeMcpServerFromManifest,
  resolveInstructionsConfig,
  syncInlineMcpServerToAgent,
  syncInstructionTarget,
  syncInstructionsGitignore,
  type McpServerSyncOutcome,
} from "@agentxm/client-core/unstable/agents";
import { disableSkill, enableSkill, SkillManager } from "@agentxm/client-core/unstable/skills";
import { PackManager } from "@agentxm/client-core/unstable/packs";
import { CommandManager } from "@agentxm/client-core/unstable/commands";
import { McpServerManager } from "@agentxm/client-core/unstable/mcps";
import {
  buildLintWorkspace,
  buildPackRuleContexts,
  buildSkillRuleContexts,
  collectAutofixableEntries,
  evaluateAllCatalogs,
  resolveLintExitCategory,
  summarizeEvaluations,
  toLintHumanBlocks,
  toLintJsonDocument,
  type FixSummary,
  type LintHumanBlock,
  type LintHumanDiagnostic,
  type LintJsonDocument,
  type LintSummary,
} from "@agentxm/client-core/unstable/lint";
import type { LintConfig } from "@agentxm/client-core/unstable/lint";
import {
  applyPlan,
  resolvePlan,
  type ExecutedPlan,
  type Operation,
  type PlannedJobStep,
} from "@agentxm/client-core/unstable/plan";
import {
  resolveConfiguredCommand,
  resolveConfiguredMcpServer,
  resolveConfiguredPack,
  resolveConfiguredSkill,
  getUserScopeDir,
  AXM_DIR_NAME,
  type WorkspaceScope,
  WorkspaceMutations,
} from "@agentxm/client-core/unstable/workspace";
import { SettingsSchema } from "@agentxm/client-core/unstable/settings";
import {
  buildInstallOperation,
  buildUninstallOperation,
  normalizeHandle,
  parseRegistrySourcePatternParts,
} from "@agentxm/client-core/unstable/extensions";
import type { Settings } from "@agentxm/client-core/unstable/settings";
import type { McpServerEntry } from "@agentxm/client-core/unstable/settings";
import * as os from "node:os";
import { PlanResolutionResultSchema, toPlanResolutionResult } from "../../json-output.js";
import { makeWorkspaceRetentionPolicyEffect as makeRetentionPolicy } from "../shared/workspace-retention-policy.js";

// -----------------------------------------------------------------------------
// Handler args
// -----------------------------------------------------------------------------

export interface HandleLintArgs {
  readonly pathArg: Option.Option<string>;
  readonly scope: WorkspaceScope;
  readonly fix: boolean;
  readonly strict: boolean;
  readonly details: boolean;
}

// -----------------------------------------------------------------------------
// Root resolution
// -----------------------------------------------------------------------------

/**
 * Resolve the workspace root for a lint run.
 *
 * - `--scope=project` (default): use the optional `<path>` argument if
 *   provided, otherwise the caller-supplied `cwd` (defaulting to
 *   `process.cwd()` when loaded via {@link resolveLintRootEffect}).
 * - `--scope=user`: use the parent of the resolved user-scope `.axm`
 *   directory. Ignores `<path>`.
 *
 * XDG layout: v1 honors `AXM_USER_HOME` as an override; full
 * `XDG_DATA_HOME`/`XDG_CONFIG_HOME` integration is deferred to a follow-up
 * (see design doc §10 Open Items #10).
 *
 * @internal Exported for tests.
 */
export const resolveLintRoot = (args: {
  readonly pathArg: Option.Option<string>;
  readonly scope: WorkspaceScope;
  readonly cwd: string;
  readonly userScopeDir: string;
  readonly pathDirname: (path: string) => string;
}): string => {
  if (args.scope === "user") {
    return args.pathDirname(args.userScopeDir);
  }
  return Option.match(args.pathArg, {
    onNone: () => args.cwd,
    onSome: (p) => p,
  });
};

/**
 * Effectful wrapper around {@link resolveLintRoot}. The CLI handler calls this
 * once at entry.
 */
const resolveLintRootEffect = (args: {
  readonly pathArg: Option.Option<string>;
  readonly scope: WorkspaceScope;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const cwd = yield* Effect.sync(() => process.cwd());
    const userScopeDir = yield* getUserScopeDir();
    return resolveLintRoot({
      pathArg: args.pathArg,
      scope: args.scope,
      cwd,
      userScopeDir,
      pathDirname: path.dirname,
    });
  });

// -----------------------------------------------------------------------------
// Settings loading
// -----------------------------------------------------------------------------

const decodeSettings = (input: unknown): Option.Option<Settings> => {
  const result = Schema.decodeUnknownResult(SettingsSchema)(input, {
    onExcessProperty: "ignore",
    errors: "all",
  });
  return Result.isSuccess(result) ? Option.some(result.success) : Option.none();
};

/**
 * Read `lint.rules` from `.axm/settings.json`. Returns the empty config when
 * the file is missing, unparseable, or when the `lint` section is absent.
 * Errors are surfaced as empty config so lint still runs — the relevant
 * `workspace/settings-schema-valid` rule produces the user-facing finding
 * for a bad settings file.
 *
 * @internal
 */
const loadLintConfig = (
  workspaceRoot: string,
): Effect.Effect<LintConfig, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const settingsPath = path.join(workspaceRoot, AXM_DIR_NAME, "settings.json");
    const exists = yield* fs.exists(settingsPath).pipe(Effect.catch(() => Effect.succeed(false)));
    if (!exists) {
      return {};
    }
    const raw = yield* fs.readFileString(settingsPath).pipe(Effect.catch(() => Effect.succeed("")));
    if (raw.length === 0) {
      return {};
    }
    const parsed = Effect.try({
      try: (): unknown => JSON.parse(raw),
      catch: () => makeAppError({ code: "validation", detail: "" }),
    });
    const parsedOpt = yield* parsed.pipe(
      Effect.map(Option.some),
      Effect.catch(() => Effect.succeed(Option.none<unknown>())),
    );
    if (Option.isNone(parsedOpt)) {
      return {};
    }
    const decoded = decodeSettings(parsedOpt.value);
    return Option.match(decoded, {
      onNone: () => ({}),
      onSome: (s) => s.lint ?? {},
    });
  });

const loadInstructionsState = (
  workspaceRoot: string,
): Effect.Effect<
  Option.Option<{
    readonly configuredAgents: ReadonlyArray<string>;
    readonly config: ReturnType<typeof resolveInstructionsConfig>;
  }>,
  never,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const settingsPath = path.join(workspaceRoot, AXM_DIR_NAME, "settings.json");
    const raw = yield* fs.readFileString(settingsPath).pipe(Effect.catch(() => Effect.succeed("")));
    if (raw.length === 0) return Option.none();
    const parsed = yield* Effect.try({
      try: (): unknown => JSON.parse(raw),
      catch: () => makeAppError({ code: "validation", detail: "" }),
    }).pipe(
      Effect.map(Option.some),
      Effect.catch(() => Effect.succeed(Option.none<unknown>())),
    );
    if (Option.isNone(parsed)) return Option.none();
    const settings = decodeSettings(parsed.value);
    if (Option.isNone(settings)) return Option.none();
    const instructions = Option.fromUndefinedOr(settings.value.rulesConfig?.instructions);
    if (Option.isNone(instructions) || instructions.value === false) return Option.none();
    return Option.some({
      configuredAgents: settings.value.agents ?? [],
      config: resolveInstructionsConfig(instructions.value),
    });
  });

// -----------------------------------------------------------------------------
// Lint-intent → canonical `PlannedJobStep` adapter
// -----------------------------------------------------------------------------

interface IntentArgsWithSource {
  readonly name: string;
  readonly source: string;
  readonly force: boolean;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null;

const isIntentWithSource = (args: unknown): args is IntentArgsWithSource => {
  if (!isRecord(args)) {
    return false;
  }
  return (
    typeof args["name"] === "string" &&
    typeof args["source"] === "string" &&
    typeof args["force"] === "boolean"
  );
};

interface IntentArgsNameOnly {
  readonly name: string;
}

const isIntentWithName = (args: unknown): args is IntentArgsNameOnly => {
  if (!isRecord(args)) {
    return false;
  }
  return typeof args["name"] === "string";
};

interface SyncInstructionTargetIntentArgs {
  readonly root: string;
  readonly agentId: string;
  readonly force: boolean;
}

const isSyncInstructionTargetIntent = (args: unknown): args is SyncInstructionTargetIntentArgs => {
  if (!isRecord(args)) {
    return false;
  }
  return (
    typeof args["root"] === "string" &&
    typeof args["agentId"] === "string" &&
    typeof args["force"] === "boolean"
  );
};

interface SyncInstructionsGitignoreIntentArgs {
  readonly desired: boolean;
}

const isSyncInstructionsGitignoreIntent = (
  args: unknown,
): args is SyncInstructionsGitignoreIntentArgs => {
  if (!isRecord(args)) {
    return false;
  }
  return typeof args["desired"] === "boolean";
};

type LintFixScope = "project" | "user";

const isLintFixScope = (value: unknown): value is LintFixScope =>
  value === "project" || value === "user";

interface SyncMcpServerAgentIntentArgs {
  readonly serverName: string;
  readonly agentId: string;
  readonly scope: LintFixScope;
  readonly force: boolean;
}

const isSyncMcpServerAgentIntent = (args: unknown): args is SyncMcpServerAgentIntentArgs => {
  if (!isRecord(args)) {
    return false;
  }
  return (
    typeof args["serverName"] === "string" &&
    typeof args["agentId"] === "string" &&
    isLintFixScope(args["scope"]) &&
    typeof args["force"] === "boolean"
  );
};

interface RemoveMcpServerAgentIntentArgs {
  readonly serverName: string;
  readonly agentId: string;
  readonly scope: LintFixScope;
}

const isRemoveMcpServerAgentIntent = (args: unknown): args is RemoveMcpServerAgentIntentArgs => {
  if (!isRecord(args)) {
    return false;
  }
  return (
    typeof args["serverName"] === "string" &&
    typeof args["agentId"] === "string" &&
    isLintFixScope(args["scope"])
  );
};

const isInlineMcpServerEntry = (entry: McpServerEntry): boolean =>
  entry.command !== undefined || entry.url !== undefined;

const mcpSyncTargetSummary = (
  outcome: Extract<McpServerSyncOutcome, { readonly targets?: unknown }>,
) => {
  const targets = outcome.targets ?? [];
  if (targets.length === 0) return "no agent config targets changed";
  return targets.map((target) => `${target.change} ${target.path}`).join(", ");
};

const mcpSyncOutcomeResult = (args: {
  readonly action: "synchronized" | "removed";
  readonly serverName: string;
  readonly agentId: string;
  readonly outcome: McpServerSyncOutcome;
}) => {
  switch (args.outcome._tag) {
    case "success":
      return {
        result: "success" as const,
        message: `MCP server '${args.serverName}' ${args.action} for ${args.agentId}: ${mcpSyncTargetSummary(args.outcome)}`,
        ...(args.outcome.warnings === undefined ? {} : { warnings: args.outcome.warnings }),
      };
    case "fallback":
      return {
        result: "success" as const,
        message: `MCP server '${args.serverName}' ${args.action} for ${args.agentId} with fallback from ${args.outcome.fallbackFrom}: ${mcpSyncTargetSummary(args.outcome)}`,
        warnings: [args.outcome.reason, ...(args.outcome.warnings ?? [])],
      };
    case "unsupported":
    case "disabled":
    case "nothing-runnable":
    case "needs-input":
    case "misconfigured":
    case "failed":
      return {
        result: "error" as const,
        message: `Could not ${args.action === "synchronized" ? "synchronize" : "remove"} MCP server '${args.serverName}' for ${args.agentId}: ${args.outcome.reason}`,
        error: makeAppError({
          code: "internal",
          detail: args.outcome.reason,
        }),
      };
  }
};

/**
 * Surfaces an operation that the adapter cannot lower into a canonical
 * `PlannedJobStep` in this release — e.g. the missing-arm subagent install
 * isn't wired at v1 (per Phase 3c finding: `install-subagent` isn't in the
 * per-extension handler catalog yet). The caller emits this as a log warning
 * inside the trailing `--fix` summary so the user sees the skip without
 * blocking the rest of the fix plan.
 */
interface UnmappedIntent {
  readonly operationName: string;
  readonly reason: string;
}

type AdapterOutput =
  | { readonly kind: "step"; readonly step: PlannedJobStep }
  | { readonly kind: "unmapped"; readonly unmapped: UnmappedIntent };

const unmapped = (operationName: string, reason: string): AdapterOutput => ({
  kind: "unmapped",
  unmapped: { operationName, reason },
});

/**
 * Lower a single lint-intent `Operation` into a `PlannedJobStep`.
 *
 * Dispatches on `op.name`, re-resolves per-extension `ref`s through the
 * `resolveConfigured*` helpers (which consult the workspace + source
 * providers), and builds the step via the canonical `buildInstallOperation`
 * / `buildUninstallOperation` helpers so the step's `run` closure captures
 * `Manager` + retention-policy services through the normal dependency chain.
 */
type AdapterContext =
  | WorkspaceMutations
  | SourceHostProviders
  | SkillManager
  | PackManager
  | CommandManager
  | McpServerManager
  | FileSystem.FileSystem
  | Path.Path
  | Scope.Scope;

const adaptIntent = (
  op: Operation<string, unknown>,
  args: { readonly workspaceRoot: string },
): Effect.Effect<AdapterOutput, AppError, AdapterContext> =>
  Effect.gen(function* () {
    switch (op.name) {
      case "install-skill": {
        if (!isIntentWithSource(op.args)) {
          return unmapped(op.name, "missing name/source args");
        }
        const mgr = yield* SkillManager;
        const resolved = yield* resolveConfiguredSkill(op.args.name, op.args.source);
        const step = buildInstallOperation(mgr, {
          ref: resolved.ref,
          versionRange: resolved.versionRange,
          force: op.args.force,
        });
        return { kind: "step", step };
      }
      case "uninstall-skill": {
        if (!isIntentWithName(op.args)) {
          return unmapped(op.name, "missing name arg");
        }
        const mgr = yield* SkillManager;
        const retention = yield* makeRetentionPolicy();
        const step = buildUninstallOperation(mgr, retention, {
          target: { type: "skill", name: op.args.name },
        });
        return { kind: "step", step };
      }
      case "install-pack": {
        if (!isIntentWithSource(op.args)) {
          return unmapped(op.name, "missing name/source args");
        }
        const mgr = yield* PackManager;
        const resolved = yield* resolveConfiguredPack(op.args.name, op.args.source);
        const step = buildInstallOperation(mgr, {
          ref: resolved.ref,
          versionRange: resolved.versionRange,
          force: op.args.force,
        });
        return { kind: "step", step };
      }
      case "uninstall-pack": {
        if (!isIntentWithName(op.args)) {
          return unmapped(op.name, "missing name arg");
        }
        const mgr = yield* PackManager;
        const retention = yield* makeRetentionPolicy();
        const ws = yield* WorkspaceMutations;
        const configuredPacks = yield* ws.records.getConfiguredPacks();
        const entry = configuredPacks[op.args.name];
        if (entry === undefined) {
          return unmapped(op.name, `pack "${op.args.name}" not found in settings`);
        }
        const parts = parseRegistrySourcePatternParts(entry.source);
        if (parts === undefined || parts.owner === undefined) {
          return unmapped(
            op.name,
            `pack "${op.args.name}" has non-registry source (${entry.source})`,
          );
        }
        const step = buildUninstallOperation(mgr, retention, {
          target: { type: "pack", name: op.args.name, owner: normalizeHandle(parts.owner) },
        });
        return { kind: "step", step };
      }
      case "install-command": {
        if (!isIntentWithSource(op.args)) {
          return unmapped(op.name, "missing name/source args");
        }
        const mgr = yield* CommandManager;
        const resolved = yield* resolveConfiguredCommand(op.args.name, op.args.source);
        const step = buildInstallOperation(mgr, {
          ref: resolved.ref,
          versionRange: resolved.versionRange,
          force: op.args.force,
        });
        return { kind: "step", step };
      }
      case "uninstall-command": {
        if (!isIntentWithName(op.args)) {
          return unmapped(op.name, "missing name arg");
        }
        const mgr = yield* CommandManager;
        const retention = yield* makeRetentionPolicy();
        const step = buildUninstallOperation(mgr, retention, {
          target: { type: "command", name: op.args.name },
        });
        return { kind: "step", step };
      }
      case "install-mcp-server": {
        if (!isIntentWithSource(op.args)) {
          return unmapped(op.name, "missing name/source args");
        }
        const mgr = yield* McpServerManager;
        const resolved = yield* resolveConfiguredMcpServer(op.args.name, op.args.source);
        const step = buildInstallOperation(mgr, {
          ref: resolved.ref,
          versionRange: resolved.versionRange,
          force: op.args.force,
        });
        return { kind: "step", step };
      }
      case "uninstall-mcp-server": {
        if (!isIntentWithName(op.args)) {
          return unmapped(op.name, "missing name arg");
        }
        const mgr = yield* McpServerManager;
        const retention = yield* makeRetentionPolicy();
        const step = buildUninstallOperation(mgr, retention, {
          target: { type: "mcp-server", name: op.args.name },
        });
        return { kind: "step", step };
      }
      case "sync-mcp-server-agent": {
        if (!isSyncMcpServerAgentIntent(op.args)) {
          return unmapped(op.name, "missing serverName/agentId/scope/force args");
        }
        const intent = op.args;
        const ws = yield* WorkspaceMutations;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const configured = yield* ws.getConfiguredMcpServerEntries();
        const entry = configured[intent.serverName];
        if (entry === undefined) {
          return unmapped(op.name, `MCP server "${intent.serverName}" not found in settings`);
        }
        if (!isInlineMcpServerEntry(entry)) {
          return unmapped(
            op.name,
            `MCP server "${intent.serverName}" is not an inline settings entry`,
          );
        }
        const run = syncInlineMcpServerToAgent(intent.agentId, {
          workspaceRoot: args.workspaceRoot,
          serverName: intent.serverName,
          entry,
          scope: intent.scope,
        }).pipe(
          Effect.map((outcome) =>
            mcpSyncOutcomeResult({
              action: "synchronized",
              serverName: intent.serverName,
              agentId: intent.agentId,
              outcome,
            }),
          ),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        );
        const step: PlannedJobStep = intent.force
          ? {
              key: `mcp-server:${intent.serverName}:${intent.agentId}`,
              readiness: "warn",
              warnMessage: `Overwriting drifted MCP server config for ${intent.agentId}`,
              label: `${intent.agentId} MCP server '${intent.serverName}'`,
              run,
            }
          : {
              key: `mcp-server:${intent.serverName}:${intent.agentId}`,
              readiness: "ready",
              label: `${intent.agentId} MCP server '${intent.serverName}'`,
              run,
            };
        return { kind: "step", step };
      }
      case "remove-mcp-server-agent": {
        if (!isRemoveMcpServerAgentIntent(op.args)) {
          return unmapped(op.name, "missing serverName/agentId/scope args");
        }
        const intent = op.args;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const run = removeMcpServerFromManifest(intent.agentId, {
          workspaceRoot: args.workspaceRoot,
          serverName: intent.serverName,
          scope: intent.scope,
          disableOnly: false,
        }).pipe(
          Effect.map((outcome) =>
            mcpSyncOutcomeResult({
              action: "removed",
              serverName: intent.serverName,
              agentId: intent.agentId,
              outcome,
            }),
          ),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        );
        const step: PlannedJobStep = {
          key: `mcp-server:${intent.serverName}:${intent.agentId}`,
          readiness: "ready",
          label: `${intent.agentId} MCP server '${intent.serverName}'`,
          run,
        };
        return { kind: "step", step };
      }
      case "enable-skill": {
        if (!isIntentWithName(op.args)) {
          return unmapped(op.name, "missing name arg");
        }
        const ws = yield* WorkspaceMutations;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const skillName = op.args.name;
        const step: PlannedJobStep = {
          key: `skill:${skillName}`,
          readiness: "ready",
          label: skillName,
          run: enableSkill({ name: "enable-skill", args: { skillName } }).pipe(
            Effect.provideService(WorkspaceMutations, ws),
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          ),
        };
        return { kind: "step", step };
      }
      case "disable-skill": {
        if (!isIntentWithName(op.args)) {
          return unmapped(op.name, "missing name arg");
        }
        const ws = yield* WorkspaceMutations;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const skillName = op.args.name;
        const step: PlannedJobStep = {
          key: `skill:${skillName}`,
          readiness: "ready",
          label: skillName,
          run: disableSkill({ name: "disable-skill", args: { skillName } }).pipe(
            Effect.provideService(WorkspaceMutations, ws),
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          ),
        };
        return { kind: "step", step };
      }
      case "sync-instruction-target": {
        if (!isSyncInstructionTargetIntent(op.args)) {
          return unmapped(op.name, "missing root/agentId/force args");
        }
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const state = yield* loadInstructionsState(args.workspaceRoot);
        if (Option.isNone(state)) {
          return unmapped(op.name, "instruction-file management is disabled");
        }
        const run = syncInstructionTarget({
          root: op.args.root,
          agentId: op.args.agentId,
          config: state.value.config,
          force: op.args.force,
          dryRun: false,
        }).pipe(
          Effect.map((written) => ({
            result: "success" as const,
            message: Option.isSome(written)
              ? `Updated ${written.value}`
              : "Instruction target already current or not writable without force",
          })),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        );
        const step: PlannedJobStep = op.args.force
          ? {
              key: `instruction:${op.args.root}:${op.args.agentId}`,
              readiness: "warn",
              warnMessage: `Overwriting drifted instruction file for ${op.args.agentId}`,
              label: `${op.args.agentId} instruction file`,
              run,
            }
          : {
              key: `instruction:${op.args.root}:${op.args.agentId}`,
              readiness: "ready",
              label: `${op.args.agentId} instruction file`,
              run,
            };
        return { kind: "step", step };
      }
      case "sync-instructions-gitignore": {
        if (!isSyncInstructionsGitignoreIntent(op.args)) {
          return unmapped(op.name, "missing desired arg");
        }
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const state = yield* loadInstructionsState(args.workspaceRoot);
        if (Option.isNone(state)) {
          return unmapped(op.name, "instruction-file management is disabled");
        }
        const run = syncInstructionsGitignore({
          workspaceRoot: args.workspaceRoot,
          configuredAgents: state.value.configuredAgents,
          config: state.value.config,
          desired: op.args.desired,
          dryRun: false,
        }).pipe(
          Effect.map((written) => ({
            result: "success" as const,
            message: Option.isSome(written)
              ? `Updated ${written.value}`
              : "Instruction gitignore entries already current",
          })),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        );
        const step: PlannedJobStep = {
          key: "instruction:gitignore",
          readiness: "ready",
          label: "instruction gitignore entries",
          run,
        };
        return { kind: "step", step };
      }
      case "enable-command":
      case "disable-command":
      case "enable-subagent":
      case "disable-subagent": {
        // These extension families do not have enable/disable lint-fix
        // adapters yet. Keep them advisory until their handlers are wired.
        return unmapped(
          op.name,
          `enable/disable intents are not wired into --fix; run 'axm ${op.name.replace("-", " ")} ...' manually`,
        );
      }
      default: {
        return unmapped(op.name, "unknown operation");
      }
    }
  });

// -----------------------------------------------------------------------------
// --fix pipeline
// -----------------------------------------------------------------------------

const applyFixes = (args: {
  readonly operations: ReadonlyArray<Operation<string, unknown>>;
  readonly workspaceRoot: string;
}): Effect.Effect<
  { readonly summary: FixSummary; readonly executed: ExecutedPlan },
  AppError,
  | WorkspaceMutations
  | SourceHostProviders
  | CodingAgentRepository
  | SkillManager
  | PackManager
  | CommandManager
  | McpServerManager
  | FileSystem.FileSystem
  | Path.Path
  | Scope.Scope
  | CliRenderer
> =>
  Effect.gen(function* () {
    const adapterResults = yield* Effect.forEach(
      args.operations,
      (op) => adaptIntent(op, { workspaceRoot: args.workspaceRoot }),
      {
        concurrency: "unbounded",
      },
    );

    const steps: Array<PlannedJobStep> = [];
    const unmappedWarnings: Array<string> = [];
    for (const result of adapterResults) {
      if (result.kind === "step") {
        steps.push(result.step);
      } else {
        unmappedWarnings.push(`${result.unmapped.operationName}: ${result.unmapped.reason}`);
      }
    }

    if (steps.length === 0) {
      return {
        summary: {
          attempted: args.operations.length,
          applied: 0,
          failed: 0,
          warnings: unmappedWarnings,
        },
        executed: {
          _tag: "ExecutedPlan" as const,
          name: "Lint autofix",
          description: Option.none(),
          jobs: [],
        },
      };
    }

    const plan = resolvePlan({
      name: "Lint autofix",
      description: "Apply autofixable findings from `axm lint --fix`",
      steps,
    });
    const executed = yield* applyPlan(plan);
    const allSteps = executed.jobs.flatMap((job) => job.steps);
    const applied = allSteps.filter((s) => s.result.result === "success").length;
    const failed = allSteps.filter((s) => s.result.result === "error").length;
    const warnings: Array<string> = [...unmappedWarnings];
    for (const step of allSteps) {
      if (step.result.result === "error") {
        warnings.push(`${step.label}: ${step.result.message}`);
      }
    }
    return {
      summary: {
        attempted: args.operations.length,
        applied,
        failed,
        warnings,
      },
      executed,
    };
  });

// -----------------------------------------------------------------------------
// Output
// -----------------------------------------------------------------------------

const LintJsonDocumentFields = {
  result: Schema.Any,
} satisfies Schema.Struct.Fields;

const LintFixJsonDocumentFields = {
  result: PlanResolutionResultSchema,
  data: Schema.Any,
} satisfies Schema.Struct.Fields;

const emitJsonDocument = (
  doc: LintJsonDocument,
  fixResolution: Option.Option<typeof PlanResolutionResultSchema.Type>,
) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    if (Option.isSome(fixResolution)) {
      return yield* renderer.result(
        { result: fixResolution.value, data: doc },
        Schema.Struct(LintFixJsonDocumentFields),
      );
    }
    return yield* renderer.result({ result: doc }, Schema.Struct(LintJsonDocumentFields));
  });

const emitHumanOutput = (args: {
  readonly summary: LintSummary;
  readonly fixSummary: Option.Option<FixSummary>;
  readonly details: boolean;
}) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const blocks = toLintHumanBlocks({
      summary: args.summary,
      reporter: args.details ? "full" : "grouped",
      ...(Option.isSome(args.fixSummary) ? { fixSummary: args.fixSummary.value } : {}),
    });
    const verbosity = yield* Verbosity;
    if (!verbosity.isAtLeast("normal")) {
      yield* emitQuietHumanOutput(renderer, blocks);
      return;
    }

    yield* Effect.forEach(
      blocks,
      (block) =>
        Effect.gen(function* () {
          switch (block.kind) {
            case "overview":
              yield* emitSummary(renderer, block.message, block.counts);
              yield* Effect.forEach(
                block.notes.filter((note) => !isLintCommandGuidance(note)),
                (note) => renderer.message(note),
                {
                  discard: true,
                },
              );
              return;
            case "blank":
              yield* renderer.message("");
              return;
            case "section": {
              const label =
                block.note !== undefined && !isLintCommandGuidance(block.note)
                  ? `${block.title} (${block.note})`
                  : block.title;
              yield* renderer.step(label);
              return;
            }
            case "diagnostic":
              yield* emitGroupedHumanDiagnostic(renderer, block.diagnostic);
              return;
            case "driftBanner":
              yield* renderer.warn(block.title);
              yield* Effect.forEach(block.ruleIds, (id) => renderer.message(`  ${id}`), {
                discard: true,
              });
              return;
            case "pathGroup":
              yield* renderer.message(block.path);
              yield* Effect.forEach(
                block.diagnostics,
                (diagnostic) => emitFullHumanDiagnostic(renderer, diagnostic),
                {
                  discard: true,
                },
              );
              return;
            case "empty":
              yield* renderer.success(block.message);
              return;
            case "footer":
              return;
            case "fixSummary":
              if (block.summary.failed > 0) {
                yield* renderer.error(block.message);
                yield* Effect.forEach(
                  block.summary.warnings,
                  (warning) => renderer.message(`  warning: ${warning}`),
                  {
                    discard: true,
                  },
                );
                return;
              }
              yield* renderer.success(
                block.message,
                block.summary.warnings.length === 0
                  ? undefined
                  : {
                      summary: block.summary.warnings
                        .map((warning) => `warning: ${warning}`)
                        .join("\n"),
                    },
              );
              return;
          }
        }),
      { discard: true },
    );
    const suggestions = lintSuggestions({
      summary: args.summary,
      fixSummary: args.fixSummary,
      details: args.details,
      blocks,
    });
    if (suggestions.length > 0) {
      yield* renderer.suggestions(suggestions);
    }
  });

const emitQuietHumanOutput = (
  renderer: typeof CliRenderer.Service,
  blocks: ReadonlyArray<LintHumanBlock>,
) =>
  Effect.forEach(
    blocks,
    (block) =>
      Effect.gen(function* () {
        switch (block.kind) {
          case "overview":
            yield* emitSummary(renderer, block.message, block.counts);
            return;
          case "driftBanner":
            yield* renderer.warn(block.title);
            return;
          case "fixSummary":
            if (block.summary.failed > 0) {
              yield* renderer.error(block.message);
              return;
            }
            yield* renderer.success(block.message);
            return;
          default:
            return;
        }
      }),
    { discard: true },
  );

const LINT_FIX_SUGGESTION = {
  description: "Apply auto-fixable lint findings",
  cmd: "axm lint --fix",
} satisfies SuggestedAction;

const LINT_DETAILS_SUGGESTION = {
  description: "Show detailed lint output",
  cmd: "axm lint --details",
} satisfies SuggestedAction;

const LINT_JSON_SUGGESTION = {
  description: "Show machine-readable lint output",
  cmd: "axm lint --json",
} satisfies SuggestedAction;

const BacktickedAxmCommandPattern = /`(axm [^`]+)`/g;

const extractAxmCommands = (message: string): ReadonlyArray<string> => {
  const commands: Array<string> = [];
  for (const match of message.matchAll(BacktickedAxmCommandPattern)) {
    const command = match[1];
    if (command !== undefined) {
      commands.push(command);
    }
  }
  return commands;
};

const isLintCommandGuidance = (message: string): boolean =>
  extractAxmCommands(message).length > 0 ||
  message.includes("axm lint --details") ||
  message.includes("axm lint --json");

const hasAutofixableFindings = (summary: LintSummary): boolean =>
  summary.findings.some((finding) => finding.finding.kind === "autofixable");

const lintCommandSuggestion = (command: string): SuggestedAction | undefined => {
  if (
    command === LINT_FIX_SUGGESTION.cmd ||
    command === LINT_DETAILS_SUGGESTION.cmd ||
    command === LINT_JSON_SUGGESTION.cmd
  ) {
    return undefined;
  }

  if (command === "axm help skills") {
    return {
      description: "Open the skills decision guide",
      cmd: command,
    };
  }

  if (command === "axm prune") {
    return {
      description: "Prune unmanaged extension files",
      cmd: command,
    };
  }

  if (command.startsWith("axm skills install ")) {
    return {
      description: "Adopt an unmanaged skill",
      cmd: command,
    };
  }

  if (command.startsWith("axm install ")) {
    return {
      description: "Install configured missing content",
      cmd: command,
    };
  }

  return {
    description: "Run suggested lint follow-up",
    cmd: command,
  };
};

const collectLintBlockCommands = (blocks: ReadonlyArray<LintHumanBlock>): ReadonlyArray<string> => {
  const commands: Array<string> = [];
  const collectDiagnostic = (diagnostic: LintHumanDiagnostic) => {
    for (const value of [diagnostic.title, ...diagnostic.details, ...diagnostic.helps]) {
      commands.push(...extractAxmCommands(value));
    }
  };

  for (const block of blocks) {
    switch (block.kind) {
      case "overview":
        for (const note of block.notes) {
          commands.push(...extractAxmCommands(note));
        }
        break;
      case "section":
        if (block.note !== undefined) {
          commands.push(...extractAxmCommands(block.note));
        }
        break;
      case "diagnostic":
        collectDiagnostic(block.diagnostic);
        break;
      case "pathGroup":
        for (const diagnostic of block.diagnostics) {
          collectDiagnostic(diagnostic);
        }
        break;
      case "footer":
        commands.push(...extractAxmCommands(block.message));
        break;
      case "fixSummary":
        for (const warning of block.summary.warnings) {
          commands.push(...extractAxmCommands(warning));
        }
        break;
      case "driftBanner":
      case "blank":
      case "empty":
        break;
    }
  }

  return commands;
};

const lintSuggestions = (args: {
  readonly summary: LintSummary;
  readonly fixSummary: Option.Option<FixSummary>;
  readonly details: boolean;
  readonly blocks: ReadonlyArray<LintHumanBlock>;
}): ReadonlyArray<SuggestedAction> => {
  if (args.summary.findings.length === 0) {
    return [];
  }

  const suggestions: Array<SuggestedAction> = [];
  const seenCommands = new Set<string>();
  const pushSuggestion = (suggestion: SuggestedAction) => {
    const key = suggestion.cmd ?? suggestion.url ?? suggestion.description;
    if (seenCommands.has(key)) {
      return;
    }
    seenCommands.add(key);
    suggestions.push(suggestion);
  };

  if (hasAutofixableFindings(args.summary) && Option.isNone(args.fixSummary)) {
    pushSuggestion(LINT_FIX_SUGGESTION);
  }
  if (!args.details) {
    pushSuggestion(LINT_DETAILS_SUGGESTION);
  }
  pushSuggestion(LINT_JSON_SUGGESTION);

  for (const command of collectLintBlockCommands(args.blocks)) {
    const suggestion = lintCommandSuggestion(command);
    if (suggestion !== undefined) {
      pushSuggestion(suggestion);
    }
  }
  return suggestions;
};

const emitFullHumanDiagnostic = (
  renderer: typeof CliRenderer.Service,
  diagnostic: LintHumanDiagnostic,
) =>
  Effect.gen(function* () {
    const label = `${diagnostic.ruleId}${diagnostic.fixable ? " (auto-fixable)" : ""}: ${diagnostic.title}`;
    switch (diagnostic.severity) {
      case "error":
        yield* renderer.error(label);
        break;
      case "warning":
        yield* renderer.warn(label);
        break;
      case "info":
        yield* renderer.info(label);
        break;
    }
    yield* Effect.forEach(diagnostic.details, (detail) => renderer.message(`  - ${detail}`), {
      discard: true,
    });
    yield* Effect.forEach(
      diagnostic.helps.filter((help) => !isLintCommandGuidance(help)),
      (help) => renderer.message(`  ${help}`),
      {
        discard: true,
      },
    );
  });

const emitGroupedHumanDiagnostic = (
  renderer: typeof CliRenderer.Service,
  diagnostic: LintHumanDiagnostic,
) =>
  Effect.gen(function* () {
    const location =
      diagnostic.paths.length === 1
        ? (diagnostic.paths[0] ?? "")
        : diagnostic.paths.length > 1
          ? `(${diagnostic.paths.length} locations)`
          : "(workspace)";
    switch (diagnostic.severity) {
      case "error":
        yield* renderer.error(location);
        break;
      case "warning":
        yield* renderer.warn(location);
        break;
      case "info":
        yield* renderer.info(location);
        break;
    }
    yield* renderer.message(
      `  rule: ${diagnostic.ruleId}${diagnostic.fixable ? " (auto-fixable)" : ""}`,
    );
    yield* renderer.message(`  ${diagnostic.title}`);
    yield* Effect.forEach(diagnostic.details, (detail) => renderer.message(`  - ${detail}`), {
      discard: true,
    });
    yield* Effect.forEach(
      diagnostic.helps.filter((help) => !isLintCommandGuidance(help)),
      (help) => renderer.message(`  ${help}`),
      {
        discard: true,
      },
    );
  });

const emitSummary = (
  renderer: typeof CliRenderer.Service,
  message: string,
  counts: LintSummary["counts"],
) => {
  if (counts.errors > 0) {
    return renderer.error(message);
  }
  if (counts.warnings > 0) {
    return renderer.warn(message);
  }
  return renderer.info(message);
};

// -----------------------------------------------------------------------------
// Handler entry point
// -----------------------------------------------------------------------------

export const handleLint = Effect.fn("Lint.handle")(function* (args: HandleLintArgs) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspaceRoot = yield* resolveLintRootEffect({
    pathArg: args.pathArg,
    scope: args.scope,
  });

  // -- Load settings + lockfile + config --
  const config = yield* loadLintConfig(workspaceRoot);

  // -- Build WorkspaceReadModel-backed rule contexts --
  const userHome = args.scope === "user" ? workspaceRoot : yield* Effect.sync(() => os.homedir());
  const { rule: workspaceContext, view } = yield* buildLintWorkspace({
    platform: { fs, path },
    workspaceRoot,
    userHome,
    scope: args.scope,
  }).pipe(
    Effect.catchTag("WorkspaceRootEscape", (e) =>
      Effect.fail(
        makeAppError({
          code: "validation",
          detail: `Workspace root '${e.workspaceRoot}' escapes allowed root '${e.allowedRoot}'`,
        }),
      ),
    ),
  );
  const skillContexts = buildSkillRuleContexts(view);
  const packContexts = buildPackRuleContexts(view);

  // -- Evaluate --
  const evaluations = yield* evaluateAllCatalogs({
    skillContexts,
    packContexts,
    commandContexts: view.commandContexts,
    subagentContexts: view.subagentContexts,
    mcpServerContexts: view.mcpServerContexts,
    fileContexts: view.fileContexts,
    workspaceContext,
    config,
  });
  const summary = summarizeEvaluations(evaluations, config);

  // -- Apply fixes (optional) --
  let fixSummary: Option.Option<FixSummary> = Option.none();
  let fixResolution = Option.none<typeof PlanResolutionResultSchema.Type>();
  if (args.fix) {
    const autofixable = collectAutofixableEntries(evaluations);
    const opsEffect = Effect.forEach(
      autofixable,
      (entry) => entry.rule.fix(entry.context, entry.finding),
      { concurrency: "unbounded" },
    );
    const opsBatches = yield* opsEffect;
    const seen = new Set<string>();
    const operations: Array<Operation<string, unknown>> = [];
    for (const batch of opsBatches) {
      for (const op of batch) {
        const key = JSON.stringify(op);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        operations.push(op);
      }
    }
    const { summary: fixResult, executed } = yield* applyFixes({ operations, workspaceRoot });
    fixSummary = Option.some(fixResult);
    fixResolution = Option.some(toPlanResolutionResult(executed));
  }

  // -- Emit output --
  const handledByMachine = yield* emitJsonDocument(
    toLintJsonDocument({
      summary,
      ...(Option.isSome(fixSummary) ? { fixSummary: fixSummary.value } : {}),
    }),
    fixResolution,
  );
  if (!handledByMachine) {
    yield* emitHumanOutput({
      summary,
      fixSummary,
      details: args.details,
    });
  }

  // -- Translate exit category into exit code --
  // If --fix applied successfully, re-derive the exit category by checking
  // for any remaining failed operations; otherwise the category is the
  // pre-fix summary (consistent with "axm lint --fix" surfacing original
  // issues, even if all were resolved).
  const category = summary.exitCategory;
  const outcome = resolveLintExitCategory({ category, strict: args.strict });
  const fixFailed = Option.match(fixSummary, {
    onNone: () => false,
    onSome: (s) => s.failed > 0,
  });
  if (outcome === "fail" || fixFailed) {
    return yield* Effect.die(effectCliExit(ExitCode.Issues));
  }
});
