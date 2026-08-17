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
 * 4. Evaluate and render the current workspace facts.
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
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { ExitCode, makeAppError } from "@agentxm/client-core/unstable/app-error";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { Verbosity } from "@agentxm/client-core/unstable/cli-flags";
import { effectCliExit } from "@agentxm/client-core/unstable/cli-runtime";
import { HookManager } from "@agentxm/client-core/unstable/hooks";
import { RuleManager } from "@agentxm/client-core/unstable/rules";
import { AxmSkillCompatibilityPolicy } from "@agentxm/client-core/unstable/skills";
import {
  buildLintWorkspace,
  buildPackRuleContexts,
  buildSkillRuleContexts,
  composePath,
  evaluateAllCatalogs,
  resolveLintExitCategory,
  summarizeEvaluations,
  toLintHumanBlocks,
  toLintJsonDocument,
  type LintHumanBlock,
  type LintHumanDiagnostic,
  LintJsonDocumentSchema,
  type LintJsonDocument,
  type LintInput,
  type LintSummary,
} from "@agentxm/client-core/unstable/lint";
import type { LintConfig } from "@agentxm/client-core/unstable/lint";
import {
  AXM_DIR_NAME,
  WorkspaceMutations,
  getUserScopeDir,
  acceptedCanonicalObservation,
  type WorkspaceScope,
} from "@agentxm/client-core/unstable/workspace";
import { SettingsSchema } from "@agentxm/client-core/unstable/settings";
import type { Settings } from "@agentxm/client-core/unstable/settings";
import * as os from "node:os";
import { ExecutionDirectory } from "../../execution-directory.js";

// -----------------------------------------------------------------------------
// Handler args
// -----------------------------------------------------------------------------

export interface HandleLintArgs {
  readonly pathArg: Option.Option<string>;
  readonly scope: WorkspaceScope;
  readonly strict: boolean;
  readonly details: boolean;
  readonly input: LintInput;
  readonly displayWorkspaceRoot?: string;
  readonly ruleOverrides?: LintConfig["rules"];
}

type PathRemapper = Pick<Path.Path, "isAbsolute" | "join" | "relative">;

const remapAbsolutePath = (
  value: string,
  sourceRoot: string,
  displayRoot: string,
  path: PathRemapper,
): string => {
  if (!path.isAbsolute(value)) return value;
  const relative = path.relative(sourceRoot, value);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return value;
  return relative === "" ? displayRoot : path.join(displayRoot, relative);
};

/** Replace temporary staged-snapshot roots without changing lint semantics. */
export const remapLintSummaryPaths = (
  summary: LintSummary,
  sourceRoot: string,
  displayRoot: string,
  path: PathRemapper,
): LintSummary => ({
  ...summary,
  findings: summary.findings.map((entry) => {
    const remappedDisplayRoot = remapAbsolutePath(entry.displayRoot, sourceRoot, displayRoot, path);
    const location = entry.finding.location;
    const remappedLocation =
      location === undefined
        ? undefined
        : {
            ...location,
            file: remapAbsolutePath(location.file, sourceRoot, displayRoot, path),
          };
    return {
      ...entry,
      displayRoot: remappedDisplayRoot,
      path: composePath(remappedDisplayRoot, remappedLocation),
      finding:
        remappedLocation === undefined
          ? entry.finding
          : { ...entry.finding, location: remappedLocation },
    };
  }),
});

// -----------------------------------------------------------------------------
// Root resolution
// -----------------------------------------------------------------------------

/**
 * Resolve the workspace root for a lint run.
 *
 * - `--scope=project` (default): use the optional `<path>` argument if
 *   provided, otherwise the caller-supplied `cwd` (defaulting to
 *   the invocation execution directory when loaded via {@link resolveLintRootEffect}).
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
    const executionDirectory = yield* ExecutionDirectory;
    const userScopeDir = yield* getUserScopeDir();
    return resolveLintRoot({
      pathArg: args.pathArg,
      scope: args.scope,
      cwd: executionDirectory.path,
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

const isLintCommandGuidance = (message: string): boolean => message.includes("axm ");

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

// -----------------------------------------------------------------------------
// Output
// -----------------------------------------------------------------------------

const LintJsonDocumentFields = {
  result: LintJsonDocumentSchema,
} satisfies Schema.Struct.Fields;
export const LintResultDocumentSchema = Schema.Struct(LintJsonDocumentFields);
export type LintResultDocument = typeof LintResultDocumentSchema.Type;

const emitJsonDocument = (doc: LintJsonDocument, ok: boolean) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    return yield* renderer.result({ result: doc }, LintResultDocumentSchema, { ok });
  });

const emitHumanOutput = (args: { readonly summary: LintSummary; readonly details: boolean }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const blocks = toLintHumanBlocks({
      summary: args.summary,
      reporter: args.details ? "full" : "grouped",
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
          }
        }),
      { discard: true },
    );
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
          default:
            return;
        }
      }),
    { discard: true },
  );

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
  const axmSkillCompatibilityPolicy = yield* AxmSkillCompatibilityPolicy;
  const ws = yield* WorkspaceMutations;
  const workspaceRoot = yield* resolveLintRootEffect({
    pathArg: args.pathArg,
    scope: args.scope,
  });

  // -- Load settings + lockfile + config --
  const loadedConfig = yield* loadLintConfig(workspaceRoot);
  const config =
    args.ruleOverrides === undefined
      ? loadedConfig
      : ({
          rules: { ...loadedConfig.rules, ...args.ruleOverrides },
        } satisfies LintConfig);

  // -- Build WorkspaceReadModel-backed rule contexts --
  const userHome = args.scope === "user" ? workspaceRoot : yield* Effect.sync(() => os.homedir());
  const ruleManager = yield* RuleManager;
  const hookManager = yield* HookManager;
  const { rule: workspaceContext, view } = yield* buildLintWorkspace({
    platform: { fs, path },
    workspaceRoot,
    userHome,
    scope: args.scope,
    axmSkillCompatibilityPolicy,
    owner: ws.getConfiguredOwner().pipe(Effect.catch(() => Effect.succeed(Option.none()))),
    // Read-back currency for aggregate managed units. A failed judgment (for
    // example an incomplete desired-state graph) yields no verdict so the
    // projections rule suppresses instead of duplicating root-cause findings.
    projections: {
      rulesRegionCurrent: ruleManager.instructionsRegionCurrent.pipe(
        Effect.map(Option.some),
        Effect.catch(() => Effect.succeed(Option.none<boolean>())),
      ),
      hooksProjectionsCurrent: hookManager.hooksProjectionCurrent.pipe(
        Effect.map(Option.some),
        Effect.catch(() => Effect.succeed(Option.none<boolean>())),
      ),
    },
  }).pipe(
    Effect.catchTag("WorkspaceRootEscape", (e) =>
      Effect.fail(
        makeAppError({
          code: "validation",
          detail: `Workspace root '${e.workspaceRoot}' escapes allowed root '${e.allowedRoot}'`,
        }),
      ),
    ),
    Effect.catchTags({
      SettingsIoError: (error) =>
        makeAppError({
          code: "validation",
          detail: `Unable to read workspace settings at '${error.path}'`,
        }),
      SettingsParseError: (error) =>
        makeAppError({
          code: "validation",
          detail: `Workspace settings at '${error.path}' are not valid JSON`,
        }),
      SettingsDecodeError: (error) =>
        makeAppError({
          code: "validation",
          detail: `Workspace settings at '${error.path}' are invalid: ${error.issues.join("; ")}`,
        }),
      LockfileIoError: (error) =>
        makeAppError({
          code: "validation",
          detail: `Unable to read workspace lockfile at '${error.path}'`,
        }),
      LockfileParseError: (error) =>
        makeAppError({
          code: "validation",
          detail: `Workspace lockfile at '${error.path}' is not valid YAML`,
        }),
      LockfileDecodeError: (error) =>
        makeAppError({
          code: "validation",
          detail: `Workspace lockfile at '${error.path}' is invalid: ${error.issues.join("; ")}`,
        }),
    }),
  );
  const skillContexts = buildSkillRuleContexts(view);
  const packContexts = buildPackRuleContexts(view);
  const canonicalObservations = Effect.gen(function* () {
    const graph = yield* ws.getDesiredStateGraph();
    return yield* Effect.forEach(
      graph.nodes,
      (node) =>
        Effect.gen(function* () {
          const accepted = yield* acceptedCanonicalObservation({
            workspace: ws,
            type: node.type,
            name: node.name,
          });
          if (Option.isNone(accepted)) {
            return yield* makeAppError({
              code: "internal",
              detail: `Desired extension disappeared while linting: ${node.type}:${node.name}`,
            });
          }
          return { desired: node, observation: accepted.value.observation };
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Path.Path, path),
        ),
      { concurrency: 16 },
    );
  });
  const workspaceHealthContext = {
    ...workspaceContext,
    health: {
      desiredState: ws.getDesiredStateGraph(),
      canonicalObservations,
    },
  };

  // -- Evaluate --
  const evaluations = yield* evaluateAllCatalogs({
    view: args.input.view,
    contexts: {
      skill: skillContexts,
      pack: packContexts,
      subagent: view.subagentContexts,
      "mcp-server": view.mcpServerContexts,
      rule: view.ruleContexts,
      hook: view.hookContexts,
      knowledge: view.knowledgeContexts,
      workspace: [workspaceHealthContext],
    },
    config,
  });
  const rawSummary = summarizeEvaluations(evaluations, config);
  const summary =
    args.displayWorkspaceRoot === undefined
      ? rawSummary
      : remapLintSummaryPaths(rawSummary, workspaceRoot, args.displayWorkspaceRoot, path);

  // -- Resolve the semantic outcome before emitting the machine document so
  // its `ok` field and the eventual process exit code cannot disagree. --
  const category = summary.exitCategory;
  const outcome = resolveLintExitCategory({ category, strict: args.strict });
  const ok = outcome !== "fail";

  // -- Emit output --
  const handledByMachine = yield* emitJsonDocument(
    toLintJsonDocument({
      summary,
      input: args.input,
    }),
    ok,
  );
  if (!handledByMachine) {
    yield* emitHumanOutput({
      summary,
      details: args.details,
    });
  }

  // -- Translate exit category into exit code --
  if (outcome === "fail") {
    return yield* Effect.die(effectCliExit(ExitCode.Issues));
  }
});
