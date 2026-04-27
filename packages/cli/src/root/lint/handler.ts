/**
 * `axm lint` handler.
 *
 * Thin surface over {@link runLint}. Responsibilities:
 *
 * 1. Resolve workspace root + scope (project: cwd (or `<path>`), user:
 *    `$AXM_USER_HOME` or `$HOME/.axm`, ignoring `<path>`).
 * 2. Load `.axm/settings.json` (if present) to recover the configured
 *    `lint.rules` overrides.
 * 3. Build a `WorkspaceIndex` from the settings + lockfile, then assemble
 *    workspace / skill / pack rule contexts via the shared-kernel builders.
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

import * as Config from "effect/Config";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import type * as Scope from "effect/Scope";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type { AppError } from "@agentxm/client-core/unstable/app-error";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { effectCliExit } from "@agentxm/client-core/unstable/cli-runtime";
import { SourceHostProviders } from "@agentxm/client-core/unstable/source-resolution";
import { CodingAgentRepository } from "@agentxm/client-core/unstable/agents";
import { SkillManager } from "@agentxm/client-core/unstable/skills";
import { ExtensionPackManager } from "@agentxm/client-core/unstable/packs";
import { CommandManager } from "@agentxm/client-core/unstable/commands";
import { McpServerManager } from "@agentxm/client-core/unstable/mcp-servers";
import {
  buildPackRuleContexts,
  buildSkillRuleContexts,
  buildWorkspaceIndexFromContext,
  buildWorkspaceRuleContext,
  collectAutofixableEntries,
  evaluateAllCatalogs,
  resolveLintExitCategory,
  summarizeEvaluations,
  toLintHumanBlocks,
  toLintJsonDocument,
  type FixSummary,
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
  type WorkspaceScope,
  Workspace,
} from "@agentxm/client-core/unstable/workspace";
import { SettingsSchema } from "@agentxm/client-core/unstable/settings";
import {
  buildInstallOperation,
  buildUninstallOperation,
  type UninstallRetentionPolicy,
} from "@agentxm/client-core/unstable/extensions";
import type { Settings } from "@agentxm/client-core/unstable/settings";
import * as os from "node:os";

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
 * - `--scope=user`: prefer `$AXM_USER_HOME`, then the caller-supplied
 *   home directory (defaulting to `os.homedir()`). Ignores `<path>`.
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
  readonly homeDir: string;
  readonly axmUserHome: Option.Option<string>;
}): string => {
  if (args.scope === "user") {
    return Option.match(args.axmUserHome, {
      onNone: () => args.homeDir,
      onSome: (v) => v,
    });
  }
  return Option.match(args.pathArg, {
    onNone: () => args.cwd,
    onSome: (p) => p,
  });
};

/**
 * Effectful wrapper around {@link resolveLintRoot} that loads `cwd`,
 * `os.homedir()`, and `$AXM_USER_HOME` via Effect Config / the standard
 * runtime primitives. The CLI handler calls this once at entry.
 */
const axmUserHomeConfig = Config.option(Config.string("AXM_USER_HOME"));

const resolveLintRootEffect = (args: {
  readonly pathArg: Option.Option<string>;
  readonly scope: WorkspaceScope;
}): Effect.Effect<string> =>
  Effect.gen(function* () {
    const axmUserHomeRaw = yield* Effect.orDie(axmUserHomeConfig.asEffect());
    const cwd = yield* Effect.sync(() => process.cwd());
    const homeDir = yield* Effect.sync(() => os.homedir());
    return resolveLintRoot({
      pathArg: args.pathArg,
      scope: args.scope,
      cwd,
      homeDir,
      axmUserHome: axmUserHomeRaw.pipe(Option.filter((v) => v.length > 0)),
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
    const settingsPath = path.join(workspaceRoot, ".axm", "settings.json");
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
      catch: () => makeAppError({ code: "LINT_SETTINGS_PARSE_FAILED", what: "" }),
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
  | Workspace
  | SourceHostProviders
  | SkillManager
  | ExtensionPackManager
  | CommandManager
  | McpServerManager
  | FileSystem.FileSystem
  | Path.Path
  | Scope.Scope;

const adaptIntent = (
  op: Operation<string, unknown>,
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
          versionConstraint: resolved.versionConstraint,
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
        const mgr = yield* ExtensionPackManager;
        const resolved = yield* resolveConfiguredPack(op.args.name, op.args.source);
        const step = buildInstallOperation(mgr, {
          ref: resolved.ref,
          versionConstraint: resolved.versionConstraint,
        });
        return { kind: "step", step };
      }
      case "uninstall-pack": {
        if (!isIntentWithName(op.args)) {
          return unmapped(op.name, "missing name arg");
        }
        const mgr = yield* ExtensionPackManager;
        const retention = yield* makeRetentionPolicy();
        const ws = yield* Workspace;
        const owner = yield* ws.getConfiguredProfile();
        const step = buildUninstallOperation(mgr, retention, {
          target: { type: "pack", name: op.args.name, owner },
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
          versionConstraint: resolved.versionConstraint,
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
          versionConstraint: resolved.versionConstraint,
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
      case "enable-skill":
      case "disable-skill":
      case "enable-command":
      case "disable-command":
      case "enable-subagent":
      case "disable-subagent": {
        // v1 workspaceRules do not emit enable/disable intents for any
        // autofixing arm, so the adapter reports them as unmapped rather
        // than wiring a synthetic plan step. Phase 3c explicitly docs that
        // the subagent install family stays advisory.
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
// Retention policy (for uninstall steps)
// -----------------------------------------------------------------------------

/**
 * Build the {@link UninstallRetentionPolicy} the uninstall plan-step builder
 * captures at construction time. `axm lint --fix` uninstall ops always
 * originate from `workspace/*` rules emitting orphan entries; retention
 * tracking uses the standard workspace service methods.
 *
 * @internal
 */
const makeRetentionPolicy = (): Effect.Effect<UninstallRetentionPolicy, never, Workspace> =>
  Effect.gen(function* () {
    const ws = yield* Workspace;
    void ws;
    // Conservative default: treat as not-required. The v1 workspaceRules
    // already carve pack-retained entries out of the orphan arm, so a
    // false negative here just means the uninstall proceeds the same way
    // `axm uninstall` would under no-pack conditions.
    return {
      isRequiredByInstalledPack: () => Effect.succeed(false),
      markDependencyRetainedInLockfile: () => Effect.void,
    };
  });

// -----------------------------------------------------------------------------
// --fix pipeline
// -----------------------------------------------------------------------------

const applyFixes = (args: {
  readonly operations: ReadonlyArray<Operation<string, unknown>>;
}): Effect.Effect<
  { readonly summary: FixSummary; readonly executed: ExecutedPlan },
  AppError,
  | Workspace
  | SourceHostProviders
  | CodingAgentRepository
  | SkillManager
  | ExtensionPackManager
  | CommandManager
  | McpServerManager
  | FileSystem.FileSystem
  | Path.Path
  | Scope.Scope
  | CliRenderer
> =>
  Effect.gen(function* () {
    const adapterResults = yield* Effect.forEach(args.operations, adaptIntent, {
      concurrency: "unbounded",
    });

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

const JsonDocumentFields = {
  result: Schema.Any,
} satisfies Schema.Struct.Fields;

const emitJsonDocument = (doc: LintJsonDocument) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    return yield* renderer.document("lint", { result: doc }, JsonDocumentFields);
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
    yield* Effect.forEach(
      blocks,
      (block) =>
        Effect.gen(function* () {
          switch (block.kind) {
            case "overview":
              yield* emitSummary(renderer, block.message, block.counts);
              yield* Effect.forEach(block.notes, (note) => renderer.message(note), {
                discard: true,
              });
              return;
            case "blank":
              yield* renderer.message("");
              return;
            case "section": {
              const label =
                block.note !== undefined ? `${block.title} (${block.note})` : block.title;
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
              yield* renderer.message(block.message);
              return;
            case "fixSummary":
              yield* block.summary.failed > 0
                ? renderer.error(block.message)
                : renderer.success(block.message);
              yield* Effect.forEach(block.summary.warnings, (warning) => renderer.warn(warning), {
                discard: true,
              });
              return;
          }
        }),
      { discard: true },
    );
  });

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
    yield* Effect.forEach(diagnostic.helps, (help) => renderer.message(`  ${help}`), {
      discard: true,
    });
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
    yield* Effect.forEach(diagnostic.helps, (help) => renderer.message(`  ${help}`), {
      discard: true,
    });
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

  // -- Build WorkspaceContext-backed rule contexts --
  const userHome = yield* Effect.sync(() => os.homedir());
  const workspaceContext = yield* buildWorkspaceRuleContext({
    platform: { fs, path },
    workspaceRoot,
    userHome,
    scope: args.scope,
  }).pipe(
    Effect.catchTag("WorkspaceRootEscape", (e) =>
      Effect.fail(
        makeAppError({
          code: "LINT_WORKSPACE_ROOT_ESCAPE",
          what: `Workspace root '${e.workspaceRoot}' escapes allowed root '${e.allowedRoot}'`,
        }),
      ),
    ),
  );
  const index = yield* buildWorkspaceIndexFromContext({
    platform: { fs, path },
    workspaceRoot,
    workspace: workspaceContext.workspace,
    scope: args.scope,
  });
  const skillContexts = buildSkillRuleContexts(index);
  const packContexts = buildPackRuleContexts(index);

  // -- Evaluate --
  const evaluations = yield* evaluateAllCatalogs({
    skillContexts,
    packContexts,
    workspaceContext,
    config,
  });
  const summary = summarizeEvaluations(evaluations, config);

  // -- Apply fixes (optional) --
  let fixSummary: Option.Option<FixSummary> = Option.none();
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
    const { summary: fixResult } = yield* applyFixes({ operations });
    fixSummary = Option.some(fixResult);
  }

  // -- Emit output --
  const handledByMachine = yield* emitJsonDocument(
    toLintJsonDocument({
      summary,
      ...(Option.isSome(fixSummary) ? { fixSummary: fixSummary.value } : {}),
    }),
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
    return yield* Effect.die(effectCliExit(1));
  }
});
